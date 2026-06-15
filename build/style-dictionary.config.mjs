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
  nswDts,
  nswJson,
  nswFigma,
  nswCssMedia,
  nswTailwind,
  nswTailwindDimension,
  nswTypographyCss,
  nswTypographyScss,
  nswTypographyLess,
  nswTypographyJs,
  nswTypographyTs,
  nswTypographyDts,
  nswTypographyJson,
  colorFunction,
  dimensionString,
  fontFamilyString,
  shadowString,
  durationString,
  cubicBezierString,
  transitionString,
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

// One config per (space, layer, mode). Loading a single layer (+ global, for theme alias
// resolution) keeps themes that share family names (primary/accent/grey across
// masterbrand/fuchsia-*) from colliding in a shared dictionary.
//
// Modes (dark-mode milestone D1): mode 'light' is the implicit default (unsuffixed files,
// byte-identical to the pre-mode outputs). Dark configs read the *.dark.json views and
// write .dark-suffixed siblings for css/scss/less/js/ts/json. The dark CSS uses the
// css/variables built-in `selector` option with [data-theme='dark']. figma and tailwind
// platforms are deliberately light-only for now: Figma carries dark as a MODE on the same
// variables (staging files, milestone D2), and the colour Tailwind files reference
// var(--nsw-*) so they re-resolve when the dark CSS is loaded.
const viewFile = (space, mode) => (mode === 'light' ? `${space}.json` : `${space}.${mode}.json`)
const outName = (space, mode, ext) =>
  mode === 'light' ? `${space}.${ext}` : `${space}.${mode}.${ext}`

const makeConfig = (space, layer, mode = 'light') => {
  const view = viewFile(space, mode)
  const source =
    layer.key === 'global'
      ? [`tokens/global/color/${view}`]
      : [`tokens/${layer.src}/${view}`, `tokens/global/color/${view}`]
  const filter = fromFile(`/${layer.src}/${view}`)

  const platform = (transforms, destination, format, options) => ({
    buildPath: OUT,
    options: { showFileHeader: false },
    transforms,
    files: [{ destination, format, filter, ...(options ? { options } : {}) }],
  })

  const lightOnly = {
    figma: platform(OBJECT_XF, figmaDest(layer, space), 'nsw/figma'),
    tailwind: platform(STRING_XF, `tailwind/colors/${layer.dir}/${space}.css`, 'nsw/tailwind', {
      inline: layer.key === 'semantic',
    }),
  }

  // Dark also ships a media-query flavour (same variables, scoped to the system
  // preference) for consumers without an attribute toggle.
  const darkOnly = {
    cssMedia: platform(
      STRING_XF,
      `css/colors/${layer.dir}/${space}.${mode}-media.css`,
      'nsw/css-media',
    ),
  }

  return {
    source,
    hooks: {
      formats: {
        'nsw/js': nswJs,
        'nsw/ts': nswTs,
        'nsw/dts': nswDts,
        'nsw/json': nswJson,
        'nsw/figma': nswFigma,
        'nsw/tailwind': nswTailwind,
        'nsw/css-media': nswCssMedia,
      },
      transforms: { 'nsw/color-string': colorStringTransform },
    },
    platforms: {
      css: platform(
        STRING_XF,
        `css/colors/${layer.dir}/${outName(space, mode, 'css')}`,
        'css/variables',
        {
          ...(mode !== 'light' ? { selector: "[data-theme='dark']" } : {}),
        },
      ),
      scss: platform(
        STRING_XF,
        `scss/colors/${layer.dir}/${outName(space, mode, 'scss')}`,
        'scss/variables',
      ),
      less: platform(
        STRING_XF,
        `less/colors/${layer.dir}/${outName(space, mode, 'less')}`,
        'less/variables',
      ),
      js: platform(STRING_XF, `js/colors/${layer.dir}/${outName(space, mode, 'js')}`, 'nsw/js'),
      // Declaration sibling so TypeScript consumers of ./js/* get real types.
      jsTypes: platform(
        STRING_XF,
        `js/colors/${layer.dir}/${outName(space, mode, 'd.ts')}`,
        'nsw/dts',
      ),
      ts: platform(STRING_XF, `ts/colors/${layer.dir}/${outName(space, mode, 'ts')}`, 'nsw/ts'),
      json: platform(
        STRING_XF,
        `json/colors/${layer.dir}/${outName(space, mode, 'json')}`,
        'nsw/json',
      ),
      ...(mode === 'light' ? lightOnly : darkOnly),
    },
  }
}

