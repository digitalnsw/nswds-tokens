import type { VariableScope } from '@figma/rest-api-spec'

// Manifest mapping on-disk token file names to the Figma variable collection + mode they
// represent. This decouples file names from Figma collection names, so files can use
// tooling-safe kebab-case while the Figma collections keep their human-readable names
// (which contain spaces and an em-dash). See token_import.ts#collectionAndModeFromFileName.
//
// Without this, the collection name was derived by splitting the file name on "." — which
// forced the file to be literally named e.g. "Primitives — global.light.json", and those
// spaces/em-dash break shells, Git tooling (core.quotePath), and URLs.
export type FigmaCollectionRef = { collectionName: string; modeName: string }

export const FIGMA_COLLECTIONS: Record<string, FigmaCollectionRef> = {
  'primitives-global.light.json': { collectionName: 'Primitives — global', modeName: 'light' },
  'primitives-semantic.light.json': { collectionName: 'Primitives — semantic', modeName: 'light' },
  'themes-masterbrand.light.json': { collectionName: 'Themes — masterbrand', modeName: 'light' },
  // Phase 4 dimension collections (single "base" mode — values don't vary by theme/mode).
  // The first sync-tokens-to-figma push CREATEs these collections in the Figma file.
  'space.base.json': { collectionName: 'Space', modeName: 'base' },
  'radius.base.json': { collectionName: 'Radius', modeName: 'base' },
  'breakpoints.base.json': { collectionName: 'Breakpoints', modeName: 'base' },
  'typography.base.json': { collectionName: 'Typography', modeName: 'base' },
  'border.base.json': { collectionName: 'Border', modeName: 'base' },
}

// Reverse of FIGMA_COLLECTIONS for the export direction (Figma -> tokens): a manifest-
// mapped collection regenerates its kebab-case staging file name instead of the raw
// `${collectionName}.${modeName}.json` (which would produce e.g. "Space.base.json").
export function fileNameForCollection(collectionName: string, modeName: string): string | null {
  for (const [fileName, ref] of Object.entries(FIGMA_COLLECTIONS)) {
    if (ref.collectionName === collectionName && ref.modeName === modeName) return fileName
  }
  return null
}

// Figma variables are unit-less; rem dimensions sync as px at the 16px default root.
// Single source of truth for BOTH sync directions (token_import multiplies, token_export
// divides) so the conversion can never drift asymmetric.
export const FIGMA_REM_PX = 16

// Export-direction value reconstruction. Figma variables are unit-less FLOATs / joined
// STRINGs; these rules say how each collection's families map back to their DTCG shapes
// (the same conventions token_import uses on the way in: rem syncs as px at FIGMA_REM_PX,
// fontFamily stacks join with ", "). Keyed by collection name, then token family (first
// path segment), with "*" as the family wildcard.
export type FigmaValueRule =
  | { $type: 'dimension'; unit: 'px' | 'rem' }
  | { $type: 'fontFamily' }
  | { $type: 'fontWeight' }
  | { $type: 'number' }

export const FIGMA_EXPORT_RULES: Record<string, Record<string, FigmaValueRule>> = {
  Space: { '*': { $type: 'dimension', unit: 'rem' } },
  Radius: { '*': { $type: 'dimension', unit: 'px' } },
  Breakpoints: { '*': { $type: 'dimension', unit: 'px' } },
  Border: { '*': { $type: 'dimension', unit: 'rem' } },
  Typography: {
    'font-size': { $type: 'dimension', unit: 'rem' },
    'font-family': { $type: 'fontFamily' },
    'font-weight': { $type: 'fontWeight' },
    'line-height': { $type: 'number' },
    'letter-spacing': { $type: 'number' },
  },
}
// Figma variable scopes per collection family (review item M4): scopes filter which
// Figma pickers offer a variable (a radius token shouldn't appear in the letter-spacing
// picker). Keyed by collection name, then token family, "*" wildcard. Colour collections
// stay ALL_SCOPES deliberately — restricting colours to fill/stroke/text roles is a
// separate design decision. Scopes only filter pickers: existing applications of a
// variable keep working, and this is fully reversible by pushing ALL_SCOPES back.
// Figma is the carrier after the first push (export round-trips scopes); this map is the
// authoring source for NEW tokens' staging entries.

export const FIGMA_SCOPES: Record<string, Record<string, VariableScope[]>> = {
  // Order and names match what Figma persists (it canonicalises both): WIDTH_HEIGHT
  // before GAP, and the weight/style dropdown is governed by FONT_STYLE — pushing
  // FONT_WEIGHT gets normalised to FONT_STYLE and would re-diff forever.
  Space: { '*': ['WIDTH_HEIGHT', 'GAP'] },
  Radius: { '*': ['CORNER_RADIUS'] },
  Breakpoints: { '*': ['WIDTH_HEIGHT'] },
  Border: { '*': ['STROKE_FLOAT'] },
  Typography: {
    'font-family': ['FONT_FAMILY'],
    'font-size': ['FONT_SIZE'],
    'font-weight': ['FONT_STYLE'],
    'line-height': ['LINE_HEIGHT'],
    'letter-spacing': ['LETTER_SPACING'],
  },
}

export function scopesFor(collectionName: string, family: string): VariableScope[] | null {
  const rules = FIGMA_SCOPES[collectionName]
  if (!rules) return null
  return rules[family] ?? rules['*'] ?? null
}

export function exportRuleFor(collectionName: string, family: string): FigmaValueRule | null {
  const rules = FIGMA_EXPORT_RULES[collectionName]
  if (!rules) return null
  return rules[family] ?? rules['*'] ?? null
}
