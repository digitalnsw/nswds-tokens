// Custom Style Dictionary formats that reproduce the hand-authored output shapes exactly.
// Each receives the resolved dictionary (theme aliases already resolved to concrete hex).
//
// Token paths come from the source tree, e.g. ['nsw-grey','50'] or ['primary','50'].

const toCamel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

// Object-form colour value ({ colorSpace, channels, alpha }) -> the CSS function string used
// in the string outputs, matching the published syntax exactly. (Figma keeps the object.)
//   hsl   -> hsl(223.81, 0%, 98.03%)        (comma-separated, % on S and L)
//   rgb   -> rgb(250, 250, 250)             (comma-separated 0–255)
//   oklch -> oklch(0.985… 0 0)              (space-separated; null hue -> 0)
export const colorFunction = (colorSpace, value) => {
  const c = value.channels
  switch (colorSpace) {
    case 'hsl':
      return `hsl(${c[0]}, ${c[1]}%, ${c[2]}%)`
    case 'rgb':
      return `rgb(${c.join(', ')})`
    case 'oklch':
      return `oklch(${c[0]} ${c[1]} ${c[2] ?? 0})`
    default:
      throw new Error(`Unsupported colour space: ${colorSpace}`)
  }
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

// ts/colors/.../hex.ts  ->  export const nswGrey = { '50': '#fafafa', ... }  (quoted keys)
export const nswTs = ({ dictionary }) => {
  let out = ''
  for (const [family, toks] of groupByFamily(dictionary.allTokens)) {
    out += `export const ${toCamel(family)} = {\n`
    for (const t of toks) out += `  '${t.path[1]}': '${t.$value}',\n`
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
  // Object-form colours print `channels` inline (e.g. [240, 251, 255]); JSON.stringify would
  // expand them. Hex (string $value) has no channels so is unaffected. Trailing newline kept
  // consistent across layers (global dist lacks it — normalised).
  const json = JSON.stringify(obj, null, 2).replace(
    /"channels": \[\n\s*([^\]]+?)\n\s*\]/g,
    (_, inner) =>
      `"channels": [${inner
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
