#!/usr/bin/env bash
set -euo pipefail

# Install and wire up commitlint + Husky in the current repo.
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

# Husky v9. The hooks themselves (pre-commit blocks conflict markers,
# prepare-commit-msg wraps the body, commit-msg lints the message) arrive in
# .husky/ with the nswds-devops sync, which is their single source of truth, so
# nothing here writes them. This only wires Husky up: the `prepare` script that
# reinstalls it on every `npm install` (left alone if the repo has its own),
# and `npx husky`, which sets core.hooksPath. Not `husky init`: it seeds a
# sample pre-commit hook.
if [[ "$(npm pkg get scripts.prepare)" == "{}" ]]; then
  npm pkg set scripts.prepare=husky
fi
npx husky

# Make sure the body-wrap helper the prepare-commit-msg hook calls is executable.
[[ -f scripts/wrap-commit-body.sh ]] && chmod +x scripts/wrap-commit-body.sh

for hook in pre-commit prepare-commit-msg commit-msg; do
  if [[ ! -f ".husky/${hook}" ]]; then
    printf "❌ Missing .husky/%s. The hooks arrive with the nswds-devops sync PR; merge it first.\n" "$hook" >&2
    exit 1
  fi
done
printf "✅ Husky is wired up to the synced hooks in .husky/.\n"

printf "\n🎉 commitlint is set up. Test it with:\n"
printf "   echo \"bad message\" | npx --no-install commitlint   # should fail\n"
printf "   echo \"chore: valid message\" | npx --no-install commitlint   # should pass\n"
