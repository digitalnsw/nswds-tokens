#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/git-conventional-commits.yaml" ]]; then
  REPO_ROOT="$SCRIPT_DIR"
else
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi
CONFIG_FILE="${CONVENTIONAL_CONFIG_FILE:-${REPO_ROOT}/git-conventional-commits.yaml}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  printf "❌ Conventional commit config not found: %s\n" "$CONFIG_FILE" >&2
  exit 1
fi

extract_types() {
  awk '
    function trim(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s);
      return s;
    }
    function unquote(s, first, last) {
      s = trim(s);
      first = substr(s, 1, 1);
      last = substr(s, length(s), 1);
      if ((first == "\"" && last == "\"") || (first == "'"'"'" && last == "'"'"'")) {
        s = substr(s, 2, length(s) - 2);
      }
      return trim(s);
    }
    function emit_type(raw) {
      raw = trim(raw);
      sub(/[[:space:]]*#.*$/, "", raw);
      raw = unquote(raw);
      if (raw != "") {
        print raw;
      }
    }
    BEGIN {
      in_convention = 0;
      in_commit_types = 0;
    }
    /^convention:[[:space:]]*$/ {
      in_convention = 1;
      in_commit_types = 0;
      next;
    }
    in_convention && /^changelog:[[:space:]]*$/ {
      in_convention = 0;
      in_commit_types = 0;
      next;
    }
    in_convention && /^  commitTypes:[[:space:]]*$/ {
      in_commit_types = 1;
      next;
    }
    in_convention && /^  commitTypes:[[:space:]]*\[[^]]*\][[:space:]]*$/ {
      line = $0;
      sub(/^  commitTypes:[[:space:]]*\[/, "", line);
      sub(/\][[:space:]]*$/, "", line);
      n = split(line, parts, ",");
      for (i = 1; i <= n; i++) {
        emit_type(parts[i]);
      }
      next;
    }
    in_commit_types {
      if ($0 ~ /^  [A-Za-z0-9_]+:.*$/) {
        in_commit_types = 0;
        next;
      }
      if ($0 ~ /^    - /) {
        line = $0;
        sub(/^    - /, "", line);
        emit_type(line);
      }
    }
  ' "$CONFIG_FILE"
}

extract_config_default() {
  awk '
    BEGIN {
      in_convention = 0;
    }
    /^convention:[[:space:]]*$/ {
      in_convention = 1;
      next;
    }
    in_convention && /^changelog:[[:space:]]*$/ {
      in_convention = 0;
      next;
    }
    in_convention && /^  (safeDefaultType|defaultCommitType):/ {
      line = $0;
      sub(/^  (safeDefaultType|defaultCommitType):[[:space:]]*/, "", line);
      sub(/[[:space:]]*#.*$/, "", line);
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line);
      if (line != "") {
        print line;
        exit;
      }
    }
  ' "$CONFIG_FILE"
}

escape_regex_types() {
  awk '
    {
      gsub(/[][(){}.^$+*?|\\]/, "\\\\&");
      print;
    }
  '
}

to_csv() {
  awk '
    BEGIN {
      first = 1;
    }
    {
      if (!first) {
        printf ", ";
      }
      printf "%s", $0;
      first = 0;
    }
    END {
      print "";
    }
  '
}

types="$(extract_types)"
if [[ -z "$types" ]]; then
  printf "❌ No conventional commit types found in %s\n" "$CONFIG_FILE" >&2
  exit 1
fi

regex_types="$(printf '%s\n' "$types" | escape_regex_types | paste -sd'|' -)"
regex="^(${regex_types})(\\([^)]*\\))?!?: .+"
first_type="$(printf '%s\n' "$types" | sed -n '1p')"
types_csv="$(printf '%s\n' "$types" | to_csv)"
configured_default_raw="$(extract_config_default || true)"
configured_default="$(printf '%s' "$configured_default_raw" | sed -E 's/^["'"'"']+|["'"'"']+$//g')"
safe_default_type=""

if [[ -n "$configured_default" ]]; then
  if printf '%s\n' "$types" | grep -Fxq "$configured_default"; then
    safe_default_type="$configured_default"
  else
    printf "⚠️ Ignoring configured default commit type '%s' (not in convention.commitTypes)\n" "$configured_default" >&2
  fi
fi

if [[ -z "$safe_default_type" ]]; then
  if printf '%s\n' "$types" | grep -Fxq "chore"; then
    safe_default_type="chore"
  else
    safe_default_type="$first_type"
  fi
fi

case "${1:-regex}" in
  regex)
    printf "%s\n" "$regex"
    ;;
  types)
    printf "%s\n" "$types"
    ;;
  csv)
    printf "%s\n" "$types_csv"
    ;;
  first)
    printf "%s\n" "$first_type"
    ;;
  safe-default|safe_default|default)
    printf "%s\n" "$safe_default_type"
    ;;
  *)
    printf "Usage: %s [regex|types|csv|first|safe-default]\n" "$(basename "$0")" >&2
    exit 1
    ;;
esac