// Layers that have a dark canonical today (global + semantic; themes follow in D3).
const DARK_LAYER_KEYS = new Set(['global', 'semantic'])

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
  // No native Tailwind v4 border-width namespace; the vars still emit from @theme as
  // plain custom properties for arbitrary-value usage.
  { key: 'border', tailwindNamespace: 'border-width' },
  {
    key: 'shadow',
    // Per-family namespaces: the box-shadow rings map to Tailwind v4's native
    // inset-shadow-* utilities, the drop-shadow ramp to shadow-*, and the translucent
    // shadow-colour primitives emit as plain @theme vars.
    tailwindNamespaces: {
      'box-shadow': 'inset-shadow',
      shadow: 'shadow',
      'shadow-color': 'shadow-color',
    },
    // spread aliases {border-width.*} (first cross-category alias) — load the border
    // canonical so SD can resolve it; the filter keeps border tokens out of these files.
    extraSources: ['tokens/global/border/canonical.json'],
  },
  {
    // Multi-family: durations emit as plain --duration-* custom properties (Tailwind v4
    // has no duration namespace), easings map onto the native --ease-* namespace, and the
    // transition composites emit as plain --transition-* shorthands.
    key: 'motion',
    tailwindNamespaces: { duration: 'duration', easing: 'ease', transition: 'transition' },
  },
  // No native Tailwind v4 z-index namespace; --z-index-* emit as plain @theme custom
  // properties for arbitrary-value usage (z-[var(--z-index-modal)]).
  { key: 'z-index', tailwindNamespace: 'z-index' },
]

