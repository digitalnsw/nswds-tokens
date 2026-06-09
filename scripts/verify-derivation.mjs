// Phase 3a guard: prove that deriving every colour space from the hex canonical (decision #2)
// reproduces the current source values for hex + rgb exactly, and quantify the hsl/oklch drift
// (full-precision culori re-derivation, accepted). Run before/after the H1 collapse so the
// only changes are the expected ones.
//
// Compares the derived CSS function string against the current per-space source files'
// channels for global + semantic (concrete) tokens. masterbrand aliases resolve to globals,
// so it follows by construction.

import { readFileSync } from 'node:fs'
import { cssString } from '../build/color-derive.mjs'

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

// Re-create the current source's CSS string for a space from its object-form channels,
// to compare apples-to-apples against the derived value.
const sourceString = (space, value) => {
  if (space === 'hex') return value // hex source is a string
  const c = value.channels
  if (space === 'rgb') return `rgb(${c.join(', ')})`
  if (space === 'hsl') return `hsl(${c[0]}, ${c[1]}%, ${c[2]}%)`
  if (space === 'oklch') return `oklch(${c[0]} ${c[1]} ${c[2] ?? 0})`
  throw new Error(space)
}

const SPACES = ['hex', 'rgb', 'hsl', 'oklch']
const stats = Object.fromEntries(SPACES.map((s) => [s, { same: 0, drift: 0, samples: [] }]))
let total = 0

for (const layer of ['global', 'semantic']) {
  const src = Object.fromEntries(SPACES.map((s) => [s, read(`tokens/${layer}/color/${s}.json`)]))
  for (const fam of Object.keys(src.hex)) {
    for (const step of Object.keys(src.hex[fam])) {
      total++
      const hex = src.hex[fam][step].$value
      for (const space of SPACES) {
        const derived = cssString(hex, space)
        const current = sourceString(space, src[space][fam][step].$value)
        if (derived === current) stats[space].same++
        else {
          stats[space].drift++
          if (stats[space].samples.length < 2)
            stats[space].samples.push(`${fam}.${step}: ${current} -> ${derived}`)
        }
      }
    }
  }
}

console.log(`Derived from hex canonical vs current source (${total} tokens, global + semantic):\n`)
for (const space of SPACES) {
  const { same, drift, samples } = stats[space]
  const tag = drift === 0 ? '✅ byte-identical' : `≈ ${drift} drift (expected, full-precision)`
  console.log(`  ${space.padEnd(5)} ${same}/${total} same  ${tag}`)
  for (const s of samples) console.log(`         e.g. ${s}`)
}

// hex + rgb MUST be exact — fail if not. hsl/oklch drift is expected.
const broken = ['hex', 'rgb'].filter((s) => stats[s].drift > 0)
if (broken.length) {
  console.error(`\n❌ ${broken.join(', ')} must derive exactly from the hex canonical but did not.`)
  process.exit(1)
}
console.log(
  '\n✅ hex + rgb reproduce exactly from the hex canonical; hsl + oklch drift as expected.',
)
