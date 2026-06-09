// Colour derivation (culori) for Phase 3 (C1 + H1): from a single canonical sRGB value,
// derive every published colour space. hex is canonical (decision #2), so hex and rgb are
// reproduced exactly; hsl and oklch are re-derived at full precision (the accepted drift).
//
// Canonical input is either a hex string ("#rrggbb") or a DTCG sRGB object
// ({ colorSpace: "srgb", components: [r,g,b] in 0–1, alpha, hex }).

import { converter, formatHex } from 'culori'

const toRgb = converter('rgb')
const toHsl = converter('hsl')
const toOklch = converter('oklch')

// Normalise canonical input to a culori sRGB colour.
export const toSrgb = (canonical) => {
  if (typeof canonical === 'string') return toRgb(canonical)
  const [r, g, b] = canonical.components
  return { mode: 'rgb', r, g, b, alpha: canonical.alpha ?? 1 }
}

// CSS function string for an output space, matching the published syntax.
//   hex   -> "#rrggbb"               (from the canonical, exact)
//   rgb   -> "rgb(250, 250, 250)"    (0–255, round-trips exactly)
//   hsl   -> "hsl(H, S%, L%)"        (full precision; achromatic hue -> 0)
//   oklch -> "oklch(L C H)"          (full precision; achromatic hue -> 0)
export const cssString = (canonical, space) => {
  const srgb = toSrgb(canonical)
  switch (space) {
    case 'hex':
      return formatHex(srgb)
    case 'rgb':
      return `rgb(${[srgb.r, srgb.g, srgb.b].map((c) => Math.round(c * 255)).join(', ')})`
    case 'hsl': {
      const { h = 0, s, l } = toHsl(srgb)
      return `hsl(${h}, ${s * 100}%, ${l * 100}%)`
    }
    case 'oklch': {
      const { l, c, h = 0 } = toOklch(srgb)
      return `oklch(${l} ${c} ${h})`
    }
    default:
      throw new Error(`Unsupported colour space: ${space}`)
  }
}

// DTCG 2025.10 colour object (C1) for a space, derived from the canonical. Ranges per spec:
//   srgb  -> components [r, g, b]   in 0–1
//   hsl   -> components [H, S, L]   H 0–360 ("none" if powerless), S/L 0–100
//   oklch -> components [L, C, H]   L 0–1, C 0+, H 0–360 ("none" if powerless)
// `hex` is included as the fallback. The canonical's own hex is preserved (exact).
export const dtcgValue = (canonical, space) => {
  const srgb = toSrgb(canonical)
  const hex = typeof canonical === 'string' ? formatHex(srgb) : canonical.hex
  const alpha = (typeof canonical === 'string' ? srgb.alpha : canonical.alpha) ?? 1
  switch (space) {
    case 'srgb':
      return { colorSpace: 'srgb', components: [srgb.r, srgb.g, srgb.b], alpha, hex }
    case 'hsl': {
      const { h, s, l } = toHsl(srgb)
      return { colorSpace: 'hsl', components: [h ?? 'none', s * 100, l * 100], alpha, hex }
    }
    case 'oklch': {
      const { l, c, h } = toOklch(srgb)
      return { colorSpace: 'oklch', components: [l, c, h ?? 'none'], alpha, hex }
    }
    default:
      throw new Error(`Unsupported colour space: ${space}`)
  }
}
