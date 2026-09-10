// Release-rule regression guard (C1).
//
// Runs the repo's ACTUAL @semantic-release/commit-analyzer configuration
// (imported from release.config.mjs) against a matrix of commit messages and
// asserts the computed release type. This is a hermetic "dry run" of the
// version-bump decision — no network, git history, npm, or tokens required —
// so it runs deterministically on every PR.
//
// Why it exists: the `!` bang notation (`feat!:`, `build(tokens)!:`) was being
// silently ignored, shipping a breaking change (#79, the DTCG sRGB shape) as a
// MINOR (v2.33.0) instead of a major. This guard fails CI if breaking commits
// stop mapping to `major`.

import { analyzeCommits } from '@semantic-release/commit-analyzer'
import releaseConfig from '../release.config.mjs'

const PLUGIN = '@semantic-release/commit-analyzer'

const entry = releaseConfig.plugins.find((p) => Array.isArray(p) && p[0] === PLUGIN)
if (!entry) {
  console.error(`✗ ${PLUGIN} is not configured in release.config.mjs`)
  process.exit(1)
}
const pluginConfig = entry[1] ?? {}

// [commit message, expected release type]
const cases = [
  // Breaking: `!` header (the case that regressed) — across the types this repo uses.
  ['feat!: drop legacy export', 'major'],
  ['build(tokens)!: reshape DTCG colour objects', 'major'],
  ['refactor(tokens)!: move Figma-sync files to sRGB shape', 'major'],
  // Breaking: footer form must also work.
  ['fix(api): tweak\n\nBREAKING CHANGE: response shape changed', 'major'],
  // Prose about breaking things is NOT a footer. The bundled parser accepts a
  // space where the Conventional Commits footer requires a colon, so these two
  // shapes shipped false majors elsewhere in the fleet — engagement v2.0.0 off
  // a Renovate bump whose body said the changes did not affect that repo, and
  // nswds-email v3.0.0 off a refactor. parserOpts.notesPattern requires the
  // colon; without it both of these resolve to major.
  [
    'fix(deps): update dependency resend to v6\n\nThe upstream notes list several changes.\nbreaking changes across v5 and v6 do not affect this repo.',
    'patch',
  ],
  [
    'refactor(tokens): pin the convention\n\nChecked both ways: one fails, and\nbreaking the derivation fails on the guard rather than passing.',
    null,
  ],
  // Non-breaking baselines.
  ['feat(color): add token', 'minor'],
  ['fix(color): correct value', 'patch'],
  ['style(scripts): reformat', 'patch'],
  ['docs(readme): clarify usage', null],
  ['chore(deps): bump axios', null],
]

const logger = { log: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

let failed = 0
for (const [message, expected] of cases) {
  const got = await analyzeCommits(pluginConfig, {
    commits: [{ hash: '0'.repeat(40), message }],
    logger,
    cwd: process.cwd(),
  })
  const ok = got === expected
  if (!ok) failed++
  const label = JSON.stringify(message.split('\n')[0])
  console.log(
    `${ok ? '✓' : '✗'} ${label.padEnd(52)} -> ${String(got)} (expected ${String(expected)})`,
  )
}

if (failed > 0) {
  console.error(
    `\n✗ Release-rule assertion FAILED (${failed} case(s)). ` +
      `Breaking commits must map to a major bump — check parserOpts.breakingHeaderPattern ` +
      `and the { breaking: true, release: 'major' } rule in release.config.mjs.`,
  )
  process.exit(1)
}
console.log(
  '\n✅ Release rules honour breaking changes (`!` header and BREAKING CHANGE footer -> major).',
)