// DTCG dimension object ({value, unit}) -> "0.25rem" string for every string output.
// The object-shape guard matters for alias tokens (border-width.default): by the time the
// transitive transform reaches them, the alias has resolved to the TARGET's already-
// transformed string — which must pass through untouched, not be re-transformed.
const dimensionTransform = {
  type: 'value',
  transitive: true,
  filter: (token) =>
    token.$type === 'dimension' && typeof token.$value === 'object' && token.$value !== null,
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

// DTCG shadow composite -> CSS box-shadow string (sub-aliases already resolved by SD;
// a missing color renders with currentColor by design).
const shadowTransform = {
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'shadow',
  transform: (token) => shadowString(token.$value),
}

// DTCG duration object ({value, unit}) -> "150ms" string for every string output. Object-
// shape guard mirrors the dimension transform (alias-resolved strings pass through).
const durationTransform = {
  type: 'value',
  transitive: true,
  filter: (token) =>
    token.$type === 'duration' && typeof token.$value === 'object' && token.$value !== null,
  transform: (token) => durationString(token.$value),
}

// DTCG cubicBezier ([x1,y1,x2,y2]) -> "cubic-bezier(…)" string for every string output.
const cubicBezierTransform = {
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'cubicBezier' && Array.isArray(token.$value),
  transform: (token) => cubicBezierString(token.$value),
}

// DTCG transition composite -> CSS transition shorthand. Sub-aliases ({duration.*}/
// {easing.*}) are resolved by SD; the object-shape guard lets the already-stringified
// result pass through on the transitive re-run (same pattern as the shadow transform).
const transitionTransform = {
  type: 'value',
  transitive: true,
  filter: (token) =>
    token.$type === 'transition' &&
    typeof token.$value === 'object' &&
    !Array.isArray(token.$value),
  transform: (token) => transitionString(token.$value),
}

const makeCategoryConfig = (category) => {
  // Categories with extraSources (shadow -> border) need a filter so the alias-resolution
  // sources don't re-emit into this category's files.
  const filter = category.extraSources
    ? fromFile(`/global/${category.key}/canonical.json`)
    : undefined

  const platform = (destination, format, options) => ({
    buildPath: OUT,
    options: { showFileHeader: false },
    transforms: [
      'name/kebab',
      'nsw/shadow',
      'nsw/color-string',
      'nsw/dimension',
      'nsw/duration',
      'nsw/cubic-bezier',
      'nsw/transition',
      'nsw/font-family',
      'nsw/letter-spacing-em',
    ],
    files: [
      { destination, format, ...(filter ? { filter } : {}), ...(options ? { options } : {}) },
    ],
  })

  return {
    source: [`tokens/global/${category.key}/canonical.json`, ...(category.extraSources ?? [])],
    hooks: {
      formats: {
        'nsw/js': nswJs,
        'nsw/ts': nswTs,
        'nsw/dts': nswDts,
        'nsw/json': nswJson,
        'nsw/tailwind-dimension': nswTailwindDimension,
      },
      transforms: {
        'nsw/dimension': dimensionTransform,
        'nsw/duration': durationTransform,
        'nsw/cubic-bezier': cubicBezierTransform,
        'nsw/transition': transitionTransform,
        'nsw/font-family': fontFamilyTransform,
        'nsw/letter-spacing-em': letterSpacingEmTransform,
        'nsw/shadow': shadowTransform,
        'nsw/color-string': colorStringTransform,
      },
    },
    platforms: {
      css: platform(`css/${category.key}/global.css`, 'css/variables'),
      scss: platform(`scss/${category.key}/global.scss`, 'scss/variables'),
      less: platform(`less/${category.key}/global.less`, 'less/variables'),
      js: platform(`js/${category.key}/global.js`, 'nsw/js'),
      jsTypes: platform(`js/${category.key}/global.d.ts`, 'nsw/dts'),
      ts: platform(`ts/${category.key}/global.ts`, 'nsw/ts'),
      json: platform(`json/${category.key}/global.json`, 'nsw/json'),
      tailwind: platform(`tailwind/${category.key}/global.css`, 'nsw/tailwind-dimension', {
        ...(category.tailwindNamespace ? { namespace: category.tailwindNamespace } : {}),
        ...(category.tailwindNamespaces ? { namespaces: category.tailwindNamespaces } : {}),
      }),
    },
  }
}

// ── Semantic typography composites (Phase 4c) ──────────────────────────────────────────
// Alias-only `typography` composites; the global canonical loads alongside so SD resolves
// the nested {font-size.16}-style references before the formats run. The filter keeps the
// global primitives from re-emitting here (they have their own category outputs).
// No tailwind output (Tailwind v4 has no composite namespace) and no Figma staging
// (composites are Figma styles, not variables — locked decision D5).
const typographySemanticConfig = {
  source: ['tokens/semantic/typography/canonical.json', 'tokens/global/typography/canonical.json'],
  hooks: {
    formats: {
      'nsw/typography-css': nswTypographyCss,
      'nsw/typography-scss': nswTypographyScss,
      'nsw/typography-less': nswTypographyLess,
      'nsw/typography-js': nswTypographyJs,
      'nsw/typography-ts': nswTypographyTs,
      'nsw/typography-dts': nswTypographyDts,
      'nsw/typography-json': nswTypographyJson,
    },
  },
  platforms: Object.fromEntries(
    [
      ['css', 'css'],
      ['scss', 'scss'],
      ['less', 'less'],
      ['js', 'js'],
      ['jsTypes', 'd.ts'],
      ['ts', 'ts'],
      ['json', 'json'],
    ].map(([platform, ext]) => [
      platform,
      {
        buildPath: OUT,
        options: { showFileHeader: false },
        transforms: ['name/kebab'],
        files: [
          {
            destination: `${platform === 'jsTypes' ? 'js' : platform}/typography/semantic.${ext}`,
            format: `nsw/typography-${platform === 'jsTypes' ? 'dts' : platform}`,
            filter: (token) => token.$type === 'typography',
          },
        ],
      },
    ]),
  ),
}

export default [
  ...SPACES.flatMap((space) => LAYERS.map((layer) => makeConfig(space, layer))),
  ...SPACES.flatMap((space) =>
    LAYERS.filter((l) => DARK_LAYER_KEYS.has(l.key)).map((layer) =>
      makeConfig(space, layer, 'dark'),
    ),
  ),
  ...CATEGORIES.map(makeCategoryConfig),
  typographySemanticConfig,
]
