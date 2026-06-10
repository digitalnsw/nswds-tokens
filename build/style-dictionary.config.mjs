// Style Dictionary 4 config — the shared token→output generator.
//
// Exports one config PER colour space (hex/hsl/rgb/oklch). They must be separate Style
// Dictionary instances because every space defines the same token paths (nsw-grey.50 lives
// in hex.json AND hsl.json AND …) — globbing them together would collide.
//
// Each config generates css/scss/less (built-ins) + js/ts/json/figma/tailwind (custom
// formats in ./formats.mjs) for the global, semantic, and masterbrand layers.
//
// hsl/rgb/oklch read the object-form source ({colorSpace,channels,alpha}); the string
// outputs format it via the nsw/color-string transform, Figma keeps the object. (Re-deriving
// these from hex via culori per decision #2 is deferred to Phase 3, where H1 collapses the
// source trees and the value drift belongs with the breaking change.)
//
// Consumed by scripts/generate-styles.mjs, which overrides each platform's buildPath to
// write the generated files into src/ (the OUT default below is only a placeholder).

import {
  nswJs,
  nswTs,
  nswJson,
  nswFigma,
  nswTailwind,
  nswTailwindDimension,
  colorFunction,
  dimensionString,
  fontFamilyString,
} from './formats.mjs'

const OUT = 'build/.sd-out/'
const SPACES = ['hex', 'hsl', 'rgb', 'oklch']

const fromFile = (fragment) => (token) => token.filePath.replaceAll('\\', '/').includes(fragment)

const LAYERS = [
  { key: 'global', dir: 'global', src: 'global/color' },
  { key: 'semantic', dir: 'semantic', src: 'semantic/color' },
  { key: 'masterbrand', dir: 'themes/masterbrand', src: 'themes/color/masterbrand' },
  { key: 'fuchsia-blue', dir: 'themes/fuchsia-blue', src: 'themes/color/fuchsia-blue' },
  { key: 'fuchsia-orange', dir: 'themes/fuchsia-orange', src: 'themes/color/fuchsia-orange' },
  {
    key: 'data-visualisation',
    dir: 'themes/data-visualisation',
    src: 'themes/color/data-visualisation',
  },
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

// One config per (space, layer). Loading a single layer (+ global, for theme alias resolution)
// keeps themes that share family names (primary/accent/grey across masterbrand/fuchsia-*) from
// colliding in a shared dictionary.
const makeConfig = (space, layer) => {
  const source =
    layer.key === 'global'
      ? [`tokens/global/color/${space}.json`]
      : [`tokens/${layer.src}/${space}.json`, `tokens/global/color/${space}.json`]
  const filter = fromFile(`/${layer.src}/${space}.json`)

  const platform = (transforms, destination, format, options) => ({
    buildPath: OUT,
    options: { showFileHeader: false },
    transforms,
    files: [{ destination, format, filter, ...(options ? { options } : {}) }],
  })

  return {
    source,
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
      css: platform(STRING_XF, `css/colors/${layer.dir}/${space}.css`, 'css/variables'),
      scss: platform(STRING_XF, `scss/colors/${layer.dir}/${space}.scss`, 'scss/variables'),
      less: platform(STRING_XF, `less/colors/${layer.dir}/${space}.less`, 'less/variables'),
      js: platform(STRING_XF, `js/colors/${layer.dir}/${space}.js`, 'nsw/js'),
      ts: platform(STRING_XF, `ts/colors/${layer.dir}/${space}.ts`, 'nsw/ts'),
      json: platform(STRING_XF, `json/colors/${layer.dir}/${space}.json`, 'nsw/json'),
      figma: platform(OBJECT_XF, figmaDest(layer, space), 'nsw/figma'),
      tailwind: platform(STRING_XF, `tailwind/colors/${layer.dir}/${space}.css`, 'nsw/tailwind', {
        inline: layer.key === 'semantic',
      }),
    },
  }
}

// ── Non-colour categories (Phase 4) ────────────────────────────────────────────────────
// One config per category — no colour-space dimension (there is exactly one representation
// of 1rem), so canonical.json is the only source and `global` the only layer for now.
// Outputs mirror the colour layout with the category as the first path segment:
// css/space/global.css, js/radius/global.js, tailwind/breakpoints/global.css, …

const CATEGORIES = [
  { key: 'space', tailwindNamespace: 'spacing' },
  { key: 'radius', tailwindNamespace: 'radius' },
  { key: 'breakpoints', tailwindNamespace: 'breakpoint' },
  {
    key: 'typography',
    // Multi-family category: each token family maps to its own Tailwind v4 namespace.
    tailwindNamespaces: {
      'font-family': 'font',
      'font-size': 'text',
      'font-weight': 'font-weight',
      'line-height': 'leading',
      'letter-spacing': 'tracking',
    },
  },
]

// DTCG dimension object ({value, unit}) -> "0.25rem" string for every string output.
const dimensionTransform = {
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'dimension',
  transform: (token) => dimensionString(token.$value),
}

// DTCG fontFamily (array stack) -> CSS font-family string for every string output.
const fontFamilyTransform = {
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'fontFamily',
  transform: (token) => fontFamilyString(token.$value),
}

// letter-spacing tokens are unitless em multipliers (plan D4 note); string outputs render
// them with the em unit so CSS consumers get a usable length (0.025em). line-height stays
// a bare number — that's already valid CSS.
const letterSpacingEmTransform = {
  type: 'value',
  transitive: true,
  filter: (token) => token.path[0] === 'letter-spacing' && typeof token.$value === 'number',
  transform: (token) => `${token.$value}em`,
}

const makeCategoryConfig = (category) => {
  const platform = (destination, format, options) => ({
    buildPath: OUT,
    options: { showFileHeader: false },
    transforms: ['name/kebab', 'nsw/dimension', 'nsw/font-family', 'nsw/letter-spacing-em'],
    files: [{ destination, format, ...(options ? { options } : {}) }],
  })

  return {
    source: [`tokens/global/${category.key}/canonical.json`],
    hooks: {
      formats: {
        'nsw/js': nswJs,
        'nsw/ts': nswTs,
        'nsw/json': nswJson,
        'nsw/tailwind-dimension': nswTailwindDimension,
      },
      transforms: {
        'nsw/dimension': dimensionTransform,
        'nsw/font-family': fontFamilyTransform,
        'nsw/letter-spacing-em': letterSpacingEmTransform,
      },
    },
    platforms: {
      css: platform(`css/${category.key}/global.css`, 'css/variables'),
      scss: platform(`scss/${category.key}/global.scss`, 'scss/variables'),
      less: platform(`less/${category.key}/global.less`, 'less/variables'),
      js: platform(`js/${category.key}/global.js`, 'nsw/js'),
      ts: platform(`ts/${category.key}/global.ts`, 'nsw/ts'),
      json: platform(`json/${category.key}/global.json`, 'nsw/json'),
      tailwind: platform(`tailwind/${category.key}/global.css`, 'nsw/tailwind-dimension', {
        ...(category.tailwindNamespace ? { namespace: category.tailwindNamespace } : {}),
        ...(category.tailwindNamespaces ? { namespaces: category.tailwindNamespaces } : {}),
      }),
    },
  }
}

export default [
  ...SPACES.flatMap((space) => LAYERS.map((layer) => makeConfig(space, layer))),
  ...CATEGORIES.map(makeCategoryConfig),
]
