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

// Files where the transformer intentionally normalises a hand-authoring inconsistency.
// Each maps the dist content to EXACTLY what the transformer should produce, so only the
// known difference is tolerated — any OTHER change still fails parity (no masking).
// Documented in docs/transformer-migration.md.
//   - js/colors/semantic/hex.js: the only JS file with stray blank lines between families
//     (global/masterbrand JS and semantic TS have none) — blank lines removed.
//   - json/colors/global/hex.json, figma/color/global/hex.json: the only json/figma files
//     authored WITHOUT a trailing newline (semantic + masterbrand have one) — standardised.
const EXPECTED_NORMALISED = {
  'js/colors/semantic/hex.js': (dist) => dist.replaceAll('}\n\nexport const', '}\nexport const'),
  'json/colors/global/hex.json': (dist) => `${dist}\n`,
  'figma/color/global/hex.json': (dist) => `${dist}\n`,
}

// Files where the transformer CORRECTS a value-affecting bug. The mapping applies ONLY the
// intended fix to the dist content, so any unrelated change in the file still fails.
//   - tailwind/colors/themes/masterbrand/hex.css: dist maps `--color-primary-850` to
//     `var(--nsw-blue-800)`, but the source aliases `{nsw-blue.850}` and every other format
//     resolves primary-850 to nsw-blue.850 (#001a4d). dist is wrong (#002664). NB: a full-line
//     replace (not a bare `nsw-blue-800`) so the legitimate primary-800 token is untouched.
const EXPECTED_CORRECTED = {
  'tailwind/colors/themes/masterbrand/hex.css': (dist) =>
    dist.replace(
      '--color-primary-850: var(--nsw-blue-800);',
      '--color-primary-850: var(--nsw-blue-850);',
    ),
}

let identical = 0
const normalised = []
const corrected = []
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
  } else if (rel in EXPECTED_NORMALISED) {
    const expectedGen = EXPECTED_NORMALISED[rel](dist)
    if (gen === expectedGen) {
      normalised.push(rel)
      console.log(`≈  normalised (expected)  ${rel}`)
    } else {
      failures.push(
        `✖ ${rel}\n    differs BEYOND the known normalisation:\n${firstDiff(expectedGen, gen)}`,
      )
    }
  } else if (rel in EXPECTED_CORRECTED) {
    const expectedGen = EXPECTED_CORRECTED[rel](dist)
    if (gen === expectedGen) {
      corrected.push(rel)
      console.log(`✦  corrected dist bug (expected)  ${rel}`)
    } else {
      failures.push(
        `✖ ${rel}\n    differs BEYOND the known correction:\n${firstDiff(expectedGen, gen)}`,
      )
    }
  } else {
    failures.push(`✖ DIFFERS  ${rel}\n${firstDiff(dist, gen)}`)
  }
}

console.log(
  `\n${identical}/${expected.length} byte-identical to dist/` +
    (normalised.length ? `, ${normalised.length} normalised` : '') +
    (corrected.length ? `, ${corrected.length} corrected` : '') +
    '.',
)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
console.log('Parity proven (hex — all formats: CSS/SCSS/LESS/JS/TS/JSON/Figma/Tailwind). ✅')
