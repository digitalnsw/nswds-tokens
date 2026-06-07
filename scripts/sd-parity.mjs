// Parity harness — generates the Style Dictionary outputs to a scratch dir and diffs every
// generated file against its committed dist/ counterpart. Proves the transformer reproduces
// the current published bytes before any cut-over. Exits non-zero on any byte mismatch.

import StyleDictionary from 'style-dictionary'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import config from '../build/style-dictionary.config.mjs'

const OUT = 'build/.sd-out'

rmSync(OUT, { recursive: true, force: true })
await new StyleDictionary(config).buildAllPlatforms()

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

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

// Files where the transformer intentionally normalises a hand-authoring inconsistency,
// so a non-identical result is expected and does NOT fail parity. Documented in
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

const outRoot = resolve(OUT)
const generated = walk(outRoot)
let identical = 0
const normalised = []
const failures = []

for (const genPath of generated.sort()) {
  const rel = relative(outRoot, genPath)
  const distPath = resolve('dist', rel)
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
  `\n${identical}/${generated.length} byte-identical to dist/` +
    (normalised.length ? `, ${normalised.length} expected-normalised` : '') +
    '.',
)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
console.log('Parity proven (hex CSS/SCSS/LESS/JS/TS/JSON/Figma). ✅')
