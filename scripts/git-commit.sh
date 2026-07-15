#!/usr/bin/env bash
set -euo pipefail

# Dependencies
REQUIRED_CMDS=(git jq curl sed grep wc tr head awk cat paste)
for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf "❌ Missing dependency: %s\n" "$cmd"
    exit 1
  fi
done

# Conventional Commits: type(scope)!: description
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONVENTIONAL_CONFIG_SCRIPT="${SCRIPT_DIR}/conventional-commit-config.sh"
if [[ ! -x "$CONVENTIONAL_CONFIG_SCRIPT" ]]; then
  printf "❌ Missing helper script: %s\n" "$CONVENTIONAL_CONFIG_SCRIPT"
  exit 1
fi
CONVENTIONAL_COMMIT_REGEX="$("$CONVENTIONAL_CONFIG_SCRIPT" regex)"
CONVENTIONAL_COMMIT_TYPES_CSV="$("$CONVENTIONAL_CONFIG_SCRIPT" csv)"
DEFAULT_CONVENTIONAL_COMMIT_TYPE="$("$CONVENTIONAL_CONFIG_SCRIPT" safe-default)"

# OpenAI credentials (Fix #2)
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  printf "❌ OPENAI_API_KEY is not set. Export it in your shell before running this script.\n"
  exit 1
fi

# Shared OpenAI request helper (model defaults + openai_responses_text()).
OPENAI_REQUEST_SCRIPT="${SCRIPT_DIR}/openai-request.sh"
if [[ ! -f "$OPENAI_REQUEST_SCRIPT" ]]; then
  printf "❌ OpenAI request helper not found: %s\n" "$OPENAI_REQUEST_SCRIPT"
  exit 1
fi
# shellcheck source=./openai-request.sh
source "$OPENAI_REQUEST_SCRIPT"

# Shared secret detection + redaction (single source of truth).
SECRET_REDACTION_SCRIPT="${SCRIPT_DIR}/secret-redaction.sh"
if [[ ! -f "$SECRET_REDACTION_SCRIPT" ]]; then
  printf "❌ Secret redaction helper not found: %s\n" "$SECRET_REDACTION_SCRIPT"
  exit 1
fi
# shellcheck source=./secret-redaction.sh
source "$SECRET_REDACTION_SCRIPT"

# Reasoning models spend output tokens on hidden reasoning, so they need a
# larger budget than the gpt-4 family to actually emit the commit message.
if [[ "$OPENAI_MODEL_FAMILY" == "reasoning" ]]; then
  OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-2000}"
else
  OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-250}"
fi
OPENAI_DIFF_MAX_LINES="${OPENAI_DIFF_MAX_LINES:-1500}"
OPENAI_DIFF_MAX_BYTES="${OPENAI_DIFF_MAX_BYTES:-120000}"

if ! [[ "$OPENAI_MAX_OUTPUT_TOKENS" =~ ^[1-9][0-9]*$ ]]; then
  printf "❌ OPENAI_MAX_OUTPUT_TOKENS must be a positive integer (>= 1) (got: %s)\n" "$OPENAI_MAX_OUTPUT_TOKENS"
  exit 1
fi

if ! [[ "$OPENAI_DIFF_MAX_LINES" =~ ^[1-9][0-9]*$ ]]; then
  printf "❌ OPENAI_DIFF_MAX_LINES must be a positive integer (>= 1) (got: %s)\n" "$OPENAI_DIFF_MAX_LINES"
  exit 1
fi

if ! [[ "$OPENAI_DIFF_MAX_BYTES" =~ ^[1-9][0-9]*$ ]]; then
  printf "❌ OPENAI_DIFF_MAX_BYTES must be a positive integer (>= 1) (got: %s)\n" "$OPENAI_DIFF_MAX_BYTES"
  exit 1
fi

# Detect a locally-installed commitlint so we can validate candidate messages
# against the exact rules the commit-msg hook enforces. When absent (non-Node
# repo, deps not installed), fall back to the Conventional Commits regex.
COMMITLINT_AVAILABLE="false"
if command -v npx >/dev/null 2>&1 && npx --no-install commitlint --version >/dev/null 2>&1; then
  COMMITLINT_AVAILABLE="true"
fi

