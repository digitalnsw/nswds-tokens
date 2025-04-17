/* eslint-disable */
// JSON Tokens Imports
const globalColorHex = require('../tokens/global/color/hex.json')
const globalColorHsl = require('../tokens/global/color/hsl.json')
const globalColorOklch = require('../tokens/global/color/oklch.json')
const globalColorRgb = require('../tokens/global/color/rgb.json')

const masterbrandColorHex = require('../tokens/themes/color/masterbrand/hex.json')
const masterbrandColorHsl = require('../tokens/themes/color/masterbrand/hsl.json')
const masterbrandColorOklch = require('../tokens/themes/color/masterbrand/oklch.json')
const masterbrandColorRgb = require('../tokens/themes/color/masterbrand/rgb.json')

// CSS Imports
import * as globalCssHex from './css/colors/global/hex.css'
import * as globalCssHsl from './css/colors/global/hsl.css'
import * as globalCssOklch from './css/colors/global/oklch.css'
import * as globalCssRgb from './css/colors/global/rgb.css'
import * as masterbrandCssHex from './css/colors/themes/masterbrand/hex.css'
import * as masterbrandCssHsl from './css/colors/themes/masterbrand/hsl.css'
import * as masterbrandCssOklch from './css/colors/themes/masterbrand/oklch.css'
import * as masterbrandCssRgb from './css/colors/themes/masterbrand/rgb.css'

// JavaScript Imports
import * as globalJsHex from './js/colors/global/hex.js'
import * as globalJsHsl from './js/colors/global/hsl.js'
import * as globalJsOklch from './js/colors/global/oklch.js'
import * as globalJsRgb from './js/colors/global/rgb.js'
import * as masterbrandJsHex from './js/colors/themes/masterbrand/hex.js'
import * as masterbrandJsHsl from './js/colors/themes/masterbrand/hsl.js'
import * as masterbrandJsOklch from './js/colors/themes/masterbrand/oklch.js'
import * as masterbrandJsRgb from './js/colors/themes/masterbrand/rgb.js'

// JSON Imports
const globalJsonHex = require('./json/colors/global/hex.json')
const globalJsonHsl = require('./json/colors/global/hsl.json')
const globalJsonOklch = require('./json/colors/global/oklch.json')
const globalJsonRgb = require('./json/colors/global/rgb.json')
const masterbrandJsonHex = require('./json/colors/themes/masterbrand/hex.json')
const masterbrandJsonHsl = require('./json/colors/themes/masterbrand/hsl.json')
const masterbrandJsonOklch = require('./json/colors/themes/masterbrand/oklch.json')
const masterbrandJsonRgb = require('./json/colors/themes/masterbrand/rgb.json')

// LESS Imports
import * as globalLessHex from './less/colors/global/hex.less'
import * as globalLessHsl from './less/colors/global/hsl.less'
import * as globalLessOklch from './less/colors/global/oklch.less'
import * as globalLessRgb from './less/colors/global/rgb.less'
import * as masterbrandLessHex from './less/colors/themes/masterbrand/hex.less'
import * as masterbrandLessHsl from './less/colors/themes/masterbrand/hsl.less'
import * as masterbrandLessOklch from './less/colors/themes/masterbrand/oklch.less'
import * as masterbrandLessRgb from './less/colors/themes/masterbrand/rgb.less'

// SCSS Imports
import * as globalScssHex from './scss/colors/global/hex.scss'
import * as globalScssHsl from './scss/colors/global/hsl.scss'
import * as globalScssOklch from './scss/colors/global/oklch.scss'
import * as globalScssRgb from './scss/colors/global/rgb.scss'
import * as masterbrandScssHex from './scss/colors/themes/masterbrand/hex.scss'
import * as masterbrandScssHsl from './scss/colors/themes/masterbrand/hsl.scss'
import * as masterbrandScssOklch from './scss/colors/themes/masterbrand/oklch.scss'
import * as masterbrandScssRgb from './scss/colors/themes/masterbrand/rgb.scss'

