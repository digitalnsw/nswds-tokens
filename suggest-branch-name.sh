#!/usr/bin/env bash
set -euo pipefail

BASE_REQUIRED_CMDS=(git sed grep awk tr head wc paste cut sort uniq)
for cmd in "${BASE_REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf "❌ Missing dependency: %s\n" "$cmd" >&2
    exit 1
  fi
done

usage() {
  cat <<'EOF'
Usage: ./suggest-branch-name.sh [--issue <id> | --ticket <id>] [--staged] [--create]

Options:
  --issue <id>   Require /issue/<id>/ in the suggested branch name.
  --ticket <id>  Require /ticket/<id>/ in the suggested branch name.
  --staged       Use staged changes only (default: all tracked changes vs HEAD + untracked files).
  --create       Create and checkout the suggested branch after validation.
  -h, --help     Show this help.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
issue_kind=""
issue_id=""
staged_only="false"
create_branch="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        printf "❌ --issue requires a value.\n" >&2
        exit 1
      fi
      issue_kind="issue"
      issue_id="${2:-}"
      shift 2
      ;;
    --ticket)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        printf "❌ --ticket requires a value.\n" >&2
        exit 1
      fi
      issue_kind="ticket"
      issue_id="${2:-}"
      shift 2
      ;;
    --staged)
      staged_only="true"
      shift
      ;;
    --create)
      create_branch="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf "❌ Unknown option: %s\n\n" "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

CONVENTIONAL_CONFIG_SCRIPT="${SCRIPT_DIR}/conventional-commit-config.sh"
if [[ ! -f "$CONVENTIONAL_CONFIG_SCRIPT" ]]; then
  printf "❌ Helper script not found: %s\n" "$CONVENTIONAL_CONFIG_SCRIPT" >&2
  exit 1
fi
if [[ ! -x "$CONVENTIONAL_CONFIG_SCRIPT" ]]; then
  printf "❌ Helper script is not executable: %s\n" "$CONVENTIONAL_CONFIG_SCRIPT" >&2
  printf "   Try: chmod +x \"%s\"\n" "$CONVENTIONAL_CONFIG_SCRIPT" >&2
  exit 1
fi

CONVENTIONAL_COMMIT_TYPES_CSV="$("$CONVENTIONAL_CONFIG_SCRIPT" csv)"

USE_OPENAI_API="true"
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  printf "ℹ️ OPENAI_API_KEY is not set; skipping AI suggestion and using fallback.\n" >&2
  USE_OPENAI_API="false"
fi

OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-140}"
if [[ "$USE_OPENAI_API" == "true" ]] && ! [[ "$OPENAI_MAX_OUTPUT_TOKENS" =~ ^[1-9][0-9]*$ ]]; then
  printf "❌ OPENAI_MAX_OUTPUT_TOKENS must be a positive integer.\n" >&2
  exit 1
fi

if [[ "$USE_OPENAI_API" == "true" ]]; then
  OPENAI_REQUIRED_CMDS=(jq curl)
  for cmd in "${OPENAI_REQUIRED_CMDS[@]}"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      printf "❌ Missing dependency for OpenAI mode: %s\n" "$cmd" >&2
      exit 1
    fi
  done

  CURL_FAIL_FLAG="--fail-with-body"
  if ! curl --help all 2>/dev/null | grep -q -- '--fail-with-body'; then
    CURL_FAIL_FLAG="--fail"
  fi
fi

# Mirrors .github/workflows/validate-branch-name.yml.
BRANCH_REGEX='^(feature|bugfix|hotfix|release|docs|build|test|refactor|chore)(/(issue|ticket)/[A-Za-z0-9_-]+)?/[a-z0-9-]+$'
SNYK_REGEX='^snyk-upgrade-[0-9a-f]{32}$'
BRANCH_TYPES_CSV='feature, bugfix, hotfix, release, docs, build, test, refactor, chore'
MAX_DIFF_PREVIEW_LINES=1500
MAX_DIFF_SCAN_LINES=5000