# Returns 0 when the message passes the project's commit rules.
commit_passes_lint() {
  local msg="$1"
  if [[ "$COMMITLINT_AVAILABLE" == "true" ]]; then
    printf '%s' "$msg" | npx --no-install commitlint >/dev/null 2>&1
    return
  fi
  local subject
  subject="$(printf '%s\n' "$msg" | sed -n '1p')"
  [[ "$subject" =~ $CONVENTIONAL_COMMIT_REGEX ]]
}

# Check current branch
printf "🔍 Current branch:\n"
BRANCH="$(git branch --show-current)"
printf "%s\n\n" "$BRANCH"

# Show staged files
printf "📦 Staged changes:\n"
STAGED="$(git diff --name-only --cached || true)"

if [[ -z "$STAGED" ]]; then
  printf "No staged changes.\n\n"
  printf "🧩 Stage changes now?\n"
  printf "  1) Stage all (git add -A)\n"
  printf "  2) Stage tracked only (git add -u)\n"
  printf "  3) Cancel\n"
  printf "Choose (1/2/3): "
  read -r STAGE_CHOICE

  case "$STAGE_CHOICE" in
    1) git add -A ;;
    2) git add -u ;;
    *) printf "❌ No files staged. Exiting.\n"; exit 0 ;;
  esac

  STAGED="$(git diff --name-only --cached || true)"
  if [[ -z "$STAGED" ]]; then
    printf "❌ Still no files staged. Exiting.\n"
    exit 0
  fi

  printf "✅ Staged files:\n%s\n" "$STAGED"
else
  printf "%s\n" "$STAGED"
fi
printf "\n"

# Get staged diff with line and byte caps. Avoid sending huge prompts to the API.
TOTAL_LINES="$(git diff --cached | wc -l | tr -d ' ')"
DIFF="$(git diff --cached | sed -n "1,${OPENAI_DIFF_MAX_LINES}p" | head -c "$OPENAI_DIFF_MAX_BYTES" || true)"
DIFF_BYTES="$(printf '%s' "$DIFF" | wc -c | tr -d ' ')"
TRUNCATED="false"
if [[ "$TOTAL_LINES" -gt "$OPENAI_DIFF_MAX_LINES" || "$DIFF_BYTES" -ge "$OPENAI_DIFF_MAX_BYTES" ]]; then
  TRUNCATED="true"
fi

if [[ -z "$DIFF" ]]; then
  printf "No staged diff.\n"
  exit 0
fi

# Basic sensitive-pattern detection to prevent accidental data/code leakage.
# SENSITIVE_REGEX comes from secret-redaction.sh (sourced above).
if git diff --cached | sed -n '1,5000p' | grep -Eqi "$SENSITIVE_REGEX"; then
  printf "⚠️ Potential secrets detected in the staged diff.\n"
  printf "This script will send code to the OpenAI API.\n"
  read -r -p "Proceed anyway? (y/N) " _ans
  if [[ ! "${_ans:-}" =~ ^[Yy]$ ]]; then
    printf "Aborting.\n"
    exit 1
  fi
fi

# Redact common secret patterns before sending to the API (best-effort).
# redact_sensitive_diff comes from secret-redaction.sh (sourced above).
DIFF_REDACTED="$(redact_sensitive_diff "$DIFF")"

# Preview should show redacted diff (Fix #3)
printf "🧾 Staged diff preview (first 300 lines, redacted):\n"
head -n 300 <<<"$DIFF_REDACTED"
if [[ "$TRUNCATED" == "true" ]]; then
  printf "… (diff truncated to first %s lines / %s bytes for the prompt)\n\n" "$OPENAI_DIFF_MAX_LINES" "$OPENAI_DIFF_MAX_BYTES"
else
  printf "…\n\n"
fi

printf "📜 Recent commit history:\n"
git --no-pager log --oneline -n 10
printf "\n"

