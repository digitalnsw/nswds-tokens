// Generate src/index.ts — the root bundle aggregator. Replaces the previously hand-maintained
// 417-line file so every layer (global/semantic) and theme is exposed uniformly across all
// formats. Colours: tokens.<format>.<global|semantic|themes.<theme>>.<space>. Non-colour
// categories (Phase 4): tokens.<format>.<category>.global — colour paths are unchanged.
// Figma is not in the bundle.
//
// Runs first in `build` (before tsup bundles src/index.ts). Deterministic.

import { writeFileSync } from 'node:fs'

const SPACES = ['hex', 'hsl', 'oklch', 'rgb']
const THEMES = ['masterbrand', 'fuchsia-blue', 'fuchsia-orange', 'data-visualisation']
// Non-colour categories and the layers each exposes. typography has a semantic layer
// (the Phase 4c composites) on top of its global primitives.
const CATEGORIES = [
  { key: 'space', layers: ['global'] },
  { key: 'radius', layers: ['global'] },
  { key: 'breakpoints', layers: ['global'] },
  { key: 'typography', layers: ['global', 'semantic'] },
  { key: 'border', layers: ['global'] },
  { key: 'shadow', layers: ['global'] },
]

const cap = (s) => s[0].toUpperCase() + s.slice(1)
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

// group: where it nests in the tokens object; tokensDir: path under ../tokens for `colors`.
const ENTITIES = [
  { v: 'global', formatDir: 'global', tokensDir: 'global/color', group: 'global' },
  { v: 'semantic', formatDir: 'semantic', tokensDir: 'semantic/color', group: 'semantic' },
  ...THEMES.map((t) => ({
    v: camel(t),
    formatDir: `themes/${t}`,
    tokensDir: `themes/color/${t}`,
    group: 'themes',
    themeKey: t,
  })),
]

// format key -> { infix, ext, require? }. `colors` reads token views from ../tokens; everything
// else reads its own generated output. colors + json use require (JSON); the rest import as text/
// modules. ts files are .ts but imported with a .js specifier (NodeNext).
const FORMATS = [
  { key: 'colors', infix: 'Color' },
  { key: 'css', infix: 'Css', ext: 'css' },
  { key: 'js', infix: 'Js', ext: 'js' },
  { key: 'json', infix: 'Json' },
  { key: 'less', infix: 'Less', ext: 'less' },
  { key: 'scss', infix: 'Scss', ext: 'scss' },
  { key: 'tailwind', infix: 'Tailwind', ext: 'css' },
  { key: 'ts', infix: 'Ts', ext: 'js' },
]

// Dark mode (D1): global + semantic expose a nested dark sub-object per format
// (tokens.css.global.dark.hex, …). Themes follow in D3; tailwind has no dark outputs
// (light-only platform in the SD config).
const DARK_GROUPS = new Set(['global', 'semantic'])
const hasDark = (fmt, ent) => fmt.key !== 'tailwind' && DARK_GROUPS.has(ent.group)
// The media-query flavour of the dark stylesheets is CSS-only (scss/less/js consumers
// compose their own scoping; tailwind re-resolves via var() chains).
const hasDarkMedia = (fmt, ent) => fmt.key === 'css' && DARK_GROUPS.has(ent.group)
const MODE_SUFFIX = { light: '', dark: '.dark', 'dark-media': '.dark-media' }
const MODE_VAR = { light: '', dark: 'Dark', 'dark-media': 'DarkMedia' }
const modeSuffix = (mode) => MODE_SUFFIX[mode]

const varName = (fmt, ent, space, mode = 'light') =>
  `${ent.v}${fmt.infix}${cap(space)}${MODE_VAR[mode]}`

// Text-loaded style formats import as DEFAULT (tsup's text loader exports the file
// contents as the default export) so each leaf is a plain string at runtime; js/ts are
// real modules and keep namespace imports.
const TEXT_FORMATS = new Set(['css', 'less', 'scss', 'tailwind'])

const importLine = (fmt, ent, space, mode = 'light') => {
  const v = varName(fmt, ent, space, mode)
  const m = modeSuffix(mode)
  if (fmt.key === 'colors')
    return `const ${v} = require('../tokens/${ent.tokensDir}/${space}${m}.json')`
  if (fmt.key === 'json')
    return `const ${v} = require('./json/colors/${ent.formatDir}/${space}${m}.json')`
  if (TEXT_FORMATS.has(fmt.key))
    return `import ${v} from './${fmt.key}/colors/${ent.formatDir}/${space}${m}.${fmt.ext}'`
  return `import * as ${v} from './${fmt.key}/colors/${ent.formatDir}/${space}${m}.${fmt.ext}'`
}

// Type of a leaf in the explicit annotation below: style text -> string, JSON -> the
// loosely-typed require result, js/ts modules -> their real (d.ts-backed) module types.
const leafType = (fmt, v) => {
  if (TEXT_FORMATS.has(fmt.key)) return 'string'
  if (fmt.key === 'colors' || fmt.key === 'json') return 'any'
  return `typeof ${v}`
}