if [[ -n "$issue_id" ]] && ! [[ "$issue_id" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf "❌ Invalid issue/ticket id: %s (allowed: [A-Za-z0-9_-])\n" "$issue_id" >&2
  exit 1
fi

OPENCOMMIT_IGNORE_FILE="${OPENCOMMIT_IGNORE_FILE:-${SCRIPT_DIR}/.opencommitignore}"
opencommit_ignore_enabled="false"
if [[ -f "$OPENCOMMIT_IGNORE_FILE" ]]; then
  opencommit_ignore_enabled="true"
fi

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  base_ref="HEAD"
else
  base_ref="$(git hash-object -t tree /dev/null)"
fi

if [[ "$staged_only" == "true" ]]; then
  raw_changed_files="$(git diff --name-only --cached || true)"
  raw_untracked_files=""
else
  raw_changed_files="$(git diff --name-only "$base_ref" || true)"
  raw_untracked_files="$(git ls-files --others --exclude-standard || true)"
fi

changed_files=""
untracked_files=""
ignored_paths=""

if [[ "$opencommit_ignore_enabled" == "true" ]]; then
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if git -c core.excludesFile="$OPENCOMMIT_IGNORE_FILE" check-ignore --no-index -q -- "$path"; then
      if [[ -n "$ignored_paths" ]]; then
        ignored_paths="${ignored_paths}"$'\n'
      fi
      ignored_paths="${ignored_paths}${path}"
    else
      if [[ -n "$changed_files" ]]; then
        changed_files="${changed_files}"$'\n'
      fi
      changed_files="${changed_files}${path}"
    fi
  done <<< "$raw_changed_files"

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if git -c core.excludesFile="$OPENCOMMIT_IGNORE_FILE" check-ignore --no-index -q -- "$path"; then
      if [[ -n "$ignored_paths" ]]; then
        ignored_paths="${ignored_paths}"$'\n'
      fi
      ignored_paths="${ignored_paths}${path}"
    else
      if [[ -n "$untracked_files" ]]; then
        untracked_files="${untracked_files}"$'\n'
      fi
      untracked_files="${untracked_files}${path}"
    fi
  done <<< "$raw_untracked_files"
else
  changed_files="$raw_changed_files"
  untracked_files="$raw_untracked_files"
fi

changed_files="$(printf '%s\n' "$changed_files" | sed '/^$/d')"
untracked_files="$(printf '%s\n' "$untracked_files" | sed '/^$/d')"
ignored_paths="$(printf '%s\n' "$ignored_paths" | sed '/^$/d')"
if [[ -n "$ignored_paths" ]]; then
  ignored_paths_count="$(printf '%s\n' "$ignored_paths" | wc -l | tr -d ' ')"
else
  ignored_paths_count=0
fi

declare -a changed_files_arr=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  changed_files_arr+=("$path")
done <<< "$changed_files"

full_diff=""
if (( ${#changed_files_arr[@]} > 0 )); then
  if [[ "$staged_only" == "true" ]]; then
    full_diff="$(git diff --cached -- "${changed_files_arr[@]}" | sed -n "1,${MAX_DIFF_SCAN_LINES}p" || true)"
  else
    full_diff="$(git diff "$base_ref" -- "${changed_files_arr[@]}" | sed -n "1,${MAX_DIFF_SCAN_LINES}p" || true)"
  fi
fi

# If there are only untracked files, synthesize a compact diff-like context.
if [[ -z "$full_diff" && -z "$changed_files" && -n "$untracked_files" ]]; then
  full_diff="# Synthetic diff for untracked files"
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    full_diff+=$'\n'"diff --git a/$path b/$path"
    full_diff+=$'\n'"new file mode 100644"
    full_diff+=$'\n'"--- /dev/null"
    full_diff+=$'\n'"+++ b/$path"
    full_diff+=$'\n'
  done <<< "$untracked_files"
fi

if [[ -z "$changed_files" && -z "$untracked_files" ]]; then
  if [[ "$opencommit_ignore_enabled" == "true" && "$ignored_paths_count" -gt 0 ]]; then
    printf "❌ No code changes detected after applying %s (%s paths ignored).\n" "$OPENCOMMIT_IGNORE_FILE" "$ignored_paths_count" >&2
  else
    printf "❌ No code changes detected.\n" >&2
  fi
  exit 1
fi

if [[ "$opencommit_ignore_enabled" == "true" && "$ignored_paths_count" -gt 0 ]]; then
  printf "ℹ️ Applied %s: ignored %s path(s).\n" "$OPENCOMMIT_IGNORE_FILE" "$ignored_paths_count"
fi

SENSITIVE_REGEX='(-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|password[[:space:]]*[:=]|api[_-]?key[[:space:]]*[:=]|secret[[:space:]]*[:=]|token[[:space:]]*[:=]|authorization[[:space:]]*[:=])'
if [[ "$USE_OPENAI_API" == "true" ]] && printf '%s\n' "$full_diff" | grep -Eqi "$SENSITIVE_REGEX"; then
  printf "⚠️ Potential secrets detected in the diff.\n"
  printf "This script sends a diff preview to the OpenAI API.\n"
  read -r -p "Proceed anyway? (y/N) " proceed
  if [[ ! "${proceed:-}" =~ ^[Yy]$ ]]; then
    printf "Aborted.\n"
    exit 1
  fi
fi

redact_sensitive_diff() {
  local input="$1"
  local redacted
  redacted="$(printf '%s\n' "$input" | sed -E \
    -e 's/AKIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
    -e 's/ASIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
    -e 's/xox[baprs]-[0-9A-Za-z-]{10,}/[REDACTED_SLACK_TOKEN]/g' \
    -e 's/gh[pousr]_[0-9A-Za-z]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/github_pat_[0-9A-Za-z_]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/(([Pp]assword|[Aa]pi[_-]?[Kk]ey|[Ss]ecret|[Tt]oken|[Aa]uthorization)[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g')"

  printf '%s\n' "$redacted" | awk '
    BEGIN { in_key = 0 }
    /-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/ {
      print "[REDACTED_PRIVATE_KEY_BLOCK]"
      in_key = 1
      next
    }
    /-----END (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/ {
      if (in_key) {
        in_key = 0
        next
      }
    }
    {
      if (!in_key) {
        print
      }
    }
  '
}

full_diff_redacted="$(redact_sensitive_diff "$full_diff")"
if [[ -n "$full_diff_redacted" ]]; then
  total_lines="$(printf '%s\n' "$full_diff_redacted" | wc -l | tr -d ' ')"
else
  total_lines=0
fi
diff_redacted="$(printf '%s\n' "$full_diff_redacted" | sed -n "1,${MAX_DIFF_PREVIEW_LINES}p")"
truncated="false"
if [[ "$total_lines" -gt "$MAX_DIFF_PREVIEW_LINES" ]]; then
  truncated="true"
fi

sanitize_branch_name() {
  local raw="$1"
  raw="$(printf '%s' "$raw" | sed -e 's/\r//g')"
  raw="$(printf '%s\n' "$raw" | sed -n '/[^[:space:]]/{p;q;}')"
  raw="$(printf '%s' "$raw" | sed -E \
    -e 's/^[-*][[:space:]]*//' \
    -e 's/^[Bb]ranch([[:space:]]+[Nn]ame)?[[:space:]]*:[[:space:]]*//' \
    -e 's@^refs/heads/@@' \
    -e 's@^origin/@@' \
    -e 's/^['\''"`]+//' \
    -e 's/['\''"`]+$//' \
    -e 's/[[:space:]]+/-/g' \
    -e 's@/+@/@g' \
    -e 's/^-+//' \
    -e 's/-+$//' \
    -e 's@/$@@' \
  )"
  printf '%s' "$raw"
}

sanitize_slug() {
  local value="$1"
  local fallback="${2:-}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]' | sed -E \
    -e 's/[^a-z0-9]+/-/g' \
    -e 's/^-+//' \
    -e 's/-+$//' \
    -e 's/-{2,}/-/g' \
  )"
  value="$(printf '%s' "$value" | cut -c1-80 | sed -E 's/-+$//')"
  if [[ -z "$value" && -n "$fallback" ]]; then
    value="$fallback"
  fi
  printf '%s' "$value"
}

sanitize_issue_segment() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E \
    -e 's/[^A-Za-z0-9_-]+/-/g' \
    -e 's/^-+//' \
    -e 's/-+$//' \
    -e 's/-{2,}/-/g' \
  )"
  value="$(printf '%s' "$value" | cut -c1-40 | sed -E 's/-+$//')"
  printf '%s' "$value"
}

join_parts_from_index() {
  local start="$1"
  shift
  local i=0
  local out=""
  local part=""

  for part in "$@"; do
    if (( i >= start )); then
      part="$(printf '%s' "$part" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
      if [[ -n "$part" ]]; then
        if [[ -n "$out" ]]; then
          out="${out}-"
        fi
        out="${out}${part}"
      fi
    fi
    i=$((i + 1))
  done

  printf '%s' "$out"
}

map_branch_type() {
  local token="$1"
  token="$(printf '%s' "$token" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z]+/-/g; s/^-+//; s/-+$//')"

  case "$token" in
    feature|features|feat) printf "feature" ;;
    hotfix|hot-fix) printf "hotfix" ;;
    fix|bug|bugfix|bug-fix) printf "bugfix" ;;
    release) printf "release" ;;
    docs|doc|documentation) printf "docs" ;;
    build|ci|deps|dependency|dependencies) printf "build" ;;
    test|tests|testing) printf "test" ;;
    refactor|refactoring|perf|performance|cleanup|clean-up) printf "refactor" ;;
    chore|style|ops|maintenance|maint|merge|revert) printf "chore" ;;
    *) printf "" ;;
  esac
}

