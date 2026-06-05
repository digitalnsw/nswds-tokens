// Conventional Commits linting.
// Type list mirrors git-conventional-commits.yaml (note: `ops` and `merge` are not in
// the default @commitlint/config-conventional preset, so they are listed explicitly).
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Bodies often contain long generated text / URLs; the 100-char default is too strict
    // and is the one rule that conflicts with auto-generated (e.g. opencommit) messages.
    'body-max-line-length': [0, 'always'],
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
