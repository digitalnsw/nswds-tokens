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
// Modes (dark-mode milestone D1): a layer with canonical.dark.json beside canonical.json
// gets a parallel set of *.dark.json views. Theme aliases resolve against the SAME MODE's
// global canonical, so a theme follows the active mode automatically once it has one.
// canonical.json remains the implicit light/default mode (no rename — non-breaking).
//
// Source of truth is canonical[.<mode>].json; run as part of the build (before SD).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dtcgValue } from '../build/color-derive.mjs'

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const write = (p, o) => writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`)
const isAlias = (v) => typeof v === 'string' && v.startsWith('{')
// Flat token (no step ramp): `white`/`black` are single variables, not 19-step families.
const isToken = (node) => node && typeof node === 'object' && '$value' in node

const MODES = ['light', 'dark'] // light = implicit default file names
const canonicalPath = (dir, mode) =>
  mode === 'light' ? `${dir}/canonical.json` : `${dir}/canonical.${mode}.json`
const viewPath = (dir, file, mode) =>
  mode === 'light' ? `${dir}/${file}.json` : `${dir}/${file}.${mode}.json`

// Per-mode lookups for resolving theme aliases ({nsw-blue.50}) to the matching mode's
// global canonical sRGB value.
const lookups = {}
for (const mode of MODES) {
  const p = canonicalPath('tokens/global/color', mode)
  if (!existsSync(p)) continue
  const globalCanonical = read(p)
  const lookup = {}
  for (const fam of Object.keys(globalCanonical)) {
    if (isToken(globalCanonical[fam])) {
      lookup[fam] = globalCanonical[fam].$value // flat token (white/black)
      continue
    }
    for (const step of Object.keys(globalCanonical[fam])) {
      lookup[`${fam}.${step}`] = globalCanonical[fam][step].$value
    }
  }
  lookups[mode] = lookup
}
// Fail fast with the alias and mode in the message: a missing per-mode global canonical
// or a misspelled alias would otherwise surface as an undefined-property TypeError far
// from the cause (latent until D3, when theme layers — which alias — gain dark canonicals).
const resolveAlias = (v, mode) => {
  if (!isAlias(v)) return v
  const lookup = lookups[mode]
  if (!lookup)
    throw new Error(
      `cannot resolve alias ${v}: no global colour canonical exists for mode "${mode}"`,
    )
  const resolved = lookup[v.slice(1, -1)]
  if (!resolved)
    throw new Error(`cannot resolve alias ${v} against the ${mode} global colour canonical`)
  return resolved
}

// file name -> how to derive its $value from a canonical value
const VIEWS = {
  hex: (cv, keepAlias, mode) =>
    isAlias(cv) ? (keepAlias ? cv : resolveAlias(cv, mode).hex) : cv.hex,
  rgb: (cv, _keepAlias, mode) => dtcgValue(resolveAlias(cv, mode), 'srgb'),
  hsl: (cv, _keepAlias, mode) => dtcgValue(resolveAlias(cv, mode), 'hsl'),
  oklch: (cv, _keepAlias, mode) => dtcgValue(resolveAlias(cv, mode), 'oklch'),
}

const LAYERS = [
  { dir: 'tokens/global/color', keepHexAlias: false },
  { dir: 'tokens/semantic/color', keepHexAlias: false },
  { dir: 'tokens/themes/color/masterbrand', keepHexAlias: true },
  { dir: 'tokens/themes/color/fuchsia-blue', keepHexAlias: true },
  { dir: 'tokens/themes/color/fuchsia-orange', keepHexAlias: true },
  { dir: 'tokens/themes/color/data-visualisation', keepHexAlias: false },
]

for (const { dir, keepHexAlias } of LAYERS) {
  for (const mode of MODES) {
    const src = canonicalPath(dir, mode)
    if (!existsSync(src)) continue // e.g. themes have no dark canonical yet (D3)
    const canonical = read(src)
    for (const [file, derive] of Object.entries(VIEWS)) {
      const out = {}
      const viewToken = ({ $value: cv, $description }) => ({
        $type: 'color',
        ...($description ? { $description } : {}),
        $value: derive(cv, keepHexAlias, mode),
      })
      for (const fam of Object.keys(canonical)) {
        if (isToken(canonical[fam])) {
          out[fam] = viewToken(canonical[fam])
          continue
        }
        out[fam] = {}
        for (const step of Object.keys(canonical[fam])) {
          out[fam][step] = viewToken(canonical[fam][step])
        }
      }
      write(viewPath(dir, file, mode), out)
    }
  }
}

console.log('✅ Generated per-space token views from canonical sources (per mode)')
