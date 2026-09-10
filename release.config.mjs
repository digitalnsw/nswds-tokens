// Shared Conventional-Commits parsing options.
//
// IMPORTANT: `breakingHeaderPattern` is required for the `!` bang notation
// (e.g. `feat!:`, `build(tokens)!:`) to be detected as a breaking change.
// The `conventionalcommits` preset alone does NOT honour `!` with the version
// of conventional-commits-parser that semantic-release v25 bundles — without
// this pattern, a `build(tokens)!` commit is treated as non-breaking. That bug
// shipped the DTCG shape change (#79) as a minor (v2.33.0) instead of a major.
// See scripts/assert-release-rules.mjs for the regression guard.
const parserOpts = {
  noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING'],
  // notesPattern requires the COLON that the Conventional Commits footer
  // specifies. semantic-release bundles conventional-commits-parser v6, whose
  // default note regex is `^[\\s|*]*(KEYWORDS)[:\\s]+(.*)` — that `[:\\s]+`
  // accepts a SPACE, so an ordinary body line beginning "breaking changes ..."
  // declared a breaking change and took the rest of the sentence as its
  // description. It shipped digitalnsw/engagement v2.0.0 off a Renovate
  // `fix(deps)` bump whose body said the breaking changes did not affect that
  // repo, and digitalnsw/nswds-email v3.0.0 off a refactor.
  //
  // This package publishes to npm, so a false major reaches real consumers.
  //
  // Case-insensitivity and the keyword list are both kept: missing a real
  // breaking change is worse than the prose this costs. The leading `[\\s|*]*`
  // is kept because a squashed PR body arrives bulleted. Commitlint cannot
  // catch this — it resolves parser v7, which already requires the colon.
  // See digitalnsw/nswds-devops#129.
  notesPattern: (keywords) => new RegExp(`^[\\s|*]*(${keywords}):\\s+(.*)`, 'i'),
  breakingHeaderPattern: /^(\w+)(?:\(([^)]*)\))?!: (.*)$/,
}

const releaseConfig = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        parserOpts,
        releaseRules: [
          // Any breaking change (`!` header or `BREAKING CHANGE:` footer) -> major.
          { breaking: true, release: 'major' },
          { type: 'style', release: 'patch' },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        parserOpts,
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
  ],
}

export default releaseConfig
