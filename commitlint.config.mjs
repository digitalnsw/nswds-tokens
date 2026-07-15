// Allowed commit types come from commit-types.mjs — the single source of truth.
// CI (scripts/check-commit-types-sync.sh) checks that file against
// git-conventional-commits.yaml, so edit the type list in commit-types.mjs only.
import COMMIT_TYPES from './commit-types.mjs'

/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  // Exempt bot-generated release commits. semantic-release (@semantic-release/git)
  // creates `chore(release): x.y.z [skip ci]` with release notes whose long
  // issue/commit URLs legitimately exceed footer/body line limits. They're not
  // hand-written, so skip linting them entirely. (defaultIgnores stays on, so
  // merge/revert/etc. remain ignored too.)
  ignores: [
    (message) => {
      const subject = message.trim()
      return (
        /^chore\(release\):/.test(message) ||
        // GitHub code-scanning / Copilot bots open PRs whose commit subjects
        // aren't Conventional Commits ("Potential fix for…", "Initial plan").
        // Commitlint CI lints the whole PR range, so without these exemptions
        // every bot-authored PR fails the check.
        /^Potential fix for code scanning alert no\. \d+: /u.test(subject) ||
        subject.startsWith('Potential fix for pull request finding') ||
        subject === 'Initial plan'
      )
    },
  ],
  rules: {
    // Warn (not error) on body lines over 100 chars. AI commit tools like
    // OpenCommit emit unwrapped prose, so this keeps the readability nudge
    // without blocking CI. Raise to severity 2 once messages are wrapped.
    'body-max-line-length': [1, 'always', 100],
    'type-enum': [2, 'always', COMMIT_TYPES],
  },
}

export default config
