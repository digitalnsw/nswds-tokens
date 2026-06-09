// Phase 2 cut-over: generate the per-format style outputs (css/scss/less/js/ts/json/figma/
// tailwind) from the DTCG tokens via Style Dictionary, writing them INTO src/ so the root
// bundle (src/index.ts imports them) and copy-styles (copies them to dist/) pick them up.
//
// This replaces the previously hand-authored src/* format files with generated ones —
// tokens/** is now the single source. SD only writes the files it generates, so files with
// no token source are left untouched on purpose:
//   - orphan Tailwind themes (data-visualisation, fuchsia-orange, fuchsia-blue) — pending M5
//   - prism.css, brand assets
//
// The same configs drive scripts/sd-parity.mjs (which builds to a scratch dir); here we point
// their buildPath at src/.

import StyleDictionary from 'style-dictionary'
import configs from '../build/style-dictionary.config.mjs'

for (const config of configs) {
  for (const platform of Object.values(config.platforms)) {
    platform.buildPath = 'src/'
  }
  await new StyleDictionary(config).buildAllPlatforms()
}

console.log('✅ Generated src/* style outputs from tokens/ via Style Dictionary')
