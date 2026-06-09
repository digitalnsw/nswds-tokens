# Transformer migration (Style Dictionary) — design & plan

## Why

Today the multi-format outputs (`css/`, `scss/`, `less/`, `js/`, `ts/`, `json/`,
`tailwind/`, `figma/`) are **hand-authored static files** under `src/`. `copy-styles.mjs`
only copies them into `dist/` and rehydrates the masterbrand aliases. Nothing generates
them from the canonical `tokens/**` DTCG source, so `tokens/` ↔ `src/` ↔ `dist/` can
silently drift, and every colour value is duplicated across ~9 places.

This migration makes `tokens/**` the single source and has **Style Dictionary 4**
generate every output deterministically.

## Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Transformer | **Style Dictionary 4** |
| 2 | hsl/rgb/oklch value drift | **Accept** culori re-derived values; **hex is canonical** and stays byte-identical |
| 3 | Orphan Tailwind themes (`data-visualisation`, `fuchsia-orange`) | **Create real source tokens** (preserve published paths) |
| 4 | Root `@nswds/tokens` JS API | **Keep exact shape** via a custom format |
| — | Versioning | C1 changes the raw DTCG shape → **major bump** when Phase 3 lands |

## Output parity matrix

| Output | Current shape | SD approach |
| --- | --- | --- |
| `css/` | `:root{ --nsw-grey-50: #fafafa; }` | built-in `css/variables` + `name/kebab` |
| `scss/` / `less/` | `$nsw-grey-50:` / `@nsw-grey-50:` | built-in `scss/variables`, `less/variables` |
| `js/` / `ts/` | `export const nswGrey = { 50: '#fafafa' }` | **custom format** (group by family) + `.d.ts` |
| `json/` | `{ "nsw-grey": { "nsw-grey-50": "#fafafa" } }` | **custom format** |
| `tailwind/` | `@theme{ --color-nsw-grey-50: var(--nsw-grey-50) }` | **custom format** (v4 `@theme`) |
| `figma/` | DTCG `{ "$type":"color","$value":"#fafafa" }` | **custom format** / source pass-through |
| root | `tokens.colors.<layer>.<space>...` | **custom format** building the nested object |

The 3 built-ins are free; the 4 custom formats + name transform are the bulk of Phase 1.

## Parity harness (Phase 0 — done)

`npm run sd:parity` builds the SD outputs to a scratch dir (`build/.sd-out/`, gitignored)
and diffs each against the committed `dist/` file, exiting non-zero on any byte mismatch.

**Status (Phase 1a):** all output formats — `css`/`scss`/`less` (built-ins) plus
`js`/`ts`/`json`/`figma` (custom formats in `build/formats.mjs`) — for global, semantic,
and masterbrand at **hex**: **18/21 byte-identical**, 3 documented normalisations (below).
Masterbrand aliases resolve to concrete hex. The transformer reproduces the current
published bytes before any cut-over.

### Normalisations (intentional, allow-listed in the harness)

The hand-authored files have a few cosmetic inconsistencies the transformer standardises;
these are the only non-byte-identical files, and **no token value or structure differs**:

- `js/colors/semantic/hex.js` — the only JS file authored with stray blank lines between
  families (global/masterbrand JS and even semantic TS have none) → removed.
- `json/colors/global/hex.json`, `figma/color/global/hex.json` — the only json/figma files
  authored without a trailing newline (semantic + masterbrand have one) → standardised to
  a trailing newline.

### Corrections (a real bug the transformer fixes — value-affecting)

- `tailwind/colors/themes/masterbrand/hex.css` — the hand-authored file maps
  `--color-primary-850` to `var(--nsw-blue-800)`, but the source aliases `{nsw-blue.850}`
  and every other format (css/js/json/figma) resolves `primary-850` to `nsw-blue.850`
  (`#001a4d`). The published Tailwind file is wrong (`#002664`); the transformer emits the
  correct `var(--nsw-blue-850)`. Tracked separately from cosmetic normalisations in the
  harness (`EXPECTED_CORRECTED`).

## Phases

- **Phase 0 — scaffold + parity harness.** ✅ Done. SD devDep; `build/style-dictionary.config.mjs`;
  `scripts/sd-parity.mjs`.
- **Phase 1a — custom formats at hex parity.** ✅ js/ts/json/figma custom formats +
  css/scss/less, all layers, hex. 18/21 byte-identical + 3 normalisations.
- **Phase 1b — Tailwind (this PR).** ✅ Alias-aware Tailwind format (`@theme inline {` for
  semantic; masterbrand maps `--color-primary-50` → `var(--nsw-blue-50)` and omits `:root`).
  All hex formats now generated. 20/24 byte-identical, 3 normalisations, **1 correction**
  (see below).
- **Phase 1c — colour transforms.** The hsl/rgb/oklch outputs re-derived from hex via culori
  (decision #2) — differences are a documented one-time delta.
- **Phase 2 — cut over.** Replace `copy-styles.mjs`, delete hand-authored `src/*` format
  dirs, regenerate `dist/` from SD. Lock with snapshot tests.
- **Phase 3 — breaking (major).** C1 (DTCG colour shape: `components`/`srgb`/0–1/`"none"`/
  `hex` fallback), H1 (collapse the 4 colour-space source trees to one), M2
  (semantic → alias), M5 (real `data-visualisation`/`fuchsia-orange` source).
- **Phase 4 — non-colour tokens** (spacing, typography, radius, shadow…) once the pipeline
  is proven.

## Scope notes / risks

- Phases 0–1a wire up **only `hex.json`** sources. The hsl/rgb/oklch object-form tokens use
  the non-standard `channels`/`rgb` shape (C1) and are handled in Phase 1b/3.
- Tailwind is deferred to Phase 1b: its output is layer-dependent (semantic uses
  `@theme inline {`) and alias-aware (masterbrand maps `--color-primary-50` to
  `var(--nsw-blue-50)`, the alias target), so it needs dedicated handling.
- hsl/rgb/oklch outputs will change in the last decimals once re-derived from hex — locked
  behind snapshot review.
- C1 is breaking for raw-DTCG (`tokens/`, `figma/`) consumers; CSS/JS consumers unaffected.
