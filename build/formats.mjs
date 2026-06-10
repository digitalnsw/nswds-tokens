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

const groupByFamily = (tokens) => {
  const groups = new Map()
  for (const t of tokens) {
    const family = t.path[0]
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family).push(t)
  }
  return groups
}

// js/colors/.../hex.js  ->  export const nswGrey = { 50: '#fafafa', ... }  (unquoted keys)
export const nswJs = ({ dictionary }) => {
  let out = ''
  for (const [family, toks] of groupByFamily(dictionary.allTokens)) {
    out += `export const ${toCamel(family)} = {\n`
    for (const t of toks) out += `  ${t.path[1]}: '${t.$value}',\n`
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
    for (const t of toks) out += `  ${tsKey(t.path[1])}: '${t.$value}',\n`
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
// tailwind/<category>/global.css — Tailwind v4 @theme block for dimension categories.
// Unlike colours there is no :root indirection: dimension namespaces (--spacing-*,
// --radius-*, --breakpoint-*) get direct values. options.namespace maps the token family
// to the Tailwind namespace (space -> spacing); the family segment is dropped from the
// variable name (--spacing-4, not --spacing-space-4).
export const nswTailwindDimension = ({ dictionary, options }) => {
  let out = '@theme {\n'
  for (const t of dictionary.allTokens) {
    out += `  --${options.namespace}-${t.path.slice(1).join('-')}: ${t.$value};\n`
  }
  return `${out}}\n`
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
