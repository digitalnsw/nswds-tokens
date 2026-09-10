// Shared Conventional-Commits parsing options.
//
// `breakingHeaderPattern` is a DEFENSIVE FALLBACK for the `!` bang notation
// (e.g. `feat!:`, `build(tokens)!:`). It was required when it was added: the
// `conventionalcommits` preset did not honour `!`, a `build(tokens)!` commit
// was treated as non-breaking, and that shipped the DTCG shape change (#79) as
// a minor (v2.33.0) instead of a major.
//
// It is no longer what makes the bang work. Measured on semantic-release 25.0.9
// as installed here: deleting the pattern leaves every `!` case in
// scripts/assert-release-rules.mjs still resolving to major, because the preset
// now handles the bang itself. Keep it for the version that stops doing so —
// but what to re-verify on an upgrade is that `feat!:` still majors, not that
// this line is what makes it. That guard is the thing to trust.
const parserOpts = {
  // `BREAKING-CHANGE` is the Conventional Commits spec's synonym for
  // `BREAKING CHANGE`. The preset honours it by default; replacing the default
  // with this hand-written list dropped it, so a correctly written
  // `BREAKING-CHANGE:` footer released as a PATCH. This package publishes to
  // npm, so that is the worse direction: consumers upgrade automatically into
  // the break. notesPattern requires the colon, so it cannot match prose.
  // See digitalnsw/nswds-devops#130.
  noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING-CHANGE', 'BREAKING'],
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
