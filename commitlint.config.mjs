// Source of truth for allowed commit types. scripts/conventional-commit-config.sh
// reads this via `commitlint --print-config`, and CI checks it against
// git-conventional-commits.yaml — keep the type-enum below in sync with the YAML.
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
      /^Potential fix for code scanning alert no\. \d+: /u.test(message.trim()) ||
      message.trim().startsWith('Potential fix for pull request finding') ||
      message.trim() === 'Initial plan',
  ],
  rules: {
    // Warn (not error) on body lines over 100 chars. AI commit tools like
    // OpenCommit emit unwrapped prose, so this keeps the readability nudge
    // without blocking CI. Raise to severity 2 once messages are wrapped.
    'body-max-line-length': [1, 'always', 100],
    'type-enum': [
      2,
      'always',
      [
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
      ],
    ],
  },
}

export default config
