// Allowed commit types come from commit-types.cjs — the single source of truth.
// Importing it here (rather than re-listing the enum) means commitlint can't drift
// from the SoT; CI then checks the SoT against git-conventional-commits.yaml.
import COMMIT_TYPES from './commit-types.cjs'

/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  // Exempt bot-generated release commits. semantic-release (@semantic-release/git)
  // creates `chore(release): x.y.z [skip ci]` with release notes whose long
  // issue/commit URLs legitimately exceed footer/body line limits. They're not
  // hand-written, so skip linting them entirely. (defaultIgnores stays on, so
  // merge/revert/etc. remain ignored too.)
  ignores: [
    (message) =>
      // The release-commit predicate the comment above promises. It was missing in
      // practice: the v3.5.0 release died in CI when the husky commit-msg hook ran
      // commitlint against semantic-release's changelog commit (footer-max-line-length).
      message.trim().startsWith('chore(release):') ||
      /^Potential fix for code scanning alert no\. \d+: /u.test(message.trim()) ||
      message.trim().startsWith('Potential fix for pull request finding') ||
      message.trim() === 'Initial plan',
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