generate_prompt() {
  cat <<EOF
You're an expert developer writing Conventional Commits.

Task:
- Suggest ONE git commit message for the staged changes.
- Format the first line as: type(scope): description  (or type: description)
- Allowed types (lowercase): ${CONVENTIONAL_COMMIT_TYPES_CSV}
- Subject rules (enforced by commitlint):
  - type must be lowercase and from the allowed list
  - write the description in the imperative mood ("add", not "added"/"adds")
  - do NOT capitalize the first word of the description
  - do NOT end the subject with a period
  - keep the subject <= 100 chars (aim for ~72)
- If helpful, add a body: leave ONE blank line after the subject, then wrap body
  lines at <= 100 chars (bullets ok).
- For a breaking change, use "type!: ..." or a "BREAKING CHANGE: ..." footer.
- Do NOT use code fences. Do NOT wrap in quotes. Do NOT prefix with "Title:" or similar.

Branch name: ${BRANCH}

Staged file list:
${STAGED}

Staged diff:
${DIFF_REDACTED}

Note:
- The diff may be truncated. Use the file list + visible diff to infer intent.
EOF
}

attempt=1
max_attempts=2
COMMIT_MSG=""

while [[ $attempt -le $max_attempts ]]; do
  PROMPT="$(generate_prompt)"

  # Single shared helper handles payload shaping, the request, and all the
  # transport/non-JSON/.error guards; it returns 1 on any failure.
  set +e
  COMMIT_MSG="$(openai_responses_text \
    "You write high-quality Conventional Commit messages. Output only the commit message (subject + optional body)." \
    "$PROMPT" \
    "$OPENAI_MAX_OUTPUT_TOKENS")"
  request_status=$?
  set -e

  if [[ $request_status -ne 0 ]]; then
    exit 1
  fi

  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -e 's/\r//g')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -e 's/^Title:[[:space:]]*//I')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -E 's/^['\''\"`]+//; s/['\''\"`]+$//')"
  # shellcheck disable=SC2016  # backticks are literal (markdown fence stripping)
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -e 's/^```[a-zA-Z0-9_-]*//; s/```$//')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

  if [[ -z "$COMMIT_MSG" || "$COMMIT_MSG" == "null" ]]; then
    printf "❌ Failed to generate commit message.\n"
    exit 1
  fi

  if commit_passes_lint "$COMMIT_MSG"; then
    break
  fi

  attempt=$((attempt + 1))
  if [[ $attempt -le $max_attempts ]]; then
    printf "⚠️ Model output failed commit-message validation. Retrying (%d/%d)...\n" "$attempt" "$max_attempts"
  fi
done

if ! commit_passes_lint "$COMMIT_MSG"; then
  printf "⚠️ Still invalid after retries. Using a safe fallback.\n"
  COMMIT_MSG="${DEFAULT_CONVENTIONAL_COMMIT_TYPE}: update"
fi

printf "\n📝 Suggested commit message:\n"
printf "%s\n\n" "$COMMIT_MSG"