count_matching_files() {
  local files="$1"
  local pattern="$2"
  local count
  count="$(printf '%s\n' "$files" | sed '/^$/d' | grep -E -c -- "$pattern" || true)"
  printf '%s' "$count"
}

summarize_changed_paths() {
  local files="$1"
  local total top_dirs top_subdir

  total="$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "$total" -eq 0 ]]; then
    printf "No changed files detected."
    return
  fi

  top_dirs="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ '{print $1}' | sort | uniq -c | sort -nr | head -n 4 | awk '{printf "%s:%s ", $2, $1}')"
  top_subdir="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ '
    NF >= 2 { key=$1"/"$2; c[key]++ }
    END {
      best=""; bestc=0;
      for (k in c) {
        if (c[k] > bestc) {
          best=k;
          bestc=c[k];
        }
      }
      if (best != "") {
        printf "%s:%s", best, bestc;
      }
    }
  ')"

  printf "Total changed files: %s\nTop directories (count): %s\nTop subdirectory (count): %s" \
    "$total" "${top_dirs:-n/a}" "${top_subdir:-n/a}"
}

normalize_candidate_branch() {
  local raw_candidate="$1"
  local default_type="$2"
  local candidate type mapped_type slug_raw slug start_index maybe_kind maybe_id
  local issue_kind_local="" issue_id_local=""
  local -a parts=()

  candidate="$(sanitize_branch_name "$raw_candidate")"
  if [[ -z "$candidate" ]]; then
    printf ''
    return
  fi

  if [[ "$candidate" =~ $SNYK_REGEX ]]; then
    printf '%s' "$candidate"
    return
  fi

  IFS='/' read -r -a parts <<< "$candidate"

  type="${parts[0]:-}"
  type="$(printf '%s' "$type" | sed -E 's/:$//')"
  mapped_type="$(map_branch_type "$type")"
  if [[ -z "$mapped_type" ]]; then
    mapped_type="$default_type"
  fi
  if [[ -z "$mapped_type" ]]; then
    mapped_type="feature"
  fi

  start_index=1
  if [[ -n "$issue_kind" ]]; then
    maybe_kind="$(printf '%s' "${parts[1]:-}" | tr '[:upper:]' '[:lower:]')"
    issue_kind_local="$issue_kind"
    issue_id_local="$issue_id"
    if [[ "$maybe_kind" == "issue" || "$maybe_kind" == "ticket" ]]; then
      if [[ -n "${parts[2]:-}" ]]; then
        start_index=3
      else
        start_index=2
      fi
    fi
  else
    maybe_kind="$(printf '%s' "${parts[1]:-}" | tr '[:upper:]' '[:lower:]')"
    if [[ "$maybe_kind" == "issue" || "$maybe_kind" == "ticket" ]]; then
      maybe_id="$(sanitize_issue_segment "${parts[2]:-}")"
      if [[ -n "$maybe_id" ]]; then
        issue_kind_local="$maybe_kind"
        issue_id_local="$maybe_id"
        start_index=3
      else
        start_index=2
      fi
    fi
  fi

  slug_raw="$(join_parts_from_index "$start_index" "${parts[@]}")"
  if [[ -z "$slug_raw" ]]; then
    slug_raw="$(printf '%s' "$candidate" | sed -E "s@^${mapped_type}/@@")"
  fi
  slug="$(sanitize_slug "$slug_raw" "update-code")"

  if [[ -n "$issue_kind_local" && -n "$issue_id_local" ]]; then
    printf '%s/%s/%s/%s' "$mapped_type" "$issue_kind_local" "$issue_id_local" "$slug"
  else
    printf '%s/%s' "$mapped_type" "$slug"
  fi
}

