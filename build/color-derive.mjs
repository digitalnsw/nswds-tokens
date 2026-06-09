// Colour derivation (culori) for Phase 3 (C1 + H1): from a single canonical sRGB value,
// derive every published colour space. hex is canonical (decision #2), so hex and rgb are
// reproduced exactly; hsl and oklch are re-derived.
//
// Derived hsl/oklch components are rounded to 6 decimals. culori's oklch uses transcendental
// maths (cube roots) whose last bits differ across platforms/libm, so "full" IEEE precision is
// NOT reproducible (check:dist would fail in CI). 6 dp is far above that noise floor (~1e-13)
// and perceptually lossless, while being deterministic. sRGB components are exact (r/255) and
// hex is taken from the canonical, so both stay byte-identical.
//
// Canonical input is either a hex string ("#rrggbb") or a DTCG sRGB object
// ({ colorSpace: "srgb", components: [r,g,b] in 0–1, alpha, hex }).

import { converter, formatHex } from 'culori'

const toHsl = converter('hsl')
const toOklch = converter('oklch')
const toRgb = converter('rgb')

const round = (x) => (typeof x === 'number' ? Number(x.toFixed(6)) : x)

// Normalise canonical input to a culori sRGB colour.
export const toSrgb = (canonical) => {
  if (typeof canonical === 'string') return toRgb(canonical)
  const [r, g, b] = canonical.components
  return { mode: 'rgb', r, g, b, alpha: canonical.alpha ?? 1 }
}

// DTCG 2025.10 colour object (C1) for a space, derived from the canonical. Ranges per spec:
//   srgb  -> components [r, g, b]   in 0–1
//   hsl   -> components [H, S, L]   H 0–360 ("none" if powerless), S/L 0–100
//   oklch -> components [L, C, H]   L 0–1, C 0+, H 0–360 ("none" if powerless)
// `hex` is the fallback, taken from the canonical so it stays exact.
export const dtcgValue = (canonical, space) => {
  const srgb = toSrgb(canonical)
  const hex = typeof canonical === 'string' ? formatHex(srgb) : canonical.hex
  const alpha = (typeof canonical === 'string' ? srgb.alpha : canonical.alpha) ?? 1
  switch (space) {
    case 'srgb':
      return { colorSpace: 'srgb', components: [srgb.r, srgb.g, srgb.b], alpha, hex }
    case 'hsl': {
      const { h, s, l } = toHsl(srgb)
      return {
        colorSpace: 'hsl',
        components: [round(h ?? 'none'), round(s * 100), round(l * 100)],
        alpha,
        hex,
      }
    }
    case 'oklch': {
      const { l, c, h } = toOklch(srgb)
      return {
        colorSpace: 'oklch',
        components: [round(l), round(c), round(h ?? 'none')],
        alpha,
        hex,
      }
    }
    default:
      throw new Error(`Unsupported colour space: ${space}`)
  }
}