printf "💬 Do you want to use this message to commit? (y/n): "
read -r CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  printf "%s" "$COMMIT_MSG" | git commit -F -
  printf "✅ Committed with AI-generated message.\n"

  DEFAULT_PUSH_BRANCH="$BRANCH"
  if [[ -z "$DEFAULT_PUSH_BRANCH" || "$DEFAULT_PUSH_BRANCH" == "HEAD" ]]; then
    DEFAULT_PUSH_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi

  printf "\n🚀 Push this commit to origin?\n"
  if [[ -n "$DEFAULT_PUSH_BRANCH" && "$DEFAULT_PUSH_BRANCH" != "HEAD" ]]; then
    printf "  1) Push current branch to origin/%s\n" "$DEFAULT_PUSH_BRANCH"
  else
    printf "  1) Push HEAD to a branch name you provide\n"
  fi
  printf "  2) Push HEAD to a different remote branch name\n"
  printf "  3) Skip push\n"
  printf "Choose (1/2/3): "
  read -r PUSH_CHOICE

  PUSH_BRANCH=""
  PUSH_SOURCE_REF=""
  case "$PUSH_CHOICE" in
    1)
      if [[ -n "$DEFAULT_PUSH_BRANCH" && "$DEFAULT_PUSH_BRANCH" != "HEAD" ]]; then
        PUSH_BRANCH="$DEFAULT_PUSH_BRANCH"
        PUSH_SOURCE_REF="$DEFAULT_PUSH_BRANCH"
      else
        read -r -p "Enter branch name to push: " PUSH_BRANCH
        PUSH_SOURCE_REF="HEAD"
      fi
      ;;
    2)
      read -r -p "Enter branch name to push: " PUSH_BRANCH
      PUSH_SOURCE_REF="HEAD"
      ;;
    3)
      ;;
    *)
      printf "ℹ️ Invalid option. Skipping push.\n"
      PUSH_CHOICE="3"
      ;;
  esac

  if [[ -n "$PUSH_BRANCH" ]]; then
    PUSH_BRANCH="$(printf "%s" "$PUSH_BRANCH" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    PUSH_BRANCH="${PUSH_BRANCH#refs/heads/}"

    if [[ -z "$PUSH_BRANCH" ]]; then
      printf "⚠️ No branch name provided. Skipping push.\n"
    elif ! git check-ref-format --branch "$PUSH_BRANCH" >/dev/null 2>&1; then
      printf "❌ Invalid branch name: %s\n" "$PUSH_BRANCH"
      printf "ℹ️ Push skipped.\n"
    else
      if [[ -z "$PUSH_SOURCE_REF" ]]; then
        PUSH_SOURCE_REF="HEAD"
      fi

      if [[ "$PUSH_SOURCE_REF" != "HEAD" ]] && ! git show-ref --verify --quiet "refs/heads/$PUSH_SOURCE_REF"; then
        printf "❌ Local branch '%s' does not exist. Skipping push.\n" "$PUSH_SOURCE_REF"
      else
        PUSH_REFSPEC="${PUSH_SOURCE_REF}:refs/heads/${PUSH_BRANCH}"
        FORCE_PUSH="false"
        read -r -p "Use --force-with-lease for this push? (y/N): " FORCE_PUSH_CONFIRM
        if [[ "${FORCE_PUSH_CONFIRM:-}" =~ ^[Yy]$ ]]; then
          printf "⚠️ Force push can rewrite remote history.\n"
          read -r -p "Type 'force' to confirm: " FORCE_PUSH_TOKEN
          if [[ "${FORCE_PUSH_TOKEN:-}" == "force" ]]; then
            FORCE_PUSH="true"
          else
            printf "ℹ️ Force push not confirmed. Using normal push.\n"
          fi
        fi

        if [[ "$PUSH_SOURCE_REF" != "HEAD" ]]; then
          PUSH_ARGS=(--set-upstream origin "$PUSH_REFSPEC")
          PUSH_COMMAND_DISPLAY="git push --set-upstream origin ${PUSH_REFSPEC}"
          if [[ "$FORCE_PUSH" == "true" ]]; then
            PUSH_ARGS=(--force-with-lease --set-upstream origin "$PUSH_REFSPEC")
            PUSH_COMMAND_DISPLAY="git push --force-with-lease --set-upstream origin ${PUSH_REFSPEC}"
          fi
        else
          PUSH_ARGS=(origin "$PUSH_REFSPEC")
          PUSH_COMMAND_DISPLAY="git push origin ${PUSH_REFSPEC}"
          if [[ "$FORCE_PUSH" == "true" ]]; then
            PUSH_ARGS=(--force-with-lease origin "$PUSH_REFSPEC")
            PUSH_COMMAND_DISPLAY="git push --force-with-lease origin ${PUSH_REFSPEC}"
          fi
        fi

        if git push "${PUSH_ARGS[@]}"; then
          if [[ "$FORCE_PUSH" == "true" ]]; then
            printf "✅ Force-pushed %s to origin/%s with --force-with-lease.\n" "$PUSH_SOURCE_REF" "$PUSH_BRANCH"
          else
            printf "✅ Pushed %s to origin/%s.\n" "$PUSH_SOURCE_REF" "$PUSH_BRANCH"
          fi
        else
          PUSH_EXIT_CODE=$?
          if [[ "$FORCE_PUSH" == "true" ]]; then
            printf "❌ Force push failed (exit %s).\n" "$PUSH_EXIT_CODE"
          else
            printf "❌ Push failed (exit %s).\n" "$PUSH_EXIT_CODE"
          fi
          printf "ℹ️ Commit is still local. Retry manually: %s\n" "$PUSH_COMMAND_DISPLAY"
        fi
      fi
    fi
  elif [[ "$PUSH_CHOICE" == "1" || "$PUSH_CHOICE" == "2" ]]; then
    printf "⚠️ No branch name provided. Skipping push.\n"
  else
    printf "ℹ️ Push skipped.\n"
  fi
else
  printf "❌ Commit cancelled.\n"
fi
