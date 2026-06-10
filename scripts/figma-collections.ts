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
}
