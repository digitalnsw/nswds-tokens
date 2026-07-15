#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/git-conventional-commits.yaml" ]]; then
  REPO_ROOT="$SCRIPT_DIR"
else
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi
CONFIG_FILE="${CONVENTIONAL_CONFIG_FILE:-${REPO_ROOT}/git-conventional-commits.yaml}"
COMMIT_TYPES_JS="${CONVENTIONAL_COMMIT_TYPES_JS:-${REPO_ROOT}/commit-types.mjs}"
# The YAML is only required when we can't read types from commit-types.mjs or
# commitlint (checked below). A repo with neither YAML nor commit-types.mjs is
# valid as long as commitlint resolves.

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

# Read the single source of truth (commit-types.mjs) directly. Prefers Node, but
# falls back to a quote-aware awk parse so the source stays readable in non-Node
# environments. Returns non-zero (emitting nothing) when the file is absent or
# unparseable, so callers fall through to commitlint/YAML.
extract_types_from_js() {
  [[ -f "$COMMIT_TYPES_JS" ]] || return 1
  if command -v node >/dev/null 2>&1; then
    node -e '
      const { pathToFileURL } = require("url");
      import(pathToFileURL(process.argv[1]).href).then((m) => {
        const t = m.default ?? m;
        if (!Array.isArray(t) || t.length === 0) process.exit(1);
        process.stdout.write(t.map(String).join("\n") + "\n");
      }).catch(() => process.exit(1));
    ' "$COMMIT_TYPES_JS" 2>/dev/null && return 0
  fi
  # Node-less fallback: pull every quoted token between the array brackets.
  awk '
    /\[/ { in_arr = 1 }
    in_arr {
      line = $0;
      while (match(line, /["'"'"']([^"'"'"']+)["'"'"']/)) {
        print substr(line, RSTART + 1, RLENGTH - 2);
        line = substr(line, RSTART + RLENGTH);
      }
    }
    /\]/ { in_arr = 0 }
  ' "$COMMIT_TYPES_JS"
}

# Prefer commitlint's resolved config so the shell tooling enforces exactly the
# same type list as the commit-msg hook. Requires npx + a locally-installed
# commitlint + jq. Returns non-zero (and emits nothing) when unavailable, so the
# caller falls back to the YAML — e.g. in CI before `npm ci`, or non-Node repos.
extract_types_from_commitlint() {
  command -v npx >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1
  local json
  json="$(cd "$REPO_ROOT" && npx --no-install commitlint --print-config json 2>/dev/null)" || return 1
  [[ -n "$json" ]] || return 1
  printf '%s' "$json" | jq -e -r '
    .rules["type-enum"] as $r
    | if ($r and ($r[2] | type) == "array") then $r[2][] else empty end
  ' 2>/dev/null
}

# Source selection. Default "auto" prefers commit-types.mjs (the source of
# truth), then commitlint, then the YAML fallback. Force a single source with
# CONVENTIONAL_CONFIG_SOURCE=js|commitlint|yaml — used by the sync check to read
# each side independently.
CONVENTIONAL_CONFIG_SOURCE="${CONVENTIONAL_CONFIG_SOURCE:-auto}"
types=""
case "$CONVENTIONAL_CONFIG_SOURCE" in
  js)
    types="$(extract_types_from_js || true)"
    if [[ -z "$types" ]]; then
      printf "❌ CONVENTIONAL_CONFIG_SOURCE=js but could not read types from %s\n" "$COMMIT_TYPES_JS" >&2
      exit 1
    fi
    ;;
  commitlint)
    types="$(extract_types_from_commitlint || true)"
    if [[ -z "$types" ]]; then
      printf "❌ CONVENTIONAL_CONFIG_SOURCE=commitlint but commitlint config is not resolvable.\n" >&2
      exit 1
    fi
    ;;
  yaml)
    if [[ ! -f "$CONFIG_FILE" ]]; then
      printf "❌ CONVENTIONAL_CONFIG_SOURCE=yaml but no YAML at %s\n" "$CONFIG_FILE" >&2
      exit 1
    fi
    types="$(extract_types)"
    ;;
  auto)
    types="$(extract_types_from_js || true)"
    if [[ -z "$types" ]]; then
      types="$(extract_types_from_commitlint || true)"
    fi
    if [[ -z "$types" ]]; then
      if [[ ! -f "$CONFIG_FILE" ]]; then
        printf "❌ No commit types available: commit-types.mjs unreadable, commitlint not resolvable, and no YAML at %s\n" "$CONFIG_FILE" >&2
        exit 1
      fi
      types="$(extract_types)"
    fi
    ;;
  *)
    printf "❌ Invalid CONVENTIONAL_CONFIG_SOURCE: %s (expected auto|js|commitlint|yaml)\n" "$CONVENTIONAL_CONFIG_SOURCE" >&2
    exit 1
    ;;
esac
if [[ -z "$types" ]]; then
  printf "❌ No conventional commit types found (commitlint config or %s)\n" "$CONFIG_FILE" >&2
  exit 1
fi

regex_types="$(printf '%s\n' "$types" | escape_regex_types | paste -sd'|' -)"
regex="^(${regex_types})(\\([^)]*\\))?!?: .+"
first_type="$(printf '%s\n' "$types" | sed -n '1p')"
types_csv="$(printf '%s\n' "$types" | to_csv)"
# The configured default lives only in the YAML; skip when there's no YAML
# (commitlint defines no "default type", so we fall through to chore/first below).
configured_default_raw=""
if [[ -f "$CONFIG_FILE" ]]; then
  configured_default_raw="$(extract_config_default || true)"
fi
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
