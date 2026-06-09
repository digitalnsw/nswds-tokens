// Phase 3a-2 (H1 + C1): derive the per-space token view files (hex/rgb/hsl/oklch.json) from
// the single canonical.json per layer. These views are what src/index.ts imports and what
// dist/tokens publishes — so the bundle and the raw-token paths survive, now generated:
//
//   hex.json   -> hex STRING $value (decision #4 keeps the root API's hex view as strings);
//                 masterbrand keeps the alias verbatim ({nsw-blue.50}).
//   rgb.json   -> DTCG sRGB object (C1); hsl/oklch.json -> DTCG hsl/oklch objects (C1).
//                 masterbrand views are RESOLVED against the global canonical (matching the
//                 previous rehydrate behaviour).
//
// Source of truth is canonical.json; run as part of the build (before Style Dictionary).

import { readFileSync, writeFileSync } from 'node:fs'
import { dtcgValue } from '../build/color-derive.mjs'

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const write = (p, o) => writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`)
const isAlias = (v) => typeof v === 'string' && v.startsWith('{')

// Lookup for resolving theme aliases ({nsw-blue.50}) to the global canonical sRGB value.
const globalCanonical = read('tokens/global/color/canonical.json')
const lookup = {}
for (const fam of Object.keys(globalCanonical)) {
  for (const step of Object.keys(globalCanonical[fam])) {
    lookup[`${fam}.${step}`] = globalCanonical[fam][step].$value
  }
}
const resolve = (v) => (isAlias(v) ? lookup[v.slice(1, -1)] : v)

// file name -> how to derive its $value from a canonical value
const VIEWS = {
  hex: (cv, keepAlias) => (isAlias(cv) ? (keepAlias ? cv : resolve(cv).hex) : cv.hex),
  rgb: (cv) => dtcgValue(resolve(cv), 'srgb'),
  hsl: (cv) => dtcgValue(resolve(cv), 'hsl'),
  oklch: (cv) => dtcgValue(resolve(cv), 'oklch'),
}

const LAYERS = [
  { dir: 'tokens/global/color', keepHexAlias: false },
  { dir: 'tokens/semantic/color', keepHexAlias: false },
  { dir: 'tokens/themes/color/masterbrand', keepHexAlias: true },
]

for (const { dir, keepHexAlias } of LAYERS) {
  const canonical = read(`${dir}/canonical.json`)
  for (const [file, derive] of Object.entries(VIEWS)) {
    const out = {}
    for (const fam of Object.keys(canonical)) {
      out[fam] = {}
      for (const step of Object.keys(canonical[fam])) {
        const cv = canonical[fam][step].$value
        out[fam][step] = { $type: 'color', $value: derive(cv, keepHexAlias) }
      }
    }
    write(`${dir}/${file}.json`, out)
  }
}

console.log('✅ Generated per-space token views from canonical.json')
