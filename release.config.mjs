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
