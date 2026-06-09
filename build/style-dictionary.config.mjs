// Style Dictionary 4 config — Phase 1a (custom formats at hex parity).
//
// Generates the hex variants of css/scss/less (built-ins) and js/ts/json/figma (custom
// formats in ./formats.mjs) for the global, semantic, and masterbrand layers. The
// scripts/sd-parity.mjs harness is what diffs these against dist/ to prove parity.
//
// Tailwind and the hsl/rgb/oklch variants are Phase 1b. hex-only on purpose: the
// hsl/rgb/oklch object-form tokens use the non-standard `channels`/`rgb` shape (review
// item C1) and need a colour transform.
//
// Output goes to a scratch dir (build/.sd-out/), NOT dist/, so nothing is overwritten.

import { nswJs, nswTs, nswJson, nswFigma } from './formats.mjs'

const OUT = 'build/.sd-out/'

// Restrict a platform file to the tokens that came from one source file (one layer).
const fromFile = (fragment) => (token) => token.filePath.replaceAll('\\', '/').includes(fragment)

const LAYERS = [
  { key: 'global', fragment: '/global/color/hex.json', dir: 'global' },
  { key: 'semantic', fragment: '/semantic/color/hex.json', dir: 'semantic' },
  { key: 'masterbrand', fragment: '/themes/color/masterbrand/hex.json', dir: 'themes/masterbrand' },
]

const filesFor = (dest, format) =>
  LAYERS.map((layer) => ({ destination: dest(layer), format, filter: fromFile(layer.fragment) }))

const base = (extra) => ({ buildPath: OUT, options: { showFileHeader: false }, ...extra })

// The custom formats read token.path and token.$value directly (references are resolved by
// Style Dictionary regardless of transforms). The name/kebab transform is included only so
// each token gets a unique `name` — without it SD warns about token-name collisions
// (e.g. nsw-grey.50 and nsw-green.50 both collapsing to "50"). It does not affect output.
const custom = (extra) => base({ transforms: ['name/kebab'], ...extra })

// Figma uses a different (and slightly inconsistent) path layout for the masterbrand theme.
const figmaDest = (layer) =>
  layer.key === 'masterbrand'
    ? 'figma/color/themes/masterbrand/color/hex.json'
    : `figma/color/${layer.dir}/hex.json`

export default {
  // Include every hex source so theme aliases ({nsw-blue.50}) resolve against globals.
  source: ['tokens/**/hex.json'],
  hooks: {
    formats: {
      'nsw/js': nswJs,
      'nsw/ts': nswTs,
      'nsw/json': nswJson,
      'nsw/figma': nswFigma,
    },
  },
  platforms: {
    css: base({
      transformGroup: 'css',
      files: filesFor((l) => `css/colors/${l.dir}/hex.css`, 'css/variables'),
    }),
    scss: base({
      transformGroup: 'scss',
      files: filesFor((l) => `scss/colors/${l.dir}/hex.scss`, 'scss/variables'),
    }),
    less: base({
      transformGroup: 'less',
      files: filesFor((l) => `less/colors/${l.dir}/hex.less`, 'less/variables'),
    }),
    js: custom({ files: filesFor((l) => `js/colors/${l.dir}/hex.js`, 'nsw/js') }),
    ts: custom({ files: filesFor((l) => `ts/colors/${l.dir}/hex.ts`, 'nsw/ts') }),
    json: custom({ files: filesFor((l) => `json/colors/${l.dir}/hex.json`, 'nsw/json') }),
    figma: custom({ files: filesFor(figmaDest, 'nsw/figma') }),
  },
}
