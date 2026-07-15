#!/usr/bin/env bash
set -euo pipefail

# Fail if the commit type list in commit-types.mjs (the source of truth) diverges
# from git-conventional-commits.yaml. The YAML is the live config for the
# downstream git-conventional-commits CLI (and the shell tooling's offline
# fallback), so its type list must match the source of truth. commitlint.config.mjs
# imports commit-types.mjs directly, so it can't drift and isn't re-checked here.
# Intended for CI, runnable locally.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_SCRIPT="${SCRIPT_DIR}/conventional-commit-config.sh"

if [[ ! -x "$CONFIG_SCRIPT" ]]; then
  printf "❌ Missing helper script: %s\n" "$CONFIG_SCRIPT" >&2
  exit 1
fi

# Read each side independently (sorted, de-duplicated). A non-zero exit here
# means that source couldn't be read at all — surfaced clearly rather than
# masked as a false "in sync".
js_types="$(CONVENTIONAL_CONFIG_SOURCE=js "$CONFIG_SCRIPT" types | LC_ALL=C sort -u)" || {
  printf "❌ Could not read commit types from commit-types.mjs.\n" >&2
  exit 1
}
yaml_types="$(CONVENTIONAL_CONFIG_SOURCE=yaml "$CONFIG_SCRIPT" types | LC_ALL=C sort -u)" || {
  printf "❌ Could not read commit types from git-conventional-commits.yaml.\n" >&2
  exit 1
}

if [[ "$js_types" != "$yaml_types" ]]; then
  printf "❌ Commit type lists are OUT OF SYNC.\n\n" >&2
  printf "   commit-types.mjs (source of truth) vs git-conventional-commits.yaml:\n" >&2
  # '<' = only in YAML, '>' = only in commit-types.mjs.
  diff <(printf '%s\n' "$yaml_types") <(printf '%s\n' "$js_types") >&2 || true
  printf "\n   Update git-conventional-commits.yaml to match commit-types.mjs, then re-run.\n" >&2
  exit 1
fi

printf "✅ Commit type lists are in sync (%s types).\n" "$(printf '%s\n' "$js_types" | grep -c .)"
