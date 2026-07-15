// Single source of truth for the allowed conventional-commit types.
//
// Consumed by:
//   - commitlint.config.mjs               imports this array directly
//   - git-conventional-commits.yaml       live config for the downstream
//                                          git-conventional-commits CLI, and the
//                                          shell tooling's offline fallback; its
//                                          type list is kept in sync with this
//                                          file by scripts/check-commit-types-sync.sh
//   - scripts/conventional-commit-config.sh  reads this file as the preferred source
//
// Edit this list here only; the YAML is enforced against it in CI.
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
]
