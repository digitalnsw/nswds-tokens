import { RGB, RGBA } from '@figma/rest-api-spec'

/**
 * Compares two colors for approximate equality since converting between Figma RGBA objects (from 0 -> 1) and
 * hex colors can result in slight differences.
 */
export function colorApproximatelyEqual(colorA: RGB | RGBA, colorB: RGB | RGBA) {
  return rgbToHex(colorA) === rgbToHex(colorB)
}

export function parseColor(color: string): RGB | RGBA {
  color = color.trim()
  const hexRegex = /^#([A-Fa-f0-9]{6})([A-Fa-f0-9]{2}){0,1}$/
  const hexShorthandRegex = /^#([A-Fa-f0-9]{3})([A-Fa-f0-9]){0,1}$/

  if (hexRegex.test(color) || hexShorthandRegex.test(color)) {
    const hexValue = color.substring(1)
    const expandedHex =
      hexValue.length === 3 || hexValue.length === 4
        ? hexValue
            .split('')
            .map((char) => char + char)
            .join('')
        : hexValue

    const alphaValue = expandedHex.length === 8 ? expandedHex.slice(6, 8) : undefined

    return {
      r: parseInt(expandedHex.slice(0, 2), 16) / 255,
      g: parseInt(expandedHex.slice(2, 4), 16) / 255,
      b: parseInt(expandedHex.slice(4, 6), 16) / 255,
      ...(alphaValue ? { a: parseInt(alphaValue, 16) / 255 } : {}),
    }
  } else {
    throw new Error('Invalid color format')
  }
}

// DTCG 2025.10 sRGB colour object (the canonical shape used across the repo).
export type DtcgColor = {
  colorSpace: 'srgb'
  components: [number, number, number]
  alpha: number
  hex: string
}

// Figma RGB(A) (components already 0–1) -> DTCG sRGB object, with a hex fallback.
export function rgbToDtcg(value: RGB | RGBA): DtcgColor {
  const { r, g, b } = value
  const alpha = 'a' in value ? value.a : 1
  return { colorSpace: 'srgb', components: [r, g, b], alpha, hex: rgbToHex(value) }
}

// Narrow an unknown $value to a DTCG sRGB colour object. Guards the import path so
// only well-formed srgb objects (3 numeric components) reach dtcgToRgb(); anything
// else (hsl/oklch objects, partial/foreign shapes) falls through to other handling.
export function isDtcgColor(value: unknown): value is DtcgColor {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    v.colorSpace === 'srgb' &&
    Array.isArray(v.components) &&
    v.components.length === 3 &&
    v.components.every((c) => typeof c === 'number')
  )
}

// DTCG sRGB object -> Figma RGB(A). Alpha defaults to 1 when absent, and is omitted
// from the result when fully opaque (matches parseColor / avoids `a: undefined`).
export function dtcgToRgb({ components, alpha = 1 }: DtcgColor): RGB | RGBA {
  const [r, g, b] = components
  return alpha !== 1 ? { r, g, b, a: alpha } : { r, g, b }
}

export function rgbToHex({ r, g, b, ...rest }: RGB | RGBA) {
  const a = 'a' in rest ? rest.a : 1

  const toHex = (value: number) => {
    const hex = Math.round(value * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  const hex = [toHex(r), toHex(g), toHex(b)].join('')
  return `#${hex}` + (a !== 1 ? toHex(a) : '')
}
