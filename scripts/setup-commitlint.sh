#!/usr/bin/env bash
set -euo pipefail

# Install and wire up commitlint + a Husky commit-msg hook in the current repo.
# Idempotent: safe to re-run. Run from the repo you want to configure:
#   ./scripts/setup-commitlint.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf "❌ Not inside a git repository.\n" >&2
  exit 1
}
cd "$repo_root"

for cmd in npm npx; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf "❌ Missing dependency: %s (Node.js is required).\n" "$cmd" >&2
    exit 1
  fi
done

# A package.json is required for dev deps and the Husky prepare script.
if [[ ! -f package.json ]]; then
  printf "📦 No package.json found — initializing one.\n"
  npm init -y >/dev/null
fi

printf "📦 Installing commitlint + husky (dev dependencies)…\n"
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky

# commit-types.mjs is the single source of truth for the allowed types; the
# commitlint config imports it. Provision it first so the config resolves. The
# .mjs extension pins it to ES modules regardless of the target repo's
# package.json "type", so it loads the same way in CommonJS and ESM repos.
# Reuse the shared file if present, else write the canonical default. Accept any
# existing commit-types.{mjs,js,cjs} so re-running against a repo set up by an
# older version doesn't drop a second, conflicting source of truth.
if [[ -f commit-types.mjs || -f commit-types.js || -f commit-types.cjs ]]; then
  printf "✅ commit-types.* already present — leaving it untouched.\n"
elif [[ -f "${SCRIPT_DIR}/../commit-types.mjs" ]]; then
  cp "${SCRIPT_DIR}/../commit-types.mjs" commit-types.mjs
  printf "✅ Copied shared commit-types.mjs into the repo.\n"
else
  cat > commit-types.mjs <<'EOF'
// Single source of truth for the allowed conventional-commit types.
// commitlint.config.mjs imports this array; edit the list here only.
export default [
  'feat',
  'fix',
  'refactor',
  'perf',
  'style',
  'test',
  'build',
  'ops',
  'docs',
  'chore',
  'merge',
  'revert',
];
EOF
  printf "✅ Wrote a default commit-types.mjs.\n"
fi

# commitlint config: reuse the shared one if present, else write a sensible
# default. Either way it imports the allowed types from commit-types.mjs above.
if [[ -f commitlint.config.js || -f commitlint.config.cjs || -f commitlint.config.mjs || -f .commitlintrc.js || -f .commitlintrc.json || -f .commitlintrc.yml || -f .commitlintrc.yaml ]]; then
  printf "✅ commitlint config already present — leaving it untouched.\n"
elif [[ -f "${SCRIPT_DIR}/../commitlint.config.mjs" ]]; then
  cp "${SCRIPT_DIR}/../commitlint.config.mjs" commitlint.config.mjs
  printf "✅ Copied shared commitlint.config.mjs into the repo.\n"
else
  cat > commitlint.config.mjs <<'EOF'
// Allowed commit types come from commit-types.mjs — the single source of truth.
import COMMIT_TYPES from './commit-types.mjs'

/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', COMMIT_TYPES],
  },
};

export default config;
EOF
  printf "✅ Wrote a default commitlint.config.mjs.\n"
fi

# Husky v9: `husky init` creates .husky/ and adds a `prepare` script so hooks
# install on every `npm install`. It seeds a pre-commit hook we don't need.
if [[ ! -d .husky ]]; then
  printf "🐶 Initializing Husky…\n"
  npx husky init
  # Remove the default sample pre-commit hook (we only want commit-msg here).
  rm -f .husky/pre-commit
fi

# Make sure the body-wrap helper the prepare-commit-msg hook calls is executable.
[[ -f scripts/wrap-commit-body.sh ]] && chmod +x scripts/wrap-commit-body.sh

# Install hooks by copying the tracked templates verbatim, so the exact hook
# content is reviewable in version control rather than generated inline.
#   prepare-commit-msg → wraps the body   |   commit-msg → lints the message
HOOK_TEMPLATE_DIR="${SCRIPT_DIR}/husky"
for hook in prepare-commit-msg commit-msg; do
  src="${HOOK_TEMPLATE_DIR}/${hook}"
  if [[ ! -f "$src" ]]; then
    printf "❌ Missing hook template: %s (sync scripts/husky/ from nswds-devops).\n" "$src" >&2
    exit 1
  fi
  cp "$src" ".husky/${hook}"
  chmod +x ".husky/${hook}"
  printf "✅ Installed .husky/%s\n" "$hook"
done

printf "\n🎉 commitlint is set up. Test it with:\n"
printf "   echo \"bad message\" | npx --no-install commitlint   # should fail\n"
printf "   echo \"chore: valid message\" | npx --no-install commitlint   # should pass\n"