validate_branch_name() {
  local branch="$1"
  if [[ "$branch" =~ $BRANCH_REGEX || "$branch" =~ $SNYK_REGEX ]]; then
    if [[ -n "$issue_kind" ]] && [[ "$branch" != */"$issue_kind"/"$issue_id"/* ]]; then
      return 1
    fi
    return 0
  fi
  return 1
}

branch_rejection_reason() {
  local branch="$1"
  if [[ ! "$branch" =~ $BRANCH_REGEX && ! "$branch" =~ $SNYK_REGEX ]]; then
    printf "does not match validate-branch-name regex"
    return
  fi

  if [[ -n "$issue_kind" ]] && [[ "$branch" != */"$issue_kind"/"$issue_id"/* ]]; then
    printf "missing required /%s/%s/ segment" "$issue_kind" "$issue_id"
    return
  fi

  printf "failed additional validation"
}

infer_fallback_branch_type() {
  local files="$1"
  local total test_count docs_count build_count template_count

  total="$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "$total" -eq 0 ]]; then
    printf "chore"
    return
  fi

  test_count="$(count_matching_files "$files" '(^|/)(test|tests|__tests__)/|(\.test\.|\.spec\.)')"
  docs_count="$(count_matching_files "$files" '^docs/|\.md$')"
  build_count="$(count_matching_files "$files" '^\.github/workflows/|Dockerfile|docker-compose|(^|/)(Makefile|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$')"
  template_count="$(count_matching_files "$files" '^(blocks|docs|emails|templates)/')"

  if (( docs_count == total )); then
    printf "docs"
    return
  fi

  if (( test_count * 100 >= total * 60 )); then
    printf "test"
    return
  fi

  if (( build_count * 100 >= total * 60 )); then
    printf "build"
    return
  fi

  if (( template_count * 100 >= total * 60 )); then
    printf "feature"
    return
  fi

  if (( build_count > 0 && total <= 12 )); then
    printf "chore"
    return
  fi

  printf "feature"
}

generate_fallback_branch_name() {
  local files="$1"
  local branch_type slug_parts slug branch
  local total top1 top1_count top2 top2_count top_focus area_token size_token topic_token
  local -a slug_tokens=()

  branch_type="$(infer_fallback_branch_type "$files")"
  total="$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')"

  top1_count="0"
  top2_count="0"
  top1="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ '{print $1}' | sort | uniq -c | sort -nr | awk 'NR==1 {print $2}')"
  top1_count="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ '{print $1}' | sort | uniq -c | sort -nr | awk 'NR==1 {print $1}')"
  top2="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ '{print $1}' | sort | uniq -c | sort -nr | awk 'NR==2 {print $2}')"
  top2_count="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ '{print $1}' | sort | uniq -c | sort -nr | awk 'NR==2 {print $1}')"
  top1_count="${top1_count:-0}"
  top2_count="${top2_count:-0}"
  if ! [[ "$top1_count" =~ ^[0-9]+$ ]]; then
    top1_count=0
  fi
  if ! [[ "$top2_count" =~ ^[0-9]+$ ]]; then
    top2_count=0
  fi

  top_focus=""
  if [[ -n "$top1" ]]; then
    top_focus="$(printf '%s\n' "$files" | sed '/^$/d' | awk -F/ -v top="$top1" '$1==top && NF>1 {print $2}' | sort | uniq -c | sort -nr | awk 'NR==1 {print $2}')"
  fi

  if [[ "$total" -ge 150 ]]; then
    size_token="bulk"
  elif [[ "$total" -ge 50 ]]; then
    size_token="large"
  else
    size_token="update"
  fi

  if [[ "$total" -ge 40 ]]; then
    if (( top1_count > 0 && (top1_count * 100) < (total * 80) )); then
      area_token="multi-area"
    elif [[ -n "$top1" ]]; then
      area_token="$(sanitize_slug "$top1")"
    else
      area_token="code"
    fi
  elif [[ -n "$top2" && ${top2_count:-0} -gt 0 && ${top1_count:-0} -gt 0 ]] && (( (${top2_count:-0} * 100) >= (${top1_count:-0} * 65) )); then
    area_token="multi-area"
  elif [[ -n "$top1" && -n "$top_focus" ]]; then
    area_token="$(sanitize_slug "${top1}-${top_focus}")"
  elif [[ -n "$top1" ]]; then
    area_token="$(sanitize_slug "$top1")"
  else
    area_token="code"
  fi

  if [[ -z "$area_token" ]]; then
    area_token="code"
  fi

  topic_token="$(printf '%s\n' "$files" | sed '/^$/d' | sed -E \
    -e 's@.*/@@' \
    -e 's/\.[A-Za-z0-9._-]+$//' \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E \
    -e 's/[^a-z0-9]+/-/g' \
    -e 's/^-+//' \
    -e 's/-+$//' \
  | sed '/^$/d' | awk '$0 !~ /^(index|readme|main|app|test|tests)$/ {print}' | sort | uniq -c | sort -nr | awk 'NR==1 {print $2}')"

  slug_tokens+=("$size_token")
  slug_tokens+=("$area_token")
  if [[ "$total" -le 25 && -n "$topic_token" ]]; then
    slug_tokens+=("$topic_token")
  fi
  slug_tokens+=("updates")

  slug_parts="$(printf '%s\n' "${slug_tokens[@]}" | sed '/^$/d' | paste -sd'-' -)"
  slug="$(sanitize_slug "$slug_parts" "update-code")"

  if [[ -n "$issue_kind" ]]; then
    branch="${branch_type}/${issue_kind}/${issue_id}/${slug}"
  else
    branch="${branch_type}/${slug}"
  fi

  if validate_branch_name "$branch"; then
    printf '%s' "$branch"
  else
    if [[ -n "$issue_kind" ]]; then
      printf '%s' "chore/${issue_kind}/${issue_id}/update-code"
    else
      printf '%s' "chore/update-code"
    fi
  fi
}

files_context="$(printf '%s\n%s\n' "$changed_files" "$untracked_files" | sed '/^$/d')"
changed_files_count="$(printf '%s\n' "$changed_files" | sed '/^$/d' | wc -l | tr -d ' ')"
untracked_files_count="$(printf '%s\n' "$untracked_files" | sed '/^$/d' | wc -l | tr -d ' ')"
change_scope_summary="$(summarize_changed_paths "$files_context")"
preferred_branch_type="$(infer_fallback_branch_type "$files_context")"
preferred_fallback_branch="$(generate_fallback_branch_name "$files_context")"
ignored_paths_sample="$(printf '%s\n' "$ignored_paths" | sed '/^$/d' | sed -n '1,8p')"
if [[ "$opencommit_ignore_enabled" == "true" ]]; then
  if [[ "$ignored_paths_count" -gt 0 ]]; then
    opencommit_ignore_summary="Applied ${OPENCOMMIT_IGNORE_FILE}; ignored ${ignored_paths_count} path(s).
Ignored sample:
${ignored_paths_sample}"
  else
    opencommit_ignore_summary="Applied ${OPENCOMMIT_IGNORE_FILE}; no paths ignored."
  fi
else
  opencommit_ignore_summary=".opencommitignore file not found; no extra ignore filtering applied."
fi

changed_files_for_prompt="$(printf '%s\n' "$changed_files" | sed '/^$/d' | sed -n '1,250p')"
if [[ "$changed_files_count" -gt 250 ]]; then
  changed_files_for_prompt="${changed_files_for_prompt}
... (${changed_files_count} changed files total; truncated for prompt)"
fi

untracked_files_for_prompt="$(printf '%s\n' "$untracked_files" | sed '/^$/d' | sed -n '1,120p')"
if [[ "$untracked_files_count" -gt 120 ]]; then
  untracked_files_for_prompt="${untracked_files_for_prompt}
... (${untracked_files_count} untracked files total; truncated for prompt)"
fi

issue_requirement=""
if [[ -n "$issue_kind" ]]; then
  issue_requirement="Required middle segment: /${issue_kind}/${issue_id}/"
fi

build_prompt() {
  local validation_error="${1:-}"
  cat <<EOF
You suggest git branch names for code changes.

Output requirements:
- Return exactly ONE branch name and nothing else.
- Must match this regex exactly:
  ${BRANCH_REGEX}
- Allowed branch types (prefix): ${BRANCH_TYPES_CSV}
- Conventional Commit types configured in this repo: ${CONVENTIONAL_COMMIT_TYPES_CSV}
- Use this mapping to align branch type to commit intent:
  feat->feature, fix->bugfix, refactor->refactor, perf->refactor, style->chore, test->test, build->build, ops->chore, docs->docs, chore->chore, merge->chore, revert->hotfix
- CRITICAL: Branch names must be either <type>/<slug> or <type>/(issue|ticket)/<id>/<slug>. Do not include any additional "/" segments.
- Keep the slug concise, lowercase, and hyphenated ([a-z0-9-] only).
- If the change set spans many files/directories, use a broader slug (for example large-multi-area-updates) instead of naming one component.
- Prefer a branch type aligned with this default hint: ${preferred_branch_type}
- Safe valid fallback example for this change set: ${preferred_fallback_branch}
${issue_requirement}
${validation_error}

Valid examples:
- feature/update-callout-defaults
- docs/issue/ABC-123/update-component-guides
- chore/ticket/ENG-77/refresh-kitchen-sink-emails

Invalid examples:
- feature/subfolder/component/update-callout-defaults
- feature/update callout defaults
- Branch name: feature/update-callout-defaults

Change scope summary:
${change_scope_summary}

Ignore filtering summary:
${opencommit_ignore_summary}

Changed files:
${changed_files_for_prompt}

Untracked files:
${untracked_files_for_prompt}

Diff preview (redacted):
${diff_redacted}

Diff truncated: ${truncated}
EOF
}

attempt=1
max_attempts=3
suggested_branch=""
validation_error=""
rejected_candidates=()

if [[ "$USE_OPENAI_API" == "true" ]]; then
  while [[ $attempt -le $max_attempts ]]; do
    prompt_text="$(build_prompt "$validation_error")"

    payload="$(jq -n \
      --arg model "$OPENAI_MODEL" \
      --arg prompt "$prompt_text" \
      --argjson max_tokens "$OPENAI_MAX_OUTPUT_TOKENS" \
      '{
        model: $model,
        messages: [
          {
            role: "system",
            content: "You are strict about output format and only output a valid branch name."
          },
          {
            role: "user",
            content: $prompt
          }
        ],
        temperature: 0.2,
        max_tokens: $max_tokens
      }')"

    set +e
    response="$(curl -sS "$CURL_FAIL_FLAG" https://api.openai.com/v1/chat/completions \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$payload" 2>&1)"
    curl_status=$?
    set -e

    if [[ $curl_status -ne 0 ]]; then
      printf "❌ OpenAI API request failed (curl exit code: %s).\n" "$curl_status" >&2
      printf '%s\n' "$response" | head -c 500 >&2
      printf '\n' >&2
      exit 1
    fi

    if ! printf '%s' "$response" | jq -e . >/dev/null 2>&1; then
      printf "❌ OpenAI API returned non-JSON output.\n" >&2
      printf '%s\n' "$response" | head -c 500 >&2
      printf '\n' >&2
      exit 1
    fi

    if printf '%s' "$response" | jq -e '.error' >/dev/null 2>&1; then
      err_type="$(printf '%s' "$response" | jq -r '.error.type // "unknown"')"
      err_msg="$(printf '%s' "$response" | jq -r '.error.message // ""' | head -c 300)"
      printf "❌ OpenAI API error (%s): %s\n" "$err_type" "$err_msg" >&2
      exit 1
    fi

    model_output="$(printf '%s' "$response" | jq -r '
      if ((.choices[0].message.content // "") | type) == "string" then
        .choices[0].message.content // ""
      else
        [(.choices[0].message.content[]? | .text // "")] | join("")
      end
    ')"

    raw_candidate="$(sanitize_branch_name "$model_output")"
    candidate="$(normalize_candidate_branch "$raw_candidate" "$preferred_branch_type")"

    if [[ -n "$raw_candidate" && "$candidate" != "$raw_candidate" ]]; then
      printf "ℹ️ Normalized AI candidate: %s -> %s\n" "$raw_candidate" "$candidate"
    fi

    if validate_branch_name "$candidate"; then
      suggested_branch="$candidate"
      break
    fi

    reason="$(branch_rejection_reason "$candidate")"
    display_candidate="$raw_candidate"
    if [[ -z "$display_candidate" ]]; then
      display_candidate="<empty>"
    fi
    if [[ -n "$candidate" && "$candidate" != "$display_candidate" ]]; then
      display_candidate="${display_candidate} -> ${candidate}"
    fi
    rejected_candidates+=("${display_candidate} (${reason})")
    printf "⚠️ Rejected AI candidate (%d/%d): %s (%s)\n" "$attempt" "$max_attempts" "$display_candidate" "$reason"

    validation_error="Previous output was invalid (${reason}): ${display_candidate}. Return only a valid branch name."
    attempt=$((attempt + 1))
  done
fi

if [[ -z "$suggested_branch" ]]; then
  suggested_branch="$(generate_fallback_branch_name "$files_context")"
  if [[ "$USE_OPENAI_API" == "true" ]]; then
    printf "⚠️ Using fallback branch name after invalid model output.\n"
  else
    printf "ℹ️ Using deterministic fallback branch name.\n"
  fi
fi

if [[ ${#rejected_candidates[@]} -gt 0 ]]; then
  printf "🧪 Rejected AI candidates:\n"
  for rejected in "${rejected_candidates[@]}"; do
    printf "  - %s\n" "$rejected"
  done
fi

printf "✅ Suggested branch name:\n%s\n" "$suggested_branch"

if [[ "$create_branch" == "true" ]]; then
  CREATE_BRANCH_SCRIPT="${SCRIPT_DIR}/create-branch.sh"
  if [[ ! -f "$CREATE_BRANCH_SCRIPT" ]]; then
    printf "❌ Required script not found: %s\n" "$CREATE_BRANCH_SCRIPT" >&2
    exit 1
  fi

  while true; do
    read -r -p "Use this suggestion to create a branch now? (y/n): " create_confirm
    case "${create_confirm:-}" in
      [Yy])
        while true; do
          read -r -p "Push the branch to origin now? (y/n): " push_confirm
          case "${push_confirm:-}" in
            [Yy])
              bash "$CREATE_BRANCH_SCRIPT" "$suggested_branch"
              exit $?
              ;;
            [Nn])
              bash "$CREATE_BRANCH_SCRIPT" "$suggested_branch" --no-push
              exit $?
              ;;
            *)
              printf "Please answer y or n.\n"
              ;;
          esac
        done
        ;;
      [Nn])
        printf "Skipped branch creation.\n"
        exit 0
        ;;
      *)
        printf "Please answer y or n.\n"
        ;;
    esac
  done
fi
