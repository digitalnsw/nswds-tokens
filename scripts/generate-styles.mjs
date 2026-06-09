// Phase 2 cut-over: generate the per-format style outputs (css/scss/less/js/ts/json/figma/
// tailwind) from the DTCG tokens via Style Dictionary, writing them INTO src/ so the root
// bundle (src/index.ts imports them) and copy-styles (copies them to dist/) pick them up.
//
// This replaces the previously hand-authored src/* format files with generated ones —
// tokens/** is now the single source.
//
// Cleanup: SD only writes the destinations it declares, so a file that stops being generated
// (e.g. after dropping a colour space) would otherwise linger in src/ and still be published.
// To avoid that, we first remove the SD-OWNED destination directories (derived from the config
// destinations) and regenerate them. Everything else is preserved because it lives in OTHER
// directories that are never destinations:
//   - orphan Tailwind themes (data-visualisation, fuchsia-orange, fuchsia-blue) — pending M5
//   - prism.css, brand assets, src/index.ts

import StyleDictionary from 'style-dictionary'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import configs from '../build/style-dictionary.config.mjs'

const SRC = 'src'

// Point every platform at src/ and collect the directories SD owns.
const ownedDirs = new Set()
for (const config of configs) {
  for (const platform of Object.values(config.platforms)) {
    platform.buildPath = `${SRC}/`
    for (const file of platform.files) ownedDirs.add(dirname(file.destination))
  }
}

// Clean the SD-owned directories so no-longer-generated files don't stick around.
for (const dir of ownedDirs) {
  rmSync(resolve(SRC, dir), { recursive: true, force: true })
}

for (const config of configs) {
  await new StyleDictionary(config).buildAllPlatforms()
}

console.log('✅ Generated src/* style outputs from tokens/ via Style Dictionary')
