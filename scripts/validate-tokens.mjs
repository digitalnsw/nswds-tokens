// Token validation gate.
//
// Scans the canonical per-colour-space token tree under tokens/{global,semantic,themes}
// AND the non-colour category sources (tokens/<layer>/<category>/canonical.json — space,
// radius, breakpoints, …) and checks:
//   ERRORS (fail CI):
//     - every leaf has a $value
//     - every alias {a.b.c} resolves to an existing token (no dangling references)
//     - no alias reference cycles
//     - no duplicate flattened token path defined with conflicting values
//   WARNINGS (informational; do not fail CI yet):
//     - missing $type on a leaf
//     - DTCG 2025.10 Color-module deviations (see review item C1): `channels` should be
//       `components`, `rgb` should be `srgb`, sRGB components should be 0–1, powerless
//       components should be the string "none" (not null), and a `hex` fallback is
//       recommended. These are warnings until C1 is addressed, then flip to errors.
//
// Note: the top-level Figma-export files ("primitives-*.light.json",
// "themes-*.light.json") are intentionally out of scope here — they are the Figma sync
// staging copies (see scripts/figma-collections.ts).

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve()
const tokensDir = resolve(root, 'tokens')
const SPACES = ['hex', 'hsl', 'rgb', 'oklch']
const ALIAS_PATTERN = /^\{([\w-]+(?:\.[\w-]+)*)\}$/

const errors = []
const warnings = []

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// Flatten a token document to { 'a.b.c': leafNode } for every token leaf.
// A node is treated as a leaf when it looks like a token ($value or $type present) and
// has no non-$ child keys. Collecting token-like leaves that lack $value (e.g. only
// $type/$description) is deliberate, so the downstream "missing $value" check can fire
// instead of such malformed leaves being silently recursed into and dropped.
const flatten = (obj, prefix, out) => {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue
    const path = prefix ? `${prefix}.${key}` : key
    if (!value || typeof value !== 'object') continue
    const hasChildren = Object.keys(value).some((k) => !k.startsWith('$'))
    const looksLikeToken = '$value' in value || '$type' in value
    if (looksLikeToken && !hasChildren) {
      out[path] = value
    } else {
      flatten(value, path, out)
    }
  }
  return out
}

// Collect the source files for one colour space.
const filesForSpace = (space) => {
  const files = []
  for (const layer of ['global', 'semantic']) {
    const p = resolve(tokensDir, layer, 'color', `${space}.json`)
    if (existsSync(p)) files.push({ label: `${layer}/${space}`, path: p })
  }
  const themesRoot = resolve(tokensDir, 'themes', 'color')
  if (existsSync(themesRoot)) {
    for (const theme of readdirSync(themesRoot, { withFileTypes: true })) {
      if (!theme.isDirectory()) continue
      const p = resolve(themesRoot, theme.name, `${space}.json`)
      if (existsSync(p)) files.push({ label: `themes/${theme.name}/${space}`, path: p })
    }
  }
  return files
}

const aliasTarget = (leaf) =>
  typeof leaf.$value === 'string' ? (leaf.$value.match(ALIAS_PATTERN)?.[1] ?? null) : null

// Walk every alias chain in a namespace: errors on dangling references and cycles.
// Shared by the colour-space and category validations so both get identical guarantees.
const checkAliasChains = (allLeaves, leafByPath) => {
  const resolveAlias = (startPath, startLeaf) => {
    const seen = new Set()
    let path = startPath
    let leaf = startLeaf
    while (true) {
      const target = aliasTarget(leaf)
      if (!target) return // resolved to a concrete value
      if (seen.has(path)) {
        errors.push(`alias cycle detected at "${path}"`)
        return
      }
      seen.add(path)
      const next = leafByPath[target]
      if (!next) {
        errors.push(`unresolved alias "{${target}}" referenced by "${path}"`)
        return
      }
      path = target
      leaf = next
    }
  }
  for (const { path, leaf } of allLeaves) resolveAlias(path, leaf)
}

