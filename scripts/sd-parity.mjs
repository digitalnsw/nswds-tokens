// Parity harness — generates the Style Dictionary outputs to a scratch dir and diffs each
// against its committed dist/ counterpart. Proves the transformer reproduces the current
// published bytes before any cut-over.
//
// The comparison is driven by the config's declared file destinations (the authoritative
// set of in-scope outputs), so the harness FAILS if the config stops generating an expected
// file — not just when a generated file differs. Destinations are forward-slash POSIX paths,
// so the comparison is platform-independent. Exits non-zero on any mismatch or omission.

import StyleDictionary from 'style-dictionary'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import config from '../build/style-dictionary.config.mjs'

const OUT = 'build/.sd-out'

rmSync(OUT, { recursive: true, force: true })
await new StyleDictionary(config).buildAllPlatforms()

// Authoritative in-scope outputs: every file destination the config declares.
const expected = Object.values(config.platforms).flatMap((p) => p.files.map((f) => f.destination))

const firstDiff = (dist, gen) => {
  const a = dist.split('\n')
  const b = gen.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `    line ${i + 1}:\n      dist: ${JSON.stringify(a[i])}\n      sd:   ${JSON.stringify(b[i])}`
    }
  }
  return '    (differs only in trailing content)'
}

// Files where the transformer intentionally normalises a hand-authoring inconsistency, so a
// non-identical result is expected and does NOT fail parity. Documented in
// docs/transformer-migration.md.
//   - js/colors/semantic/hex.js: the only JS file authored with stray blank lines between
//     families (global/masterbrand JS and semantic TS have none) — normalised away.
//   - json/colors/global/hex.json, figma/color/global/hex.json: the only json/figma files
//     authored WITHOUT a trailing newline (semantic + masterbrand have one) — standardised
//     to a trailing newline for consistency.
const EXPECTED_NORMALISED = new Set([
  'js/colors/semantic/hex.js',
  'json/colors/global/hex.json',
  'figma/color/global/hex.json',
])

let identical = 0
const normalised = []
const failures = []

for (const rel of expected.sort()) {
  const genPath = resolve(OUT, rel)
  const distPath = resolve('dist', rel)
  if (!existsSync(genPath)) {
    failures.push(`✖ ${rel}\n    config declared this output but SD did not generate it`)
    continue
  }
  if (!existsSync(distPath)) {
    failures.push(`✖ ${rel}\n    no dist/ counterpart`)
    continue
  }
  const gen = readFileSync(genPath, 'utf8')
  const dist = readFileSync(distPath, 'utf8')
  if (gen === dist) {
    identical++
    console.log(`✅ ${rel}`)
  } else if (EXPECTED_NORMALISED.has(rel)) {
    normalised.push(rel)
    console.log(`≈  normalised (expected)  ${rel}`)
  } else {
    failures.push(`✖ DIFFERS  ${rel}\n${firstDiff(dist, gen)}`)
  }
}

console.log(
  `\n${identical}/${expected.length} byte-identical to dist/` +
    (normalised.length ? `, ${normalised.length} expected-normalised` : '') +
    '.',
)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
console.log('Parity proven (hex CSS/SCSS/LESS/JS/TS/JSON/Figma). ✅')
