// Phase 3a-2 (H1 + C1): build the single canonical DTCG sRGB colour source per layer from the
// current hex files. This becomes the ONE hand-/sync-maintained colour representation; every
// other space (hsl/rgb/oklch) and the per-space token views are derived from it.
//
//   concrete tokens (global, semantic):  "#rrggbb" -> DTCG sRGB object
//     { "$type": "color", "$value": { "colorSpace": "srgb", "components": [r,g,b], "alpha": 1, "hex": "#rrggbb" } }
//   theme aliases (masterbrand):         "{nsw-blue.50}" preserved verbatim
//
// Run once; the canonical files are committed. Re-run only to regenerate from updated hex.

import { readFileSync, writeFileSync } from 'node:fs'
import { converter } from 'culori'

const toRgb = converter('rgb')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

const canonicalValue = (hex) => {
  const { r, g, b } = toRgb(hex)
  return { colorSpace: 'srgb', components: [r, g, b], alpha: 1, hex }
}

const isAlias = (v) => typeof v === 'string' && v.startsWith('{')

const buildLayer = (hexObj) => {
  const out = {}
  for (const family of Object.keys(hexObj)) {
    out[family] = {}
    for (const step of Object.keys(hexObj[family])) {
      const v = hexObj[family][step].$value
      out[family][step] = { $type: 'color', $value: isAlias(v) ? v : canonicalValue(v) }
    }
  }
  return out
}

const LAYERS = [
  { hex: 'tokens/global/color/hex.json', out: 'tokens/global/color/canonical.json' },
  { hex: 'tokens/semantic/color/hex.json', out: 'tokens/semantic/color/canonical.json' },
  {
    hex: 'tokens/themes/color/masterbrand/hex.json',
    out: 'tokens/themes/color/masterbrand/canonical.json',
  },
]

for (const { hex, out } of LAYERS) {
  writeFileSync(out, `${JSON.stringify(buildLayer(read(hex)), null, 2)}\n`)
  console.log(`wrote ${out}`)
}
