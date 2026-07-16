# shellcheck shell=bash
# Source this file from other scripts to share branch naming rules.
# shellcheck disable=SC2034  # variables are consumed by the sourcing scripts

BRANCH_TYPES_REGEX='feat|fix|hotfix|release|docs|build|test|refactor|style|chore|export|ai|copilot|cursor|claude|codex'
BRANCH_TYPES_CSV='feat, fix, hotfix, release, docs, build, test, refactor, style, chore, export, ai, copilot, cursor, claude, codex'
# Slug allows dots so release branches can carry version numbers (e.g.
# release/v1.2.0). Per Conventional Branch, every dot/hyphen must sit between
# two alphanumerics — no leading, trailing, or consecutive separators.
STANDARD_BRANCH_REGEX="(${BRANCH_TYPES_REGEX})(/(issue|ticket)/[A-Za-z0-9_-]+)?/[a-z0-9]+([.-][a-z0-9]+)*"
ALERT_AUTOFIX_REGEX='alert-autofix-.+'
DEPENDABOT_REGEX='dependabot/.+'
# Branches opened by the Mend Renovate GitHub App (config: default.json preset
# in nswds-devops, consumed via each repo's synced renovate.json).
RENOVATE_REGEX='renovate/.+'
# Branches opened by the nswds-devops file-sync bot (repo-file-sync-action).
REPO_SYNC_REGEX='chore/repo-sync(/.+)?'
BRANCH_REGEX="^(${STANDARD_BRANCH_REGEX}|${ALERT_AUTOFIX_REGEX}|${DEPENDABOT_REGEX}|${RENOVATE_REGEX}|${REPO_SYNC_REGEX})$"
SNYK_REGEX='^snyk-upgrade-[0-9a-f]{32}$'
