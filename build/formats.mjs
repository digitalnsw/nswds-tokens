// Custom Style Dictionary formats that reproduce the hand-authored output shapes exactly.
// Each receives the resolved dictionary (theme aliases already resolved to concrete hex).
//
// Token paths come from the source tree, e.g. ['nsw-grey','50'] or ['primary','50'].

const toCamel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

// DTCG 2025.10 colour object (C1) -> the CSS function string used in the string outputs.
//   srgb  components [r,g,b] 0–1     -> rgb(250, 250, 250)
//   hsl   components [H,S,L]         -> hsl(H, S%, L%)
//   oklch components [L,C,H]         -> oklch(L C H)
// The achromatic-hue keyword "none" (kept in the DTCG object) becomes 0 in the CSS string.
const noneToZero = (x) => (x === 'none' ? 0 : x)
export const colorFunction = (colorSpace, value) => {
  const c = value.components
  switch (colorSpace) {
    case 'srgb':
      return `rgb(${c.map((x) => Math.round(x * 255)).join(', ')})`
    case 'hsl':
      return `hsl(${noneToZero(c[0])}, ${c[1]}%, ${c[2]}%)`
    case 'oklch':
      return `oklch(${c[0]} ${c[1]} ${noneToZero(c[2])})`
    default:
      throw new Error(`Unsupported colour space: ${colorSpace}`)
  }
}

// DTCG dimension object ({value, unit}) -> CSS dimension string. Zero stays unitless-free
// as "0<unit>" is valid CSS but "0" would lose the unit round-trip, so keep the unit.
export const dimensionString = ({ value, unit }) => `${value}${unit}`

// DTCG fontFamily (string or array stack) -> CSS font-family string. Names containing
// whitespace are quoted ('Public Sans'); keywords/idents are left bare.
export const fontFamilyString = (value) => {
  const names = Array.isArray(value) ? value : [value]
  return names.map((n) => (/\s/.test(n) ? `'${n}'` : n)).join(', ')
}

const groupByFamily = (tokens) => {
  const groups = new Map()
  for (const t of tokens) {
    const family = t.path[0]
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family).push(t)
  }
  return groups
}

// Token value -> JS literal. Numbers (fontWeight, line-height) stay numeric so JS/TS
// consumers get a usable type, matching the JSON outputs. Strings are quoted the way
// Prettier would: single quotes normally, double quotes when the value itself contains
// single quotes (font stacks like 'Public Sans'). Colour/dimension values are plain
// strings without quotes inside, keeping those outputs identical.
const jsLiteral = (v) => {
  if (typeof v === 'number') return String(v)
  const s = String(v)
  return s.includes("'") ? `"${s.replace(/"/g, '\\"')}"` : `'${s}'`
}

// js/colors/.../hex.js  ->  export const nswGrey = { 50: '#fafafa', ... }  (unquoted keys)
export const nswJs = ({ dictionary }) => {
  let out = ''
  for (const [family, toks] of groupByFamily(dictionary.allTokens)) {
    out += `export const ${toCamel(family)} = {\n`
    for (const t of toks) out += `  ${t.path[1]}: ${jsLiteral(t.$value)},\n`
    out += `}\n`
  }
  return out
}

// ts/colors/.../hex.ts  ->  export const nswGrey = { '50': '#fafafa', ... }
// Keys are quoted only when they are not valid identifiers (numeric colour steps stay
// quoted; alpha dimension steps like `none`/`xs` are unquoted) — matching Prettier.
const tsKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`)
export const nswTs = ({ dictionary }) => {
  let out = ''
  for (const [family, toks] of groupByFamily(dictionary.allTokens)) {
    out += `export const ${toCamel(family)} = {\n`
    for (const t of toks) out += `  ${tsKey(t.path[1])}: ${jsLiteral(t.$value)},\n`
    out += `}\n`
  }
  return out
}

// json/colors/.../hex.json  ->  { "nsw-grey": { "nsw-grey-50": "#fafafa", ... } }
export const nswJson = ({ dictionary }) => {
  const obj = {}
  for (const t of dictionary.allTokens) {
    const family = t.path[0]
    ;(obj[family] ??= {})[t.path.join('-')] = t.$value
  }
  // Consistent trailing newline across layers (global dist lacks it — normalised).
  return `${JSON.stringify(obj, null, 2)}\n`
}

// figma/color/.../hex.json  ->  { "nsw-grey": { "50": { "$type":"color", "$value":"#fafafa" } } }
export const nswFigma = ({ dictionary }) => {
  const obj = {}
  for (const t of dictionary.allTokens) {
    const family = t.path[0]
    ;(obj[family] ??= {})[t.path[1]] = { $type: 'color', $value: t.$value }
  }
  // DTCG object colours print `components` inline; JSON.stringify would expand them. Hex
  // (string $value) has no components so is unaffected. Trailing newline kept consistent.
  const json = JSON.stringify(obj, null, 2).replace(
    /"components": \[\n\s*([^\]]+?)\n\s*\]/g,
    (_, inner) =>
      `"components": [${inner
        .split(',')
        .map((s) => s.trim())
        .join(', ')}]`,
  )
  return `${json}\n`
}

// tailwind/colors/.../hex.css — Tailwind v4 @theme block. Layer-dependent:
//   - concrete layers (global, semantic): `--color-X: var(--X)` + a :root block defining
//     `--X: #hex`. The `inline` option adds `@theme inline {` (semantic only).
//   - alias layers (masterbrand): `--color-<local>: var(--<aliasTarget>)` (e.g.
//     primary-50 -> var(--nsw-blue-50)) and NO :root block — it relies on the referenced
//     layer's vars being imported.
// tailwind/<category>/global.css — Tailwind v4 @theme block for non-colour categories.
// Unlike colours there is no :root indirection: dimension/typography namespaces
// (--spacing-*, --radius-*, --text-*, …) get direct values. The token family maps to the
// Tailwind namespace via options.namespace (single-family categories, space -> spacing)
// or options.namespaces (multi-family categories like typography: font-size -> text,
// line-height -> leading, …); the family segment is dropped from the variable name
// (--spacing-4, not --spacing-space-4).
export const nswTailwindDimension = ({ dictionary, options }) => {
  let out = '@theme {\n'
  for (const t of dictionary.allTokens) {
    const namespace = options.namespaces?.[t.path[0]] ?? options.namespace
    out += `  --${namespace}-${t.path.slice(1).join('-')}: ${t.$value};\n`
  }
  return `${out}}\n`
}

