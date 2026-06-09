// Phase 3b (M5): reverse-engineer DTCG canonical source for the orphan themes from their
// hand-authored Tailwind files (the only place their values live). One-time; commit the output.
//
//   fuchsia-blue / fuchsia-orange — alias themes: each `--color-<fam>-<step>: var(--<target>)`
//     becomes primary/accent/grey -> "{<targetFamily>.<step>}" (mapping read per step).
//   data-visualisation — concrete palette (ember/earthfire): the :root `--<fam>-<step>: #hex`
//     defs become DTCG sRGB canonical values.

import { readFileSync, writeFileSync } from 'node:fs'
import { converter } from 'culori'

const toRgb = converter('rgb')
const write = (p, o) => writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`)
const canonicalValue = (hex) => {
  const { r, g, b } = toRgb(hex)
  return { colorSpace: 'srgb', components: [r, g, b], alpha: 1, hex }
}

const readTailwind = (theme) => readFileSync(`src/tailwind/colors/themes/${theme}/hex.css`, 'utf8')

// Alias theme: each family maps to a global ramp at the SAME step. We read the family->target
// mapping from the reliable 500 step and apply it uniformly across all steps — this corrects
// known per-step copy-paste bugs in the hand-authored files (e.g. primary-850 -> nsw-*-800,
// the same off-by-one already corrected for masterbrand).
const aliasCanonical = (theme) => {
  const css = readTailwind(theme)
  const target = {}
  for (const m of css.matchAll(/--color-(.+?)-500: var\(--(.+)-500\);/g)) {
    target[m[1]] = m[2] // primary -> nsw-fuchsia
  }
  const out = {}
  for (const m of css.matchAll(/--color-(.+?)-(\d+): var\(/g)) {
    const [, fam, step] = m
    ;(out[fam] ??= {})[step] = { $type: 'color', $value: `{${target[fam]}.${step}}` }
  }
  return out
}

// Concrete theme: read the :root `--fam-step: #hex` defs.
const concreteCanonical = (theme) => {
  const css = readTailwind(theme)
  const root = css.slice(css.indexOf(':root'))
  const out = {}
  for (const m of root.matchAll(/--(.+?)-(\d+): (#[0-9a-fA-F]{6});/g)) {
    const [, fam, step, hex] = m
    ;(out[fam] ??= {})[step] = { $type: 'color', $value: canonicalValue(hex) }
  }
  return out
}

write('tokens/themes/color/fuchsia-blue/canonical.json', aliasCanonical('fuchsia-blue'))
write('tokens/themes/color/fuchsia-orange/canonical.json', aliasCanonical('fuchsia-orange'))
write(
  'tokens/themes/color/data-visualisation/canonical.json',
  concreteCanonical('data-visualisation'),
)

console.log('✅ Reverse-engineered orphan theme canonicals from Tailwind output')
