// Parity harness — generates the Style Dictionary outputs to a scratch dir and diffs each
// against its committed dist/ counterpart. Proves the transformer reproduces the current
// published bytes before any cut-over.
//
// One config per colour space (they share token paths and would collide in one source).
// The comparison is driven by the configs' declared file destinations (the authoritative set
// of in-scope outputs), so the harness FAILS if a config stops generating an expected file —
// not just when a generated file differs. Destinations are forward-slash POSIX paths, so the
// comparison is platform-independent. Exits non-zero on any mismatch or omission.

import StyleDictionary from 'style-dictionary'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import configs from '../build/style-dictionary.config.mjs'

const OUT = 'build/.sd-out'
const SPACES = ['hex', 'hsl', 'rgb', 'oklch']

rmSync(OUT, { recursive: true, force: true })
for (const config of configs) {
  await new StyleDictionary(config).buildAllPlatforms()
}

// Authoritative in-scope outputs: every file destination every config declares.
const expected = configs.flatMap((config) =>
  Object.values(config.platforms).flatMap((p) => p.files.map((f) => f.destination)),
)

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

// Exact transforms of the dist content -> what the transformer SHOULD produce. The harness
// requires gen === transform(dist), so only the known difference is tolerated; any OTHER
// change in an allow-listed file still fails parity (no masking).
const addNewline = (d) => `${d}\n`
const dropFamilyBlankLines = (d) => d.replaceAll('}\n\nexport const', '}\nexport const')
const inlineChannels = (d) =>
  d.replace(
    /"channels": \[\n\s*([^\]]+?)\n\s*\]/g,
    (_, inner) =>
      `"channels": [${inner
        .split(',')
        .map((s) => s.trim())
        .join(', ')}]`,
  )
const noneToZero = (d) => d.replaceAll(' none)', ' 0)') // achromatic oklch hue: JSON uses `none`
const fixPrimary850 = (d) =>
  d.replace(
    '--color-primary-850: var(--nsw-blue-800);',
    '--color-primary-850: var(--nsw-blue-850);',
  )

// Cosmetic hand-authoring inconsistencies the transformer standardises (no value differs).
// Documented in docs/transformer-migration.md. Patterns recur across colour spaces.
const EXPECTED_NORMALISED = {
  //   stray blank lines between families (only the semantic JS files have them)
  ...Object.fromEntries(SPACES.map((s) => [`js/colors/semantic/${s}.js`, dropFamilyBlankLines])),
  //   missing trailing newline (global json/figma); global oklch JSON also uses `none`
  ...Object.fromEntries(
    SPACES.map((s) => [
      `json/colors/global/${s}.json`,
      s === 'oklch' ? (d) => addNewline(noneToZero(d)) : addNewline,
    ]),
  ),
  //   figma global: hex has no channels; hsl/rgb/oklch also need arrays inlined
  ...Object.fromEntries(
    SPACES.map((s) => [
      `figma/color/global/${s}.json`,
      s === 'hex' ? addNewline : (d) => addNewline(inlineChannels(d)),
    ]),
  ),
  //   JSON is the only format that renders the achromatic oklch hue as `none` (others use 0)
  'json/colors/themes/masterbrand/oklch.json': (d) => d.replaceAll(' none)', ' 0)'),
}

// Value-affecting corrections — the masterbrand Tailwind `primary-850` alias bug (see the
// transformer-migration doc). Full-line replace so the legitimate primary-800 token is intact.
const EXPECTED_CORRECTED = Object.fromEntries(
  SPACES.map((s) => [`tailwind/colors/themes/masterbrand/${s}.css`, fixPrimary850]),
)

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
console.log('Parity proven — all formats × all colour spaces (hex/hsl/rgb/oklch). ✅')