// Tailwind Imports
import * as globalTailwindHex from './tailwind/colors/global/hex.css'
import * as globalTailwindHsl from './tailwind/colors/global/hsl.css'
import * as globalTailwindOklch from './tailwind/colors/global/oklch.css'
import * as globalTailwindRgb from './tailwind/colors/global/rgb.css'
import * as masterbrandTailwindHex from './tailwind/colors/themes/masterbrand/hex.css'
import * as masterbrandTailwindHsl from './tailwind/colors/themes/masterbrand/hsl.css'
import * as masterbrandTailwindOklch from './tailwind/colors/themes/masterbrand/oklch.css'
import * as masterbrandTailwindRgb from './tailwind/colors/themes/masterbrand/rgb.css'

// TypeScript Imports
import * as globalTsHex from './ts/colors/global/hex.js'
import * as globalTsHsl from './ts/colors/global/hsl.js'
import * as globalTsOklch from './ts/colors/global/oklch.js'
import * as globalTsRgb from './ts/colors/global/rgb.js'
import * as masterbrandTsHex from './ts/colors/themes/masterbrand/hex.js'
import * as masterbrandTsHsl from './ts/colors/themes/masterbrand/hsl.js'
import * as masterbrandTsOklch from './ts/colors/themes/masterbrand/oklch.js'
import * as masterbrandTsRgb from './ts/colors/themes/masterbrand/rgb.js'

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

// Export icon paths
export const icons = {
  accountCircle: './icons/account_circle.svg',
  add: './icons/add.svg',
  attachFile: './icons/attach_file.svg',
  cancel: './icons/cancel.svg',
  check: './icons/check.svg',
  checkCircle: './icons/check_circle.svg',
  chevronDown: './icons/chevron_down.svg',
  chevronLeft: './icons/chevron_left.svg',
  chevronRight: './icons/chevron_right.svg',
  chevronUp: './icons/chevron_up.svg',
  close: './icons/close.svg',
  collapseAll: './icons/collapse_all.svg',
  computer: './icons/computer.svg',
  copy: './icons/copy.svg',
  darkMode: './icons/dark_mode.svg',
  delete: './icons/delete.svg',
  desktop: './icons/desktop.svg',
  displaySettings: './icons/display_settings.svg',
  dockToLeft: './icons/dock_to_left.svg',
  dockToRight: './icons/dock_to_right.svg',
  doubleArrowLeft: './icons/double_arrow_left.svg',
  doubleArrowRight: './icons/double_arrow_right.svg',
  download: './icons/download.svg',
  east: './icons/east.svg',
  error: './icons/error.svg',
  exclamation: './icons/exclamation.svg',
  grid_view: './icons/grid_view.svg',
  eye: './icons/eye.svg',
  favorite: './icons/favorite.svg',
  help: './icons/help.svg',
  info: './icons/info.svg',
  language: './icons/language.svg',
  lightMode: './icons/light_mode.svg',
  link: './icons/link.svg',
  list: './icons/list.svg',
  login: './icons/login.svg',
  logout: './icons/logout.svg',
  menu: './icons/menu.svg',
  moreHoriz: './icons/more_horiz.svg',
  moreVert: './icons/more_vert.svg',
  north: './icons/north.svg',
  openInNew: './icons/open_in_new.svg',
  palette: './icons/palette.svg',
  print: './icons/print.svg',
  progressActivity: './icons/progress_activity.svg',
  remove: './icons/remove.svg',
  search: './icons/search.svg',
  settingsBrightness: './icons/settings_brightness.svg',
  share: './icons/share.svg',
  sideNavigation: './icons/side_navigation.svg',
  south: './icons/south.svg',
  unfoldLess: './icons/unfold_less.svg',
  unfoldMore: './icons/unfold_more.svg',
  upload: './icons/upload.svg',
  west: './icons/west.svg',
}

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
