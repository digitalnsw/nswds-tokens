// Structural integrity check for package-lock.json.
//
// LOAD-BEARING (main was red once already): #164 (lock file maintenance) bumped
// rolldown 1.2.1 -> 1.2.2 and wrote the android-arm64 binding as a version-less
// stub — `{"dev": true, "optional": true}`, no version/resolved/integrity.
// arborist's canDedupe() calls semver.eq() on that empty version, so every
// `npm ci` died with `TypeError: Invalid Version:` before installing anything,
// and every PR opened against main failed until #166 repaired it.
//
// Neither #164's own CI nor the Release run on the broken commit caught it:
// release.yml sets `package-manager-cache: false` and starts from an empty tree,
// so it never reaches the dedupe path that trips the malformed node, while PR
// jobs use `cache: npm` and do. A green release run is therefore NOT evidence
// that the lockfile is sound — which is exactly why this check is cheap, runs
// without installing anything, and gates every PR.
//
// npm cannot self-repair this: `npm install --package-lock-only` parses the bad
// entry first and throws the same error. The fix is to delete the offending
// entry from package-lock.json, then re-run `npm install --package-lock-only`.

import { readFileSync } from 'node:fs'

const lockfileUrl = new URL('../package-lock.json', import.meta.url)
const packageLock = JSON.parse(readFileSync(lockfileUrl, 'utf8'))
const issues = []
let hasEntryIssue = false

const packages = packageLock.packages

if (!packages || typeof packages !== 'object') {
  // lockfileVersion 1 has no `packages` map; this repo is on 3 and the release
  // metadata check pins the shape, so treat its absence as a defect, not a skip.
  issues.push(
    `package-lock.json has no "packages" map (lockfileVersion ${packageLock.lockfileVersion}); expected lockfileVersion 2 or 3.`,
  )
} else {
  for (const [path, entry] of Object.entries(packages)) {
    // The root entry ("") takes its version from package.json — check-release-metadata.mjs
    // already asserts those agree. `link: true` entries are workspace symlinks that
    // legitimately carry a target path instead of a version.
    if (path === '' || entry.link) {
      continue
    }

    if (typeof entry.version !== 'string' || entry.version === '') {
      issues.push(`${path} has no version — npm ci will fail with "Invalid Version:".`)
      hasEntryIssue = true
    }

    // `extraneous` marks a package that is installed but not reachable from any
    // dependency. It should never survive into a committed lockfile; one has now
    // twice (removed in #159, reintroduced by #164, removed again in #166).
    if (entry.extraneous) {
      issues.push(`${path} is marked extraneous — regenerate the lockfile from a clean tree.`)
      hasEntryIssue = true
    }
  }
}

if (issues.length > 0) {
  console.error('package-lock.json is malformed:')
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  if (hasEntryIssue) {
    console.error('')
    console.error('Repair: delete the offending entries from package-lock.json, then run')
    console.error('`npm install --package-lock-only` and commit the result.')
  }

  process.exit(1)
}

console.log(
  `package-lock.json is well-formed (${Object.keys(packages).length} entries, lockfileVersion ${packageLock.lockfileVersion}).`,
)