// ── Typography composites (Phase 4c) ─────────────────────────────────────────────────
// SD resolves the {alias} references inside the composite $value before formats run, so
// each part arrives as its primitive raw value and is stringified per its kind here.
// letterSpacing is the unitless em multiplier convention from the primitives.
const typographyParts = (value) => ({
  'font-family': fontFamilyString(value.fontFamily),
  'font-size': dimensionString(value.fontSize),
  'font-weight': value.fontWeight,
  'line-height': value.lineHeight,
  'letter-spacing': `${value.letterSpacing}em`,
})

// The CSS `font` shorthand carries weight size/line-height family; letter-spacing is not
// part of the shorthand and is emitted as its own custom property alongside.
const fontShorthand = (value) =>
  `${value.fontWeight} ${dimensionString(value.fontSize)}/${value.lineHeight} ${fontFamilyString(value.fontFamily)}`

// css/typography/semantic.css — per-property custom props + a font-shorthand prop per
// style (`font: var(--typography-body)`), so nothing about the composite is lossy.
export const nswTypographyCss = ({ dictionary }) => {
  let out = ':root {\n'
  for (const t of dictionary.allTokens) {
    const name = t.path.join('-')
    for (const [part, v] of Object.entries(typographyParts(t.$value))) {
      out += `  --${name}-${part}: ${v};\n`
    }
    out += `  --${name}: ${fontShorthand(t.$value)};\n`
  }
  return `${out}}\n`
}

// scss|less/typography/semantic — flattened per-property variables.
const typographyVars = (dictionary, sigil) => {
  let out = ''
  for (const t of dictionary.allTokens) {
    const name = t.path.join('-')
    for (const [part, v] of Object.entries(typographyParts(t.$value))) {
      out += `${sigil}${name}-${part}: ${v};\n`
    }
  }
  return out
}
export const nswTypographyScss = ({ dictionary }) => typographyVars(dictionary, '$')
export const nswTypographyLess = ({ dictionary }) => typographyVars(dictionary, '@')

// js|ts/typography/semantic — one object per style; numbers stay numeric (matching the
// primitive outputs), strings via the Prettier-aware literal quoting.
const typographyModule = ({ dictionary }) => {
  let out = ''
  for (const t of dictionary.allTokens) {
    const v = t.$value
    out += `export const ${toCamel(t.path[1])} = {\n`
    out += `  fontFamily: ${jsLiteral(fontFamilyString(v.fontFamily))},\n`
    out += `  fontSize: ${jsLiteral(dimensionString(v.fontSize))},\n`
    out += `  fontWeight: ${jsLiteral(v.fontWeight)},\n`
    out += `  lineHeight: ${jsLiteral(v.lineHeight)},\n`
    out += `  letterSpacing: ${jsLiteral(`${v.letterSpacing}em`)},\n`
    out += `}\n`
  }
  return out
}
export const nswTypographyJs = typographyModule
export const nswTypographyTs = typographyModule

// json/typography/semantic.json — kebab style names, parts as a flat object.
export const nswTypographyJson = ({ dictionary }) => {
  const obj = {}
  for (const t of dictionary.allTokens) {
    const v = t.$value
    obj[t.path[1]] = {
      fontFamily: fontFamilyString(v.fontFamily),
      fontSize: dimensionString(v.fontSize),
      fontWeight: v.fontWeight,
      lineHeight: v.lineHeight,
      letterSpacing: `${v.letterSpacing}em`,
    }
  }
  return `${JSON.stringify(obj, null, 2)}\n`
}

const ALIAS = /^\{([\w-]+(?:\.[\w-]+)*)\}$/
export const nswTailwind = ({ dictionary, options }) => {
  const header = options?.inline ? '@theme inline' : '@theme'
  let refs = ''
  let defs = ''
  let isAliasLayer = false
  for (const t of dictionary.allTokens) {
    const name = t.path.join('-')
    const aliasMatch = ALIAS.exec(t.original?.$value ?? '')
    if (aliasMatch) isAliasLayer = true
    const refName = aliasMatch ? aliasMatch[1].replaceAll('.', '-') : name
    refs += `  --color-${name}: var(--${refName});\n`
    defs += `  --${name}: ${t.$value};\n`
  }
  return isAliasLayer ? `${header} {\n${refs}}\n` : `${header} {\n${refs}}\n\n:root {\n${defs}}\n`
}
