// Custom Style Dictionary formats that reproduce the hand-authored output shapes exactly.
// Each receives the resolved dictionary (theme aliases already resolved to concrete hex).
//
// Token paths come from the source tree, e.g. ['nsw-grey','50'] or ['primary','50'].

const toCamel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

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
  // Consistent trailing newline across layers (global dist lacks it — normalised).
  return `${JSON.stringify(obj, null, 2)}\n`
}

// NOTE: the Tailwind format is deferred to Phase 1b — its output is layer-dependent
// (semantic uses `@theme inline {`) and alias-aware (masterbrand maps `--color-primary-50`
// to `var(--nsw-blue-50)`, the alias target), so it needs dedicated, verified handling.
