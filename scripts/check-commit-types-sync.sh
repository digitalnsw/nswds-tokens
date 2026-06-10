#!/usr/bin/env bash
set -euo pipefail

# Fail if the commit type list in commitlint.config.mjs (the source of truth)
# diverges from git-conventional-commits.yaml (the CI/offline fallback). Both
# feed the commit tooling, so they must agree. Intended for CI, runnable locally.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_SCRIPT="${SCRIPT_DIR}/conventional-commit-config.sh"

if [[ ! -x "$CONFIG_SCRIPT" ]]; then
  printf "❌ Missing helper script: %s\n" "$CONFIG_SCRIPT" >&2
  exit 1
fi

# Read each side independently (sorted, de-duplicated). A non-zero exit here
# means that source couldn't be read at all — surfaced clearly rather than
# masked as a false "in sync".
commitlint_types="$(CONVENTIONAL_CONFIG_SOURCE=commitlint "$CONFIG_SCRIPT" types | LC_ALL=C sort -u)" || {
  printf "❌ Could not read commit types from commitlint (is it installed in this repo?).\n" >&2
  exit 1
}
yaml_types="$(CONVENTIONAL_CONFIG_SOURCE=yaml "$CONFIG_SCRIPT" types | LC_ALL=C sort -u)" || {
  printf "❌ Could not read commit types from git-conventional-commits.yaml.\n" >&2
  exit 1
}

if [[ "$commitlint_types" != "$yaml_types" ]]; then
  printf "❌ Commit type lists are OUT OF SYNC.\n\n" >&2
  printf "   commitlint.config.mjs (source of truth) vs git-conventional-commits.yaml:\n" >&2
  # '<' = only in YAML, '>' = only in commitlint.
  diff <(printf '%s\n' "$yaml_types") <(printf '%s\n' "$commitlint_types") >&2 || true
  printf "\n   Reconcile the two type lists so they match, then re-run.\n" >&2
  exit 1
fi

printf "✅ Commit type lists are in sync (%s types).\n" "$(printf '%s\n' "$commitlint_types" | grep -c .)"