// DTCG 2025.10 Color-module conformance (warnings).
const checkColorShape = (label, path, leaf) => {
  const v = leaf.$value
  if (!v || typeof v !== 'object') return // string hex / alias — nothing to check here
  if ('channels' in v && !('components' in v))
    warnings.push(`${label} ${path}: uses "channels"; DTCG expects "components"`)
  if (v.colorSpace === 'rgb')
    warnings.push(`${label} ${path}: colorSpace "rgb"; DTCG expects "srgb"`)
  const comps = v.components ?? v.channels
  // Check both the legacy "rgb" and DTCG-preferred "srgb" so the range warning keeps
  // firing during/after the C1 migration (renaming the space but leaving 0–255 values).
  if (
    ['rgb', 'srgb'].includes(v.colorSpace) &&
    Array.isArray(comps) &&
    comps.some((c) => typeof c === 'number' && c > 1)
  )
    warnings.push(`${label} ${path}: sRGB components appear to be 0–255; DTCG expects 0–1`)
  if (Array.isArray(comps) && comps.includes(null))
    warnings.push(`${label} ${path}: null component; DTCG expects the string "none"`)
  if (!('hex' in v)) warnings.push(`${label} ${path}: no "hex" fallback (recommended by DTCG)`)
}

// ── Non-colour categories (Phase 4) ──────────────────────────────────────────────────
// One canonical.json per (layer, category); no per-space views. Discover dynamically so
// new categories (typography, shadow, …) are validated the moment their files exist.
const categoryFiles = () => {
  const files = []
  for (const layer of ['global', 'semantic']) {
    const layerDir = resolve(tokensDir, layer)
    if (!existsSync(layerDir)) continue
    for (const entry of readdirSync(layerDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'color') continue
      const p = resolve(layerDir, entry.name, 'canonical.json')
      if (existsSync(p)) files.push({ label: `${layer}/${entry.name}`, path: p })
    }
  }
  return files
}

// DTCG 2025.10 dimension conformance: $value is { value: number, unit: "px" | "rem" }.
const checkDimensionShape = (label, path, leaf) => {
  if (leaf.$type !== 'dimension') return
  const v = leaf.$value
  if (aliasTarget(leaf)) return // aliases checked by reference resolution
  if (!v || typeof v !== 'object' || typeof v.value !== 'number') {
    errors.push(`${label} ${path}: dimension $value must be { value: number, unit }`)
    return
  }
  if (!['px', 'rem'].includes(v.unit))
    errors.push(`${label} ${path}: dimension unit "${v.unit}" (DTCG allows "px" or "rem")`)
}

// DTCG typography primitive conformance (Phase 4b).
const checkTypographyShapes = (label, path, leaf) => {
  if (aliasTarget(leaf)) return
  if (leaf.$type === 'fontFamily') {
    const v = leaf.$value
    const ok =
      typeof v === 'string' ||
      (Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'string'))
    if (!ok) errors.push(`${label} ${path}: fontFamily $value must be a string or array of strings`)
  }
  if (leaf.$type === 'fontWeight') {
    const v = leaf.$value
    if (typeof v !== 'number' || v < 1 || v > 1000)
      errors.push(`${label} ${path}: fontWeight $value must be a number in 1–1000`)
  }
  // line-height / letter-spacing primitives — a string or object here would silently
  // break the generators downstream.
  if (leaf.$type === 'number' && typeof leaf.$value !== 'number') {
    errors.push(`${label} ${path}: number $value must be a JSON number`)
  }
}

