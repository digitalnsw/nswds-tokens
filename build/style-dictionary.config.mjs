// Style Dictionary 4 config — Phase 1c (all colour spaces at parity).
//
// Exports one config PER colour space (hex/hsl/rgb/oklch). They must be separate Style
// Dictionary instances because every space defines the same token paths (nsw-grey.50 lives
// in hex.json AND hsl.json AND …) — globbing them together would collide.
//
// Each config generates css/scss/less (built-ins) + js/ts/json/figma/tailwind (custom
// formats in ./formats.mjs) for the global, semantic, and masterbrand layers. The
// scripts/sd-parity.mjs harness diffs every output against dist/.
//
// hsl/rgb/oklch read the object-form source ({colorSpace,channels,alpha}); the string
// outputs format it via the nsw/color-string transform, Figma keeps the object. (Re-deriving
// these from hex via culori per decision #2 is deferred to Phase 3, where H1 collapses the
// source trees and the value drift belongs with the breaking change.)
//
// Output goes to a scratch dir (build/.sd-out/), NOT dist/, so nothing is overwritten.

import { nswJs, nswTs, nswJson, nswFigma, nswTailwind, colorFunction } from './formats.mjs'

const OUT = 'build/.sd-out/'
const SPACES = ['hex', 'hsl', 'rgb', 'oklch']

const fromFile = (fragment) => (token) => token.filePath.replaceAll('\\', '/').includes(fragment)

const LAYERS = [
  { key: 'global', dir: 'global', src: 'global/color' },
  { key: 'semantic', dir: 'semantic', src: 'semantic/color' },
  { key: 'masterbrand', dir: 'themes/masterbrand', src: 'themes/color/masterbrand' },
]

// Figma uses a different (and slightly inconsistent) path layout for the masterbrand theme.
const figmaDest = (layer, space) =>
  layer.key === 'masterbrand'
    ? `figma/color/themes/masterbrand/color/${space}.json`
    : `figma/color/${layer.dir}/${space}.json`

// Object-form colour value -> CSS function string. No-op for hex (string $value), via filter.
const colorStringTransform = {
  type: 'value',
  transitive: true,
  filter: (token) =>
    token.$value && typeof token.$value === 'object' && 'colorSpace' in token.$value,
  transform: (token) => colorFunction(token.$value.colorSpace, token.$value),
}

// name/kebab gives each token a unique `name` (avoids SD collision warnings). The custom
// formats read token.path/$value directly. nsw/color-string stringifies object colours for
// the string outputs; Figma omits it to keep the DTCG object form.
const STRING_XF = ['name/kebab', 'nsw/color-string']
const OBJECT_XF = ['name/kebab']

const makeConfig = (space) => {
  const filesFor = (dest, format, opts) =>
    LAYERS.map((layer) => ({
      destination: dest(layer),
      format,
      filter: fromFile(`/${layer.src}/${space}.json`),
      ...(opts ? { options: opts(layer) } : {}),
    }))

  const platform = (transforms, files) => ({
    buildPath: OUT,
    options: { showFileHeader: false },
    transforms,
    files,
  })

  return {
    source: [`tokens/**/${space}.json`],
    hooks: {
      formats: {
        'nsw/js': nswJs,
        'nsw/ts': nswTs,
        'nsw/json': nswJson,
        'nsw/figma': nswFigma,
        'nsw/tailwind': nswTailwind,
      },
      transforms: { 'nsw/color-string': colorStringTransform },
    },
    platforms: {
      css: platform(
        STRING_XF,
        filesFor((l) => `css/colors/${l.dir}/${space}.css`, 'css/variables'),
      ),
      scss: platform(
        STRING_XF,
        filesFor((l) => `scss/colors/${l.dir}/${space}.scss`, 'scss/variables'),
      ),
      less: platform(
        STRING_XF,
        filesFor((l) => `less/colors/${l.dir}/${space}.less`, 'less/variables'),
      ),
      js: platform(
        STRING_XF,
        filesFor((l) => `js/colors/${l.dir}/${space}.js`, 'nsw/js'),
      ),
      ts: platform(
        STRING_XF,
        filesFor((l) => `ts/colors/${l.dir}/${space}.ts`, 'nsw/ts'),
      ),
      json: platform(
        STRING_XF,
        filesFor((l) => `json/colors/${l.dir}/${space}.json`, 'nsw/json'),
      ),
      figma: platform(
        OBJECT_XF,
        filesFor((l) => figmaDest(l, space), 'nsw/figma'),
      ),
      tailwind: platform(
        STRING_XF,
        filesFor(
          (l) => `tailwind/colors/${l.dir}/${space}.css`,
          'nsw/tailwind',
          (l) => ({
            inline: l.key === 'semantic',
          }),
        ),
      ),
    },
  }
}

export default SPACES.map(makeConfig)
