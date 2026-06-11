// Generate the Figma staging files from their canonical sources (dark-mode milestone D1).
//
// Until now nothing produced staging from canonical — the export direction (Figma ->
// tokens) owned regeneration, which works for established collections but cannot
// bootstrap a NEW mode (the dark values exist in canonical before Figma has ever seen
// them). This generator closes that gap and doubles as documentation of what a staging
// file IS: canonical values + per-variable Figma metadata.
//
//   node scripts/generate-staging.mjs           # regenerate every mapped staging file
//   node scripts/generate-staging.mjs --check   # verify staging matches canonical (no writes)
//
// Per-variable $extensions (scopes, codeSyntax, hiddenFromPublishing) are Figma-owned and
// shared across modes, so they are PRESERVED from the existing staging file (for a new
// mode's file, from the light sibling). Token shape matches the exporter exactly
// ({$type, $value, $description, $extensions}) so the byte-stable round-trip holds.
//
// NOTE: dark staging targets are only listed once their figma-collections.ts manifest
// entries exist (milestone D2) — an unmanifested file would hit the filename-split
// fallback in collectionAndModeFromFileName and push as a junk top-level collection.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

// staging file -> canonical source (+ where to copy per-variable extensions from).
const TARGETS = [
  {
    staging: 'tokens/primitives-global.light.json',
    canonical: 'tokens/global/color/canonical.json',
  },
  {
    staging: 'tokens/primitives-semantic.light.json',
    canonical: 'tokens/semantic/color/canonical.json',
  },
  {
    staging: 'tokens/themes-masterbrand.light.json',
    canonical: 'tokens/themes/color/masterbrand/canonical.json',
  },
  { staging: 'tokens/space.base.json', canonical: 'tokens/global/space/canonical.json' },
  { staging: 'tokens/radius.base.json', canonical: 'tokens/global/radius/canonical.json' },
  {
    staging: 'tokens/breakpoints.base.json',
    canonical: 'tokens/global/breakpoints/canonical.json',
  },
  { staging: 'tokens/typography.base.json', canonical: 'tokens/global/typography/canonical.json' },
  { staging: 'tokens/border.base.json', canonical: 'tokens/global/border/canonical.json' },
  // D2 (requires manifest entries first — see NOTE above):
  // { staging: 'tokens/primitives-global.dark.json', canonical: 'tokens/global/color/canonical.dark.json', extensionsFrom: 'tokens/primitives-global.light.json' },
  // { staging: 'tokens/primitives-semantic.dark.json', canonical: 'tokens/semantic/color/canonical.dark.json', extensionsFrom: 'tokens/primitives-semantic.light.json' },
]

const generate = ({ staging, canonical, extensionsFrom }) => {
  const source = read(canonical)
  const extensionsSource = existsSync(extensionsFrom ?? staging)
    ? read(extensionsFrom ?? staging)
    : {}
  const out = {}
  // Figma-resident extras: top-level groups that exist in the staging file (i.e. in the
  // Figma collection) but have NO canonical source — e.g. variables created directly in
  // Figma ('white', 'black', a stray 'Font family' string). Preserve them VERBATIM so the
  // generator is non-destructive, and report them: each one is either a candidate for
  // promotion into canonical or design-side cleanup.
  const extras = Object.keys(extensionsSource).filter((f) => !(f in source))
  if (extras.length) {
    console.warn(
      `  ⚠ ${staging}: preserving ${extras.length} Figma-resident group(s) with no canonical source: ${extras.join(', ')}`,
    )
  }
  // Key order follows the existing staging file (Figma export order — extras come last),
  // with canonical-only families appended; byte-stability with the exporter depends on it.
  const families = [
    ...Object.keys(extensionsSource).filter((f) => f in source || extras.includes(f)),
    ...Object.keys(source).filter((f) => !(f in extensionsSource)),
  ]
  for (const family of families) {
    if (extras.includes(family)) {
      out[family] = extensionsSource[family]
      continue
    }
    out[family] = {}
    for (const step of Object.keys(source[family])) {
      const tok = source[family][step]
      const prior = extensionsSource[family]?.[step]
      out[family][step] = {
        $type: tok.$type,
        $value: tok.$value,
        $description: tok.$description ?? '',
        ...(prior?.$extensions ? { $extensions: prior.$extensions } : {}),
      }
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

const checkOnly = process.argv.includes('--check')
let failed = 0
for (const target of TARGETS) {
  if (!existsSync(target.canonical)) continue
  const next = generate(target)
  if (checkOnly) {
    const current = existsSync(target.staging) ? readFileSync(target.staging, 'utf8') : ''
    if (current !== next) {
      console.error(`✗ ${target.staging} does not match its canonical source`)
      failed++
    } else {
      console.log(`✓ ${target.staging}`)
    }
  } else {
    writeFileSync(target.staging, next)
    console.log(`wrote ${target.staging}`)
  }
}
if (failed > 0) process.exit(1)
if (checkOnly) console.log('✅ All staging files match their canonical sources')