// DTCG typography composite (Phase 4c): all five sub-values present and — per the locked
// plan — alias references into the global primitives, never literals. Returns the
// sub-alias targets for resolution once the full namespace is collected.
const COMPOSITE_FIELDS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight']
const checkTypographyComposite = (label, path, leaf) => {
  if (leaf.$type !== 'typography') return []
  const v = leaf.$value
  if (!v || typeof v !== 'object') {
    errors.push(`${label} ${path}: typography $value must be an object of sub-values`)
    return []
  }
  const pending = []
  for (const field of COMPOSITE_FIELDS) {
    const sub = v[field]
    if (sub === undefined) {
      errors.push(`${label} ${path}: typography composite is missing "${field}"`)
      continue
    }
    const target = typeof sub === 'string' ? (sub.match(ALIAS_PATTERN)?.[1] ?? null) : null
    if (!target) {
      errors.push(
        `${label} ${path}: typography "${field}" must be an {alias} to a primitive (got ${JSON.stringify(sub)})`,
      )
      continue
    }
    pending.push({ label, path: `${path}.${field}`, field, target })
  }
  return pending
}

// Each composite sub-field must ultimately land on a primitive of the right $type —
// existence alone would let fontSize alias a line-height (or another composite).
const COMPOSITE_FIELD_TYPES = {
  fontFamily: 'fontFamily',
  fontSize: 'dimension',
  fontWeight: 'fontWeight',
  letterSpacing: 'number',
  lineHeight: 'number',
}

// DTCG shadow composite (Phase 4d): object or layered array. Lengths are dimension
// objects or {alias}es to dimension tokens. `color` is OPTIONAL here — a deliberate
// deviation from strict DTCG: a colourless CSS box-shadow renders with currentColor,
// which is exactly how the inset ring tokens are designed. `inset` is an optional bool.
const SHADOW_LENGTH_FIELDS = ['offsetX', 'offsetY', 'blur', 'spread']
const checkShadowComposite = (label, path, leaf) => {
  if (leaf.$type !== 'shadow') return []
  const layers = Array.isArray(leaf.$value) ? leaf.$value : [leaf.$value]
  const pending = []
  layers.forEach((layer, i) => {
    const at = layers.length > 1 ? `${path}[${i}]` : path
    if (!layer || typeof layer !== 'object') {
      errors.push(`${label} ${at}: shadow layer must be an object`)
      return
    }
    for (const field of SHADOW_LENGTH_FIELDS) {
      const sub = layer[field]
      if (sub === undefined) {
        errors.push(`${label} ${at}: shadow layer is missing "${field}"`)
        continue
      }
      const target = typeof sub === 'string' ? (sub.match(ALIAS_PATTERN)?.[1] ?? null) : null
      if (target) {
        pending.push({ label, path: `${at}.${field}`, field: 'shadowLength', target })
      } else if (!sub || typeof sub !== 'object' || typeof sub.value !== 'number') {
        errors.push(`${label} ${at}: shadow "${field}" must be a dimension object or an {alias}`)
      } else if (!['px', 'rem'].includes(sub.unit)) {
        errors.push(`${label} ${at}: shadow "${field}" unit "${sub.unit}" (px or rem)`)
      }
    }
    if ('inset' in layer && typeof layer.inset !== 'boolean')
      errors.push(`${label} ${at}: shadow "inset" must be a boolean`)
    if ('color' in layer) {
      const target =
        typeof layer.color === 'string' ? (layer.color.match(ALIAS_PATTERN)?.[1] ?? null) : null
      if (target) pending.push({ label, path: `${at}.color`, field: 'shadowColor', target })
      else if (typeof layer.color !== 'string')
        errors.push(`${label} ${at}: shadow "color" must be an {alias} or a colour string`)
    }
  })
  return pending
}

