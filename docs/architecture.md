# Architecture & token flow

This document explains how a token value travels from its canonical source (and from
Figma) to a published artifact, and how the layers and categories relate.

Historical design records: [transformer-migration.md](transformer-migration.md) (the
Style Dictionary cut-over, Phases 0–3) and
[phase-4-non-colour-tokens.md](phase-4-non-colour-tokens.md) (the non-colour categories,
Phases 4a–4e). Both are **completed milestones**, kept as decision records.

## Token layers & categories

Three layers (DTCG groups) × seven categories:

| Layer | Location | Holds | References |
| --- | --- | --- | --- |
| **Global / primitive** | `tokens/global/<category>/` | Raw scales: colour palette (`nsw-blue.500`), `space.0…16`, `radius`, `breakpoint`, `border-width`, `font-*`/`line-height`/`letter-spacing`, `shadow`/`shadow-color`/`box-shadow` | literal values; shadow `spread` cross-aliases `{border-width.*}` |
| **Semantic** | `tokens/semantic/<category>/` | Colour intent roles (`success`, `warning`, `danger`, `info`) and typography styles (`heading-1`…`code`) | colour: **deliberately literal** (independent ramps — see [tokens/README.md](../tokens/README.md)); typography composites: **alias-only** into global primitives |
| **Theme** | `tokens/themes/color/<theme>/` | Brand mappings (`primary`, `accent`, `grey`) | alias primitives (`{nsw-blue.50}`); `data-visualisation` is a concrete palette. Colour-only today by design |

Categories: `color` (the only category with per-colour-space derived views),
`space`, `radius`, `breakpoints`, `typography`, `border`, `shadow`. For every
non-colour category, `canonical.json` is the **only** file — there is exactly one
representation of `1rem`. Colour's `hex/rgb/hsl/oklch.json` views are **generated** from
`canonical.json` (hsl/oklch rounded to 6 dp for cross-platform determinism).

## Source of truth & sync

```
tokens/**/canonical.json                ← hand-edited SOURCE OF TRUTH
   │
   │  npm run sync-tokens-to-figma      (push; --dry-run available)
   ▼
Figma variable collections              ← Primitives/Themes (colour) + Space, Radius,
   │                                      Breakpoints, Typography, Border
   │  npm run sync-figma-to-tokens      (export; regenerates the staging files)
   ▼
tokens/*.base.json, tokens/*.light.json ← Figma sync STAGING (byte-stable round trip)
```

- The round trip is verified **idempotent in both directions**: a second push reports
  "already up to date", and a fresh export is byte-identical to the committed staging
  files. Float32 echo from Figma is neutralised at three layers (numeric comparison via
  `Math.fround`, 8-bit colour-component snapping, 7 dp numeric snapping on export).
- Composites (semantic typography, shadows) do **not** sync — Figma variables have no
  composite type; they are Figma *styles*. Mappings live in
  `scripts/figma-collections.ts` (file names, value-reconstruction rules, rem↔px root).
- Credentials come from the environment (`FIGMA_TOKEN`, `FILE_KEY`) / GitHub Secrets —
  never commit `.env`. See the runbook in
  [phase-4-non-colour-tokens.md](phase-4-non-colour-tokens.md#4e-runbook-executed-repeatable).

## Build

`npm run build` runs four stages (then a copy):

1. **`scripts/build-token-views.mjs`** — derives the per-colour-space views
   (`hex/rgb/hsl/oklch.json`) from each colour `canonical.json`. Colour-only.
2. **`scripts/generate-styles.mjs`** — runs **Style Dictionary v4**
   (`build/style-dictionary.config.mjs` + `build/formats.mjs`) to generate every
   per-format output into `src/` (css/scss/less/js/ts/json/tailwind/figma), then runs
   Prettier over the generated js/ts so outputs are lint-conformant by construction.
   `src/*` style trees are **generated** — only `src/brand/` is static.
3. **`scripts/build-index.mjs`** — generates `src/index.ts`, the root bundle aggregator
   (`tokens.<format>.<layer|category>…`).
4. **tsup** bundles `src/index.ts` → `dist/index.js` (ESM), `dist/index.cjs` (CJS), and
   `.d.ts` types; its `onSuccess` hook runs **`scripts/copy-styles.mjs`**, which copies
   the generated format trees, `src/brand/`, and the `tokens/` tree into `dist/` (and
   rehydrates the masterbrand hsl/oklch/rgb view aliases to concrete values for the
   published `dist/tokens` copies).

Determinism is enforced: `check:dist` fails CI if a rebuild produces any diff against the
committed `src/` + `dist/`.

## Output formats

| Export subpath | Format | Notes |
| --- | --- | --- |
| `@nswds/tokens` | JS/TS API | `tokens.colors.<layer>.<space>` + `tokens.<format>.<category>.<layer>` |
| `@nswds/tokens/css/*` | CSS custom properties | `--nsw-blue-500`, `--space-4`, `--typography-body` (font shorthand) |
| `@nswds/tokens/scss/*` / `less/*` | Sass / Less variables | `$nsw-blue-500` / `@nsw-blue-500` |
| `@nswds/tokens/js/*`, `ts/*` | JS/TS modules | importable objects; numerics are numbers |
| `@nswds/tokens/json/*` | flat JSON | resolved values |
| `@nswds/tokens/tokens/*` | raw DTCG JSON | DTCG 2025.10 (`canonical.json` = source) |
| `@nswds/tokens/tailwind/*` | Tailwind v4 `@theme` | colours map `--color-*`→`var(--nsw-*)`; other categories carry direct values (`--spacing-*`, `--text-*`, `--shadow-*`, …) |
| `@nswds/tokens/figma/*` | DTCG + Figma `$extensions` | colour round-trip files |

## Validation & gates

- `validate:tokens` — DTCG shape per `$type` (colour, dimension, fontFamily, fontWeight,
  number, typography composites, shadow composites), alias resolution with cycle
  detection (including cross-category and composite sub-aliases), duplicate detection.
- `check:dist` — committed `src/` + `dist/` match a fresh build byte-for-byte.
- `smoke:package-surface` — packs the tarball and asserts each documented export
  resolves; `check:version-sync` keeps package.json / lockfile / git tag aligned.
- `typecheck` — `tsc --noEmit` over `scripts/` and `tests/`.
- `check:release-rules` — asserts breaking-change commits map to a major bump.
- Snapshot suite — every generated output file under `dist/` is snapshotted
  (auto-enumerated, self-extending).
