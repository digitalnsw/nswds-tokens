// Post-release guard: the npm registry must match the newest release tag.
//
// semantic-release can partially fail — tag pushed and GitHub release created, but the
// npm publish itself rejected (expired NPM_TOKEN is the classic) — and the job can still
// look green. This script turns that state into a hard job failure: after
// semantic-release runs, npm's latest version must equal the newest v* tag.
//
// (Outright failures — like the June 2026 Node-engine refusals, which died before
// tagging — already turn the run red; the file-release-failure-issue workflow step is
// what makes THOSE loud. This guard covers the tagged-but-unpublished gap that would
// otherwise look green.)
//
// Runs unconditionally on every release run — including pushes that legitimately release
// nothing (docs/chore) — so a tagged-but-unpublished gap left by an earlier run also
// turns the next run red instead of hiding behind "this push had nothing to release".

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Argument arrays, no shell — matches the spawnSync convention in the other scripts.
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim()

const { name } = JSON.parse(readFileSync('package.json', 'utf8'))
const latestTag = run('git', ['tag', '-l', 'v*', '--sort=-v:refname']).split('\n')[0]

if (!latestTag) {
  console.log('No release tags exist yet — nothing to verify.')
  process.exit(0)
}

const expected = latestTag.slice(1)

// The registry can lag a fresh publish by seconds; poll before declaring failure.
const ATTEMPTS = 6
const DELAY_SECONDS = 15

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  let published = ''
  try {
    published = run(npmCommand, ['view', name, 'version'])
  } catch {
    // Transient registry error — treat like a propagation delay and retry.
  }

  if (published === expected) {
    console.log(`✅ npm has ${name}@${published}, matching the latest tag (${latestTag}).`)
    process.exit(0)
  }

  console.log(
    `npm latest is ${published || 'unavailable'}, expected ${expected} (attempt ${attempt}/${ATTEMPTS})`,
  )
  if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, DELAY_SECONDS * 1000))
}

console.error(
  `❌ npm latest for ${name} does not match the newest release tag ${latestTag} — the registry is behind the repo. Check the semantic-release output and NPM_TOKEN.`,
)
process.exit(1)
