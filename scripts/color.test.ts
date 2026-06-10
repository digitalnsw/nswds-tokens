import {
  colorApproximatelyEqual,
  dtcgToRgb,
  isDtcgColor,
  parseColor,
  rgbToDtcg,
  rgbToHex,
} from './color.js'

describe('colorApproximatelyEqual', () => {
  it('compares by hex value', () => {
    expect(colorApproximatelyEqual({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 })).toBe(true)
    expect(colorApproximatelyEqual({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0, a: 1 })).toBe(true)
    expect(
      colorApproximatelyEqual({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0, a: 0.5 }),
    ).toBe(true)
    expect(colorApproximatelyEqual({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0, a: 0 })).toBe(false)

    expect(colorApproximatelyEqual({ r: 0, g: 0, b: 0 }, { r: 0.001, g: 0, b: 0 })).toBe(true)
    expect(colorApproximatelyEqual({ r: 0, g: 0, b: 0 }, { r: 0.0028, g: 0, b: 0 })).toBe(false)
  })
})

describe('parseColor', () => {
  it('parses hex values', () => {
    // 3-value syntax
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseColor('#FFF')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseColor('#f09')).toEqual({ r: 1, g: 0, b: 153 / 255 })
    expect(parseColor('#F09')).toEqual({ r: 1, g: 0, b: 153 / 255 })

    // 4-value syntax
    expect(parseColor('#0000')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseColor('#000F')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseColor('#f09a')).toEqual({ r: 1, g: 0, b: 153 / 255, a: 170 / 255 })

    // 6-value syntax
    expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseColor('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseColor('#ff0099')).toEqual({ r: 1, g: 0, b: 153 / 255 })
    expect(parseColor('#FF0099')).toEqual({ r: 1, g: 0, b: 153 / 255 })

    // 8-value syntax
    expect(parseColor('#00000000')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseColor('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 })
    expect(parseColor('#000000ff')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseColor('#5EE0DCAB')).toEqual({
      r: 0.3686274509803922,
      g: 0.8784313725490196,
      b: 0.8627450980392157,
      a: 0.6705882352941176,
    })
  })

  it('handles invalid hex values', () => {
    expect(() => parseColor('#')).toThrowError('Invalid color format')
    expect(() => parseColor('#0')).toThrowError('Invalid color format')
    expect(() => parseColor('#00')).toThrowError('Invalid color format')
    expect(() => parseColor('#0000000')).toThrowError('Invalid color format')
    expect(() => parseColor('#000000000')).toThrowError('Invalid color format')
    expect(() => parseColor('#hhh')).toThrowError('Invalid color format')
  })
})

describe('rgbToHex', () => {
  it('should convert rgb to hex', () => {
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe('#ffffff')
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
    expect(rgbToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe('#808080')
    expect(rgbToHex({ r: 0.3686274509803922, g: 0.8784313725490196, b: 0.8627450980392157 })).toBe(
      '#5ee0dc',
    )
  })

  it('should convert rgba to hex', () => {
    expect(rgbToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe('#ffffff')
    expect(rgbToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
    expect(rgbToHex({ r: 0.5, g: 0.5, b: 0.5, a: 0.5 })).toBe('#80808080')
    expect(
      rgbToHex({ r: 0.3686274509803922, g: 0.8784313725490196, b: 0.8627450980392157, a: 0 }),
    ).toBe('#5ee0dc00')
  })
})

describe('rgbToDtcg', () => {
  it('converts an opaque Figma RGB to a DTCG sRGB object with hex fallback', () => {
    expect(rgbToDtcg({ r: 1, g: 0.7450980392156863, b: 0.08627450980392157 })).toEqual({
      colorSpace: 'srgb',
      components: [1, 0.7450980392156863, 0.08627450980392157],
      alpha: 1,
      hex: '#ffbe16',
    })
  })

  it('defaults alpha to 1 when the RGB has no alpha channel', () => {
    expect(rgbToDtcg({ r: 0, g: 0, b: 0 }).alpha).toBe(1)
  })

  it('snaps a non-opaque alpha to the 8-bit grid, consistent with the hex fallback', () => {
    // 0.5 * 255 = 127.5 rounds to the hex byte 0x80 (128) — alpha snaps to the SAME
    // 128/255 so the numeric field and the hex encoding can never disagree.
    expect(rgbToDtcg({ r: 0, g: 0, b: 0, a: 0.5 })).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 0],
      alpha: 128 / 255,
      hex: '#00000080',
    })
  })

  it('clamps out-of-range channels before snapping', () => {
    expect(rgbToDtcg({ r: 1.0000001, g: -0.0000001, b: 0, a: 1.0000001 })).toMatchObject({
      components: [1, 0, 0],
      alpha: 1,
    })
  })
})

describe('dtcgToRgb', () => {
  it('omits alpha when fully opaque', () => {
    expect(
      dtcgToRgb({ colorSpace: 'srgb', components: [1, 1, 1], alpha: 1, hex: '#ffffff' }),
    ).toEqual({ r: 1, g: 1, b: 1 })
  })

  it('keeps alpha when translucent', () => {
    expect(
      dtcgToRgb({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5, hex: '#00000080' }),
    ).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
  })

  it('defaults a missing alpha to 1 (no `a: undefined` leaks out)', () => {
    // A partial object missing `alpha` must not produce { a: undefined }.
    const partial = { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], hex: '#336699' }
    expect(dtcgToRgb(partial as Parameters<typeof dtcgToRgb>[0])).toEqual({
      r: 0.2,
      g: 0.4,
      b: 0.6,
    })
  })

  it('round-trips with rgbToDtcg on the 8-bit grid', () => {
    const opaque = { r: 0.3686274509803922, g: 0.8784313725490196, b: 0.8627450980392157 }
    expect(dtcgToRgb(rgbToDtcg(opaque))).toEqual(opaque)

    // 0.2 = 51/255 exactly, so the translucent round trip is also exact; alphas off the
    // 8-bit grid snap to it (see the alpha-snapping case above).
    const translucent = { r: 0.2, g: 0.4, b: 0.6, a: 0.2 }
    expect(dtcgToRgb(rgbToDtcg(translucent))).toEqual(translucent)
  })
})

describe('isDtcgColor', () => {
  it('accepts a well-formed sRGB object', () => {
    expect(
      isDtcgColor({ colorSpace: 'srgb', components: [1, 0, 0], alpha: 1, hex: '#ff0000' }),
    ).toBe(true)
  })

  it('rejects non-srgb colour spaces (hsl/oklch objects must not reach Figma)', () => {
    expect(isDtcgColor({ colorSpace: 'oklch', components: [0.6, 0.2, 30], alpha: 1 })).toBe(false)
    expect(isDtcgColor({ colorSpace: 'hsl', components: [120, 50, 50], alpha: 1 })).toBe(false)
  })

  it('rejects malformed, partial, or primitive values', () => {
    expect(isDtcgColor({ colorSpace: 'srgb', components: [1, 0] })).toBe(false) // wrong length
    expect(isDtcgColor({ colorSpace: 'srgb', components: [1, 0, 'none'] })).toBe(false) // non-numeric
    expect(isDtcgColor({ components: [1, 0, 0] })).toBe(false) // no colorSpace
    expect(isDtcgColor('#ff0000')).toBe(false)
    expect(isDtcgColor(null)).toBe(false)
    expect(isDtcgColor(42)).toBe(false)
  })
})