{
  const files = categoryFiles()
  const namespace = {}
  const leafByPath = {}
  const allLeaves = []
  const pendingCompositeAliases = []

  for (const { label, path } of files) {
    const flat = flatten(readJson(path), '', {})
    for (const [tokenPath, leaf] of Object.entries(flat)) {
      allLeaves.push({ label, path: tokenPath, leaf })
      leafByPath[tokenPath] = leaf

      if (!('$value' in leaf)) errors.push(`${label} ${tokenPath}: missing $value`)
      if (!('$type' in leaf)) warnings.push(`${label} ${tokenPath}: missing $type`)
      checkDimensionShape(label, tokenPath, leaf)
      checkTypographyShapes(label, tokenPath, leaf)
      if (leaf.$type === 'color') checkColorShape(label, tokenPath, leaf)
      pendingCompositeAliases.push(...checkTypographyComposite(label, tokenPath, leaf))
      pendingCompositeAliases.push(...checkShadowComposite(label, tokenPath, leaf))

      const serialized = JSON.stringify(leaf.$value)
      const prior = namespace[tokenPath]
      if (prior && prior.value !== serialized) {
        errors.push(
          `duplicate token "${tokenPath}" with conflicting values (${prior.label} vs ${label})`,
        )
      }
      namespace[tokenPath] = { value: serialized, label }
    }
  }

  // Alias resolution within the category namespace (semantic categories will alias global)
  // — full chain walk with cycle detection, same guarantees as the colour spaces.
  checkAliasChains(allLeaves, leafByPath)

  // Composite sub-aliases resolve against the same flat namespace (global primitives),
  // following alias chains to the terminal leaf, which must match the field's $type.
  for (const { label, path, field, target } of pendingCompositeAliases) {
    const seen = new Set()
    let current = target
    let leaf = leafByPath[current]
    while (leaf) {
      const next = aliasTarget(leaf)
      if (!next || seen.has(current)) break // concrete leaf, or cycle (reported elsewhere)
      seen.add(current)
      current = next
      leaf = leafByPath[current]
    }
    if (!leaf) {
      errors.push(`${label}: unresolved alias "{${target}}" referenced by "${path}"`)
      continue
    }
    const expected =
      field === 'shadowLength'
        ? 'dimension'
        : field === 'shadowColor'
          ? 'color'
          : COMPOSITE_FIELD_TYPES[field]
    if (leaf.$type !== expected) {
      errors.push(
        `${label} ${path}: alias "{${target}}" resolves to a "${leaf.$type}" token; ${field} requires "${expected}"`,
      )
    }
  }
}

for (const space of SPACES) {
  const files = filesForSpace(space)
  if (!files.length) continue

  const namespace = {} // path -> { value, label } (for duplicate detection)
  const leafByPath = {} // path -> leaf (O(1) alias resolution)
  const allLeaves = [] // { label, path, leaf }

  for (const { label, path } of files) {
    const flat = flatten(readJson(path), '', {})
    for (const [tokenPath, leaf] of Object.entries(flat)) {
      allLeaves.push({ label, path: tokenPath, leaf })
      leafByPath[tokenPath] = leaf

      // structural
      if (!('$value' in leaf)) errors.push(`${label} ${tokenPath}: missing $value`)
      if (!('$type' in leaf)) warnings.push(`${label} ${tokenPath}: missing $type`)
      checkColorShape(label, tokenPath, leaf)

      // Duplicate detection across the primitive layers (global/semantic). Themes deliberately
      // reuse family names (primary/accent/grey in masterbrand/fuchsia-*), so they're excluded —
      // each theme is its own namespace.
      if (!label.startsWith('themes/')) {
        const serialized = JSON.stringify(leaf.$value)
        const prior = namespace[tokenPath]
        if (prior && prior.value !== serialized) {
          errors.push(
            `duplicate token "${tokenPath}" with conflicting values (${prior.label} vs ${label})`,
          )
        }
        namespace[tokenPath] = { value: serialized, label }
      }
    }
  }

  // reference resolution + cycle detection (shared helper)
  checkAliasChains(allLeaves, leafByPath)
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

if (warnings.length) {
  console.warn(`\n⚠️  ${plural(warnings.length, 'warning')}:`)
  for (const w of warnings.slice(0, 50)) console.warn(`   - ${w}`)
  if (warnings.length > 50) console.warn(`   …and ${warnings.length - 50} more`)
}

if (errors.length) {
  console.error(`\n❌ ${plural(errors.length, 'error')}:`)
  for (const e of errors) console.error(`   - ${e}`)
  console.error('\nToken validation failed.')
  process.exit(1)
}

console.log(`\n✅ Token validation passed (${plural(warnings.length, 'warning')}).`)