// Category outputs exist for every style format; `colors` is colour-specific (raw category
// DTCG is consumable via the ./tokens/* subpath exports instead). The semantic typography
// composites have no tailwind output (Tailwind v4 has no composite namespace).
const categoryLayers = (fmt, category) =>
  category.layers.filter((layer) => !(layer === 'semantic' && fmt.key === 'tailwind'))
const categoryVarName = (fmt, category, layer) => `${camel(category.key)}${fmt.infix}${cap(layer)}`
const categoryImportLine = (fmt, category, layer) => {
  const v = categoryVarName(fmt, category, layer)
  if (fmt.key === 'json') return `const ${v} = require('./json/${category.key}/${layer}.json')`
  if (TEXT_FORMATS.has(fmt.key))
    return `import ${v} from './${fmt.key}/${category.key}/${layer}.${fmt.ext}'`
  return `import * as ${v} from './${fmt.key}/${category.key}/${layer}.${fmt.ext}'`
}

let out = '/* eslint-disable */\n// Generated by scripts/build-index.mjs — do not edit.\n\n'
for (const fmt of FORMATS) {
  for (const ent of ENTITIES) {
    for (const space of SPACES) out += `${importLine(fmt, ent, space)}\n`
    if (hasDark(fmt, ent))
      for (const space of SPACES) out += `${importLine(fmt, ent, space, 'dark')}\n`
    if (hasDarkMedia(fmt, ent))
      for (const space of SPACES) out += `${importLine(fmt, ent, space, 'dark-media')}\n`
  }
  if (fmt.key !== 'colors')
    for (const category of CATEGORIES)
      for (const layer of categoryLayers(fmt, category))
        out += `${categoryImportLine(fmt, category, layer)}\n`
  out += '\n'
}

// asType=false emits the value tree (identifiers); asType=true emits the matching type
// (string/any/typeof) with identical structure, used to annotate the export explicitly.
const spaceObj = (fmt, ent, asType) => {
  const entries = SPACES.map((s) => {
    const v = varName(fmt, ent, s)
    return `${s}: ${asType ? leafType(fmt, v) : v}`
  })
  if (hasDark(fmt, ent)) {
    const dark = SPACES.map((s) => {
      const v = varName(fmt, ent, s, 'dark')
      return `${s}: ${asType ? leafType(fmt, v) : v}`
    })
    entries.push(`dark: { ${dark.join(', ')} }`)
  }
  if (hasDarkMedia(fmt, ent)) {
    const media = SPACES.map((s) => {
      const v = varName(fmt, ent, s, 'dark-media')
      return `${s}: ${asType ? leafType(fmt, v) : v}`
    })
    entries.push(`darkMedia: { ${media.join(', ')} }`)
  }
  return `{ ${entries.join(', ')} }`
}
const formatTree = (fmt, asType) => {
  const get = (group) => ENTITIES.find((e) => e.group === group)
  const sep = asType ? ';' : ','
  const themes = ENTITIES.filter((e) => e.group === 'themes')
    .map((t) => `      ${JSON.stringify(t.themeKey)}: ${spaceObj(fmt, t, asType)}${sep}`)
    .join('\n')
  const categories =
    fmt.key === 'colors'
      ? []
      : CATEGORIES.map((c) => {
          const layers = categoryLayers(fmt, c)
            .map((layer) => {
              const v = categoryVarName(fmt, c, layer)
              return `${layer}: ${asType ? leafType(fmt, v) : v}`
            })
            .join(asType ? '; ' : ', ')
          return `    ${camel(c.key)}: { ${layers} }${sep}`
        })
  return [
    `  ${fmt.key}: {`,
    `    global: ${spaceObj(fmt, get('global'), asType)}${sep}`,
    `    semantic: ${spaceObj(fmt, get('semantic'), asType)}${sep}`,
    `    themes: {`,
    themes,
    `    }${sep}`,
    ...categories,
    `  }${sep}`,
  ].join('\n')
}

out += `export const tokens: {\n${FORMATS.map((f) => formatTree(f, true)).join('\n')}\n} = {\n${FORMATS.map((f) => formatTree(f, false)).join('\n')}\n}\n\n`

out += `export const colorTokens = tokens.colors
export const cssTokens = tokens.css
export const jsTokens = tokens.js
export const jsonTokens = tokens.json
export const lessTokens = tokens.less
export const scssTokens = tokens.scss
export const tailwindTokens = tokens.tailwind
export const tsTokens = tokens.ts

export const brand = {
  iconDark: { ico: './brand/icon-dark.ico', png: './brand/icon-dark.png', svg: './brand/icon-dark.svg' },
  iconLight: { ico: './brand/icon-light.ico', png: './brand/icon-light.png', svg: './brand/icon-light.svg' },
  icon: './brand/icon.svg',
  logo: { png: './brand/logo.png', svg: './brand/logo.svg' },
  placeholder: './brand/placeholder.svg',
}
`

writeFileSync('src/index.ts', out)
console.log('✅ Generated src/index.ts')
