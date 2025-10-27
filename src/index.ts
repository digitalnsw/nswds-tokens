/* eslint-disable */
// JSON Tokens Imports
const globalColorHex = require('../tokens/global/color/hex.json')
const globalColorHsl = require('../tokens/global/color/hsl.json')
const globalColorOklch = require('../tokens/global/color/oklch.json')
const globalColorRgb = require('../tokens/global/color/rgb.json')

const masterbrandColorHex = require('../tokens/themes/color/masterbrand/hex.json')
const rawMasterbrandColorHsl = require('../tokens/themes/color/masterbrand/hsl.json')
const rawMasterbrandColorOklch = require('../tokens/themes/color/masterbrand/oklch.json')
const rawMasterbrandColorRgb = require('../tokens/themes/color/masterbrand/rgb.json')

const semanticColorHex = require('../tokens/semantic/color/hex.json')
const semanticColorHsl = require('../tokens/semantic/color/hsl.json')
const semanticColorOklch = require('../tokens/semantic/color/oklch.json')
const semanticColorRgb = require('../tokens/semantic/color/rgb.json')

type AnyObject = Record<string, unknown>

type ColorValue = {
  colorSpace: string
  channels: unknown
  alpha?: unknown
  [key: string]: unknown
}

type AliasLookup = Record<string, ColorValue>

const ALIAS_PATTERN = /^\{([\w-]+(?:\.[\w-]+)*)\}$/

const isObject = (value: unknown): value is AnyObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const buildColorLookup = (palette: AnyObject): AliasLookup => {
  const lookup: AliasLookup = {}

  const walk = (node: AnyObject, path: string[]): void => {
    if ('$value' in node && isObject(node.$value) && 'colorSpace' in node.$value) {
      lookup[path.join('.')] = node.$value as ColorValue
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === '$value' || key === '$type') continue

      if (isObject(value)) {
        walk(value, [...path, key])
      }
    }
  }

  for (const [key, value] of Object.entries(palette)) {
    if (isObject(value)) {
      walk(value, [key])
    }
  }

  return lookup
}

