# Phase 4 — Non-colour tokens (plan)

Status: **planned** · Decisions locked 2026-06-10 · Predecessors: Phases 0–3 (colour pipeline,
see [transformer-migration.md](transformer-migration.md))

Adds spacing, typography, radius, shadow (and breakpoints) as first-class DTCG 2025.10 tokens
with the same guarantees colours have: single source of truth, `check:dist` determinism,
validation, snapshots, typecheck.

## Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Value provenance | **Maintainer drafts, designers review in the PR.** Each milestone PR carries a proposed scale; design amends values before merge. Post-merge value edits are one-line canonical changes. |
| D2 | Scale naming | **Numeric primitives** (`space.0…12` on a 4px grid; matches the colour ramps' numeric-step convention). T-shirt names arrive later as semantic aliases if wanted. |
| D3 | Units | **`rem` for space and font-size** (respects user zoom), **`px` for radius and breakpoints** (visual constants). |
| D4 | Line-height | **Unitless `number`** (e.g. `1.5`) — inherits proportionally; accepted by DTCG typography composites. |
| D5 | Figma sync | **Plan 4e now, sync soon:** staging files + `figma-collections.ts` entries are wired during 4a/4b; the actual `sync-tokens-to-figma` push (which creates the Figma collections) is gated only on the rotated Figma token. Composites (typography/shadow) never sync — they are Figma styles, not variables. |
| — | 4a scope | space + radius + **breakpoints** (clears the last empty scaffold dir). |
| — | Font stack | **Public Sans + system fallbacks** (`["Public Sans", "system-ui", "-apple-system", "sans-serif"]`) plus a mono stack. |

## Architecture

Non-colour categories are *simpler* than colour: there is exactly one representation of
`1rem`, so there are **no per-space views** — `canonical.json` is the only file per
category, all hand-edited source. `build-token-views.mjs` stays colour-only.

```
tokens/
  global/
    space/canonical.json         $type: dimension (rem)
    radius/canonical.json        $type: dimension (px)
    breakpoints/canonical.json   $type: dimension (px)
    typography/canonical.json    fontFamily / dimension / fontWeight / number
    shadow/canonical.json        $type: shadow (composite; colour via cross-category alias)
  semantic/
    typography/canonical.json    $type: typography composites — alias-only
```

Theme layer: out of scope (nothing varies by theme today); the structure permits
`themes/<theme>/space/` later without change.

> Unlike the colour layers, semantic typography **should** alias global primitives. The
> raw-values argument documented in [tokens/README.md](../tokens/README.md) was specific to
> the colour palettes' independent ramps.

## DTCG types

| Category | `$type` | Notes |
| --- | --- | --- |
| space / radius / breakpoints / font-size (lives in `typography/canonical.json`) | `dimension` | `{value, unit}`, unit ∈ `px` or `rem` per D3 |
| font family | `fontFamily` | array form for fallback stacks |
| font weight | `fontWeight` | number 1–1000 |
| line height / letter-spacing multiplier | `number` | unitless per D4 |
| typography (semantic) | `typography` | `{fontFamily, fontSize, fontWeight, letterSpacing, lineHeight}` — all `{alias}` references |
| shadow | `shadow` | object or array (layered); `color` field is the first **cross-category alias** (→ colour tokens); expect 2–3 dedicated translucent `shadow-color` primitives |

## Draft value proposal (DESIGN REVIEW REQUIRED — D1)

Carried in each milestone PR for amendment; shown here so design can preview direction.

- **space** (4px grid, rem): `0:0 · 1:0.25 · 2:0.5 · 3:0.75 · 4:1 · 5:1.25 · 6:1.5 · 8:2 · 10:2.5 · 12:3`
  — steps 7/9/11 are deliberately omitted (sparse scale, Tailwind-style); design can add
  intermediates in the 4a review if needed.
- **radius** (px): `none:0 · sm:4 · md:8 · lg:16 · pill:9999`
- **breakpoints** (px): `xs:480 · sm:768 · md:992 · lg:1200 · xl:1600`
- **font-size** (rem) and **weights/line-heights**: proposed in the 4b PR.

## Pipeline deltas (all additive; zero colour bytes change)

1. **`build/style-dictionary.config.mjs`** — second config family: one config per category
   (no colour-space dimension). Sources `tokens/{global,semantic}/<cat>/canonical.json`
   (+ global colour for shadow alias resolution). New value transforms: `dimension` →
   `"0.25rem"`; `shadow` → `box-shadow` string; `typography` → per-property custom props
   **and** shorthand (composites flattened only to a shorthand are lossy — emit both).
2. **Outputs** — `src|dist/{css,scss,less,js,ts,json}/{space,radius,breakpoints,typography,shadow}/{global,semantic}.*`.
   Wildcard `exports` (`./css/*` …) already cover these — **no package.json change**.
3. **`scripts/build-index.mjs`** — generalise `ENTITIES` to (category × layer):
   `tokens.{css,js,…}.{colors|space|radius|…}…`. Colour paths unchanged (non-breaking).
4. **Tailwind v4** — `nswTailwind` gains a category→namespace map: space→`--spacing-*`,
   radius→`--radius-*`, breakpoints→`--breakpoint-*`, font→`--font-*`/`--text-*`,
   shadow→`--shadow-*`.
5. **`scripts/validate-tokens.mjs`** — generalise the walker beyond `<layer>/color/<space>.json`;
   add per-`$type` shape checks (dimension unit whitelist, fontWeight range, composite
   required fields, cross-category alias resolution). Colour checks untouched.
6. **Smoke test** — add one documented specifier per category. `check:dist` and the
   snapshot suite need no changes (the suite enumerates dist/ at run time).
7. **Figma (4e)** — dimensions sync as `FLOAT` + scopes (`GAP`, `CORNER_RADIUS`,
   `FONT_SIZE`, `WIDTH_HEIGHT`) via the existing `$extensions['com.figma']` round-trip;
   fontFamily as `STRING`, fontWeight as `FLOAT`. The sync push creates the collections in
   Figma (a `CREATE` action in the variables payload); staging files + manifest entries land with 4a/4b, push gated on the rotated token.

## Milestones / PR slicing

| PR | Scope | Notes |
| --- | --- | --- |
| **4a** | space + radius + breakpoints | Carries all structural cost: category configs, dimension transform, index/validator generalisation, staging + manifest entries. `feat(tokens)` minor. |
| **4b** | typography primitives | Families (Public Sans/mono), sizes, weights, line-heights, letter-spacing; Tailwind font mapping. |
| **4c** | semantic typography composites | Composite→CSS format (shorthand + per-property). |
| **4d** | shadow | Composite + cross-category alias validation + `shadow-color` primitives. |
| **4e** | Figma push | `sync-tokens-to-figma` once the token is rotated; verifies round-trip. |

## Risks

- **Composite lossiness** — mitigated by emitting per-property custom props alongside
  shorthands (pipeline delta 1).
- **Bundle growth** — tsup bundle (~1.9 MB) grows linearly with embedded CSS; subpath
  imports remain the recommended consumption path.
- **Validator generalisation touches colour checks** — 4a must assert zero diffs to
  existing colour outputs (snapshots make this mechanical).

## Per-milestone verification

`validate:tokens` 0 warnings · two consecutive drift-free builds · snapshot diff = new
files only · typecheck/lint · smoke specifiers resolve · Tailwind `@theme` consumes the
new namespaces in a scratch project · (4e) Figma round-trip is idempotent.
