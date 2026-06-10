# Source this file from other scripts to share branch naming rules.

BRANCH_TYPES_REGEX='feature|bugfix|hotfix|release|docs|build|test|refactor|style|chore'
BRANCH_TYPES_CSV='feature, bugfix, hotfix, release, docs, build, test, refactor, style, chore'
STANDARD_BRANCH_REGEX="(${BRANCH_TYPES_REGEX})(/(issue|ticket)/[A-Za-z0-9_-]+)?/[a-z0-9-]+"
ALERT_AUTOFIX_REGEX='alert-autofix-.+'
DEPENDABOT_REGEX='dependabot/.+'
BRANCH_REGEX="^(${STANDARD_BRANCH_REGEX}|${ALERT_AUTOFIX_REGEX}|${DEPENDABOT_REGEX})$"
SNYK_REGEX='^snyk-upgrade-[0-9a-f]{32}$'