const rehydrateAliases = (palette: AnyObject, lookup: AliasLookup): AnyObject => {
  if (!isObject(palette)) {
    return palette
  }

  const cloned = clone(palette)

  const walk = (node: AnyObject): void => {
    if (typeof node.$value === 'string') {
      const match = ALIAS_PATTERN.exec(node.$value)
      if (match) {
        const alias = match[1]
        const resolved = lookup[alias]
        if (resolved) {
          node.$value = clone(resolved)
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === '$value' || key === '$type') continue

      if (isObject(value)) {
        walk(value)
      }
    }
  }

  walk(cloned)

  return cloned
}

const globalHslLookup = buildColorLookup(globalColorHsl)
const globalOklchLookup = buildColorLookup(globalColorOklch)
const globalRgbLookup = buildColorLookup(globalColorRgb)

const masterbrandColorHsl = rehydrateAliases(rawMasterbrandColorHsl, globalHslLookup)
const masterbrandColorOklch = rehydrateAliases(rawMasterbrandColorOklch, globalOklchLookup)
const masterbrandColorRgb = rehydrateAliases(rawMasterbrandColorRgb, globalRgbLookup)

// CSS Imports
import * as globalCssHex from './css/colors/global/hex.css'
import * as globalCssHsl from './css/colors/global/hsl.css'
import * as globalCssOklch from './css/colors/global/oklch.css'
import * as globalCssRgb from './css/colors/global/rgb.css'
import * as masterbrandCssHex from './css/colors/themes/masterbrand/hex.css'
import * as masterbrandCssHsl from './css/colors/themes/masterbrand/hsl.css'
import * as masterbrandCssOklch from './css/colors/themes/masterbrand/oklch.css'
import * as masterbrandCssRgb from './css/colors/themes/masterbrand/rgb.css'
import * as semanticCssHex from './css/colors/semantic/hex.css'
import * as semanticCssHsl from './css/colors/semantic/hsl.css'
import * as semanticCssOklch from './css/colors/semantic/oklch.css'
import * as semanticCssRgb from './css/colors/semantic/rgb.css'

// JavaScript Imports
import * as globalJsHex from './js/colors/global/hex.js'
import * as globalJsHsl from './js/colors/global/hsl.js'
import * as globalJsOklch from './js/colors/global/oklch.js'
import * as globalJsRgb from './js/colors/global/rgb.js'
import * as masterbrandJsHex from './js/colors/themes/masterbrand/hex.js'
import * as masterbrandJsHsl from './js/colors/themes/masterbrand/hsl.js'
import * as masterbrandJsOklch from './js/colors/themes/masterbrand/oklch.js'
import * as masterbrandJsRgb from './js/colors/themes/masterbrand/rgb.js'
import * as semanticJsHex from './js/colors/semantic/hex.js'
import * as semanticJsHsl from './js/colors/semantic/hsl.js'
import * as semanticJsOklch from './js/colors/semantic/oklch.js'
import * as semanticJsRgb from './js/colors/semantic/rgb.js'

// JSON Imports
const globalJsonHex = require('./json/colors/global/hex.json')
const globalJsonHsl = require('./json/colors/global/hsl.json')
const globalJsonOklch = require('./json/colors/global/oklch.json')
const globalJsonRgb = require('./json/colors/global/rgb.json')
const masterbrandJsonHex = require('./json/colors/themes/masterbrand/hex.json')
const masterbrandJsonHsl = require('./json/colors/themes/masterbrand/hsl.json')
const masterbrandJsonOklch = require('./json/colors/themes/masterbrand/oklch.json')
const masterbrandJsonRgb = require('./json/colors/themes/masterbrand/rgb.json')
const semanticJsonHex = require('./json/colors/semantic/hex.json')
const semanticJsonHsl = require('./json/colors/semantic/hsl.json')
const semanticJsonOklch = require('./json/colors/semantic/oklch.json')
const semanticJsonRgb = require('./json/colors/semantic/rgb.json')

// LESS Imports
import * as globalLessHex from './less/colors/global/hex.less'
import * as globalLessHsl from './less/colors/global/hsl.less'
import * as globalLessOklch from './less/colors/global/oklch.less'
import * as globalLessRgb from './less/colors/global/rgb.less'
import * as masterbrandLessHex from './less/colors/themes/masterbrand/hex.less'
import * as masterbrandLessHsl from './less/colors/themes/masterbrand/hsl.less'
import * as masterbrandLessOklch from './less/colors/themes/masterbrand/oklch.less'
import * as masterbrandLessRgb from './less/colors/themes/masterbrand/rgb.less'
import * as semanticLessHex from './less/colors/semantic/hex.less'
import * as semanticLessHsl from './less/colors/semantic/hsl.less'
import * as semanticLessOklch from './less/colors/semantic/oklch.less'
import * as semanticLessRgb from './less/colors/semantic/rgb.less'

// SCSS Imports
import * as globalScssHex from './scss/colors/global/hex.scss'
import * as globalScssHsl from './scss/colors/global/hsl.scss'
import * as globalScssOklch from './scss/colors/global/oklch.scss'
import * as globalScssRgb from './scss/colors/global/rgb.scss'
import * as masterbrandScssHex from './scss/colors/themes/masterbrand/hex.scss'
import * as masterbrandScssHsl from './scss/colors/themes/masterbrand/hsl.scss'
import * as masterbrandScssOklch from './scss/colors/themes/masterbrand/oklch.scss'
import * as masterbrandScssRgb from './scss/colors/themes/masterbrand/rgb.scss'
import * as semanticScssHex from './scss/colors/semantic/hex.scss'
import * as semanticScssHsl from './scss/colors/semantic/hsl.scss'
import * as semanticScssOklch from './scss/colors/semantic/oklch.scss'
import * as semanticScssRgb from './scss/colors/semantic/rgb.scss'

// Tailwind Imports
import * as globalTailwindHex from './tailwind/colors/global/hex.css'
import * as globalTailwindHsl from './tailwind/colors/global/hsl.css'
import * as globalTailwindOklch from './tailwind/colors/global/oklch.css'
import * as globalTailwindRgb from './tailwind/colors/global/rgb.css'
import * as masterbrandTailwindHex from './tailwind/colors/themes/masterbrand/hex.css'
import * as masterbrandTailwindHsl from './tailwind/colors/themes/masterbrand/hsl.css'
import * as masterbrandTailwindOklch from './tailwind/colors/themes/masterbrand/oklch.css'
import * as masterbrandTailwindRgb from './tailwind/colors/themes/masterbrand/rgb.css'
import * as datavisTailwindHex from './tailwind/colors/themes/data-visualisation/hex.css'
import * as datavisTailwindHsl from './tailwind/colors/themes/data-visualisation/hsl.css'
import * as datavisTailwindOklch from './tailwind/colors/themes/data-visualisation/oklch.css'
import * as datavisTailwindRgb from './tailwind/colors/themes/data-visualisation/rgb.css'
import * as semanticTailwindHex from './tailwind/colors/semantic/hex.css'
import * as semanticTailwindHsl from './tailwind/colors/semantic/hsl.css'
import * as semanticTailwindOklch from './tailwind/colors/semantic/oklch.css'
import * as semanticTailwindRgb from './tailwind/colors/semantic/rgb.css'

// TypeScript Imports
import * as globalTsHex from './ts/colors/global/hex.js'
import * as globalTsHsl from './ts/colors/global/hsl.js'
import * as globalTsOklch from './ts/colors/global/oklch.js'
import * as globalTsRgb from './ts/colors/global/rgb.js'
import * as masterbrandTsHex from './ts/colors/themes/masterbrand/hex.js'
import * as masterbrandTsHsl from './ts/colors/themes/masterbrand/hsl.js'
import * as masterbrandTsOklch from './ts/colors/themes/masterbrand/oklch.js'
import * as masterbrandTsRgb from './ts/colors/themes/masterbrand/rgb.js'
import * as semanticTsHex from './ts/colors/semantic/hex.js'
import * as semanticTsHsl from './ts/colors/semantic/hsl.js'
import * as semanticTsOklch from './ts/colors/semantic/oklch.js'
import * as semanticTsRgb from './ts/colors/semantic/rgb.js'

export const tokens = {
  colors: {
    global: {
      hex: globalColorHex,
      hsl: globalColorHsl,
      oklch: globalColorOklch,
      rgb: globalColorRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandColorHex,
        hsl: masterbrandColorHsl,
        oklch: masterbrandColorOklch,
        rgb: masterbrandColorRgb,
      },
    },
    semantic: {
      hex: semanticColorHex,
      hsl: semanticColorHsl,
      oklch: semanticColorOklch,
      rgb: semanticColorRgb,
    },
  },
  css: {
    global: {
      hex: globalCssHex,
      hsl: globalCssHsl,
      oklch: globalCssOklch,
      rgb: globalCssRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandCssHex,
        hsl: masterbrandCssHsl,
        oklch: masterbrandCssOklch,
        rgb: masterbrandCssRgb,
      },
    },
    semantic: {
      hex: semanticCssHex,
      hsl: semanticCssHsl,
      oklch: semanticCssOklch,
      rgb: semanticCssRgb,
    },
  },
  js: {
    global: {
      hex: globalJsHex,
      hsl: globalJsHsl,
      oklch: globalJsOklch,
      rgb: globalJsRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandJsHex,
        hsl: masterbrandJsHsl,
        oklch: masterbrandJsOklch,
        rgb: masterbrandJsRgb,
      },
    },
    semantic: {
      hex: semanticJsHex,
      hsl: semanticJsHsl,
      oklch: semanticJsOklch,
      rgb: semanticJsRgb,
    },
  },
  json: {
    global: {
      hex: globalJsonHex,
      hsl: globalJsonHsl,
      oklch: globalJsonOklch,
      rgb: globalJsonRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandJsonHex,
        hsl: masterbrandJsonHsl,
        oklch: masterbrandJsonOklch,
        rgb: masterbrandJsonRgb,
      },
    },
    semantic: {
      hex: semanticJsonHex,
      hsl: semanticJsonHsl,
      oklch: semanticJsonOklch,
      rgb: semanticJsonRgb,
    },
  },
  less: {
    global: {
      hex: globalLessHex,
      hsl: globalLessHsl,
      oklch: globalLessOklch,
      rgb: globalLessRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandLessHex,
        hsl: masterbrandLessHsl,
        oklch: masterbrandLessOklch,
        rgb: masterbrandLessRgb,
      },
    },
    semantic: {
      hex: semanticLessHex,
      hsl: semanticLessHsl,
      oklch: semanticLessOklch,
      rgb: semanticLessRgb,
    },
  },
  scss: {
    global: {
      hex: globalScssHex,
      hsl: globalScssHsl,
      oklch: globalScssOklch,
      rgb: globalScssRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandScssHex,
        hsl: masterbrandScssHsl,
        oklch: masterbrandScssOklch,
        rgb: masterbrandScssRgb,
      },
    },
    semantic: {
      hex: semanticScssHex,
      hsl: semanticScssHsl,
      oklch: semanticScssOklch,
      rgb: semanticScssRgb,
    },
  },
  tailwind: {
    global: {
      hex: globalTailwindHex,
      hsl: globalTailwindHsl,
      oklch: globalTailwindOklch,
      rgb: globalTailwindRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandTailwindHex,
        hsl: masterbrandTailwindHsl,
        oklch: masterbrandTailwindOklch,
        rgb: masterbrandTailwindRgb,
      },
      'data-visualisation': {
        hex: datavisTailwindHex,
        hsl: datavisTailwindHsl,
        oklch: datavisTailwindOklch,
        rgb: datavisTailwindRgb,
      },
    },
    semantic: {
      hex: semanticTailwindHex,
      hsl: semanticTailwindHsl,
      oklch: semanticTailwindOklch,
      rgb: semanticTailwindRgb,
    },
  },
  ts: {
    global: {
      hex: globalTsHex,
      hsl: globalTsHsl,
      oklch: globalTsOklch,
      rgb: globalTsRgb,
    },
    themes: {
      masterbrand: {
        hex: masterbrandTsHex,
        hsl: masterbrandTsHsl,
        oklch: masterbrandTsOklch,
        rgb: masterbrandTsRgb,
      },
    },
    semantic: {
      hex: semanticTsHex,
      hsl: semanticTsHsl,
      oklch: semanticTsOklch,
      rgb: semanticTsRgb,
    },
  },
}

export const colorTokens = tokens.colors
export const cssTokens = tokens.css
export const jsTokens = tokens.js
export const jsonTokens = tokens.json
export const lessTokens = tokens.less
export const scssTokens = tokens.scss
export const tailwindTokens = tokens.tailwind
export const tsTokens = tokens.ts

// Export brand assets
export const brand = {
  iconDark: {
    ico: './brand/icon-dark.ico',
    png: './brand/icon-dark.png',
    svg: './brand/icon-dark.svg',
  },
  iconLight: {
    ico: './brand/icon-light.ico',
    png: './brand/icon-light.png',
    svg: './brand/icon-light.svg',
  },
  icon: './brand/icon.svg',
  logo: {
    png: './brand/logo.png',
    svg: './brand/logo.svg',
  },
  placeholder: './brand/placeholder.svg',
}
