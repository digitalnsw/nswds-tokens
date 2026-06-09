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

## Parity harness (Phases 0–1c — retired at cut-over)

The `scripts/sd-parity.mjs` harness built the SD outputs to a scratch dir and diffed each
against the committed `dist/`, proving the transformer reproduced the published bytes before
any cut-over. At Phase 2 it was **removed**: once `dist/` is generated from SD, the harness is
redundant with `check:dist` (which rebuilds and verifies `src/` + `dist/`). The byte-level
findings it surfaced are recorded below.

**Pre-cut-over status (Phase 1c):** **every output format × every colour space**
(hex/hsl/rgb/oklch),
all three layers — **79/96 byte-identical**, 13 normalisations, 4 corrections (below). Each
colour space is a separate SD instance (the spaces share token paths and would collide in
one source). hsl/rgb/oklch read the object-form source and format it via a `nsw/color-string`
transform; Figma keeps the object (channels inline).

### Normalisations (intentional, allow-listed in the harness)

Cosmetic hand-authoring inconsistencies the transformer standardises — **no token value or
structure differs**. The same patterns recur across colour spaces:

- `js/colors/semantic/*` — the only JS files with stray blank lines between families
  (global/masterbrand JS and the TS files have none) → removed.
- `json/colors/global/*`, `figma/color/global/*` — the only json/figma files authored
  without a trailing newline (semantic + masterbrand have one) → standardised.
- `json/colors/themes/masterbrand/oklch.json` — JSON is the only format that renders the
  achromatic oklch hue as `none`; css/js/ts/tailwind all use `0`, emitted consistently.
- (Figma `channels` arrays: dist is inconsistent — global expanded, semantic/masterbrand
  inline. The transformer emits inline everywhere, so only the 3 global figma files normalise.)

### Corrections (real bugs the transformer fixes — value-affecting)

- `tailwind/colors/themes/masterbrand/*` (all colour spaces) — the hand-authored files map
  `--color-primary-850` to `var(--nsw-blue-800)`, but the source aliases `{nsw-blue.850}`
  and every other format resolves `primary-850` to `nsw-blue.850` (`#001a4d`). The published
  Tailwind files are wrong (`#002664`); the transformer emits the correct `var(--nsw-blue-850)`.
  Tracked separately in the harness (`EXPECTED_CORRECTED`).

## Phases

- **Phase 0 — scaffold + parity harness.** ✅ Done. SD devDep; `build/style-dictionary.config.mjs`;
  `scripts/sd-parity.mjs`.
- **Phase 1a — custom formats at hex parity.** ✅ js/ts/json/figma custom formats +
  css/scss/less, all layers, hex. 18/21 byte-identical + 3 normalisations.
- **Phase 1b — Tailwind (this PR).** ✅ Alias-aware Tailwind format (`@theme inline {` for
  semantic; masterbrand maps `--color-primary-50` → `var(--nsw-blue-50)` and omits `:root`).
  All hex formats now generated. 20/24 byte-identical, 3 normalisations, **1 correction**
  (see below).
- **Phase 1c — all colour spaces (this PR).** ✅ hsl/rgb/oklch generated for every format,
  read from the object-form source (byte-parity). 79/96 byte-identical, 13 normalisations,
  4 corrections. **All ~96 in-scope outputs are now transformer-generated.** (Re-deriving
  hsl/rgb/oklch from hex via culori per decision #2 is deferred to Phase 3, where H1 collapses
  the source trees — the value drift belongs with that breaking change, not here.)
- **Phase 2 — cut over (this PR).** ✅ `npm run build` now runs `scripts/generate-styles.mjs`
  (Style Dictionary → `src/`) before `tsup` + `copy-styles`. `src/*` are now **generated** from
  `tokens/`, not hand-authored — the root bundle (`src/index.ts` imports them) and `dist/` both
  pick them up. `src/index.ts` and the orphan Tailwind themes / `prism.css` / brand assets are
  left untouched (no token source → SD doesn't regenerate them; pending M5). The 4 Tailwind
  corrections and 13 normalisations now ship in `src/`+`dist/`. `sd-parity` retired; `check:dist`
  (extended to verify `src/` + `dist/`) is the reproducibility guard.
- **Phase 3 — breaking (major).** Scope locked to **C1 + H1 + M5**; **M2 dropped** (the semantic
  palettes are independent of the global ramps — 0/19 steps match — so there is nothing to
  alias to). Derived hsl/rgb/oklch kept at **full precision** (decision). Staged:
  - **Phase 3a-1 — derivation foundation (this PR).** ✅ `build/color-derive.mjs` (culori) +
    `scripts/verify-derivation.mjs` (`npm run verify:derivation`). Proves that deriving every
    space from the **hex canonical** reproduces **hex + rgb byte-identically (418/418)** and
    quantifies the **hsl + oklch full-precision drift** (every token; e.g. grey hue 223.81 → 0,
    oklch 0.9850175 → 0.9851036). Build unchanged — this is the de-risked core + guard.
  - **Phase 3a-2 — the cut.** Build the single DTCG-srgb canonical (C1 shape) per layer; delete
    the 4 per-space source files (H1); rewrite the SD config/transforms to derive all spaces +
    DTCG figma from it; regenerate `src/`+`dist/` (hsl/oklch values change, hex/rgb stay); update
    `src/index.ts`'s per-space token imports to the generated views.
  - **Phase 3b — M5.** Reverse-engineer DTCG source for the orphan Tailwind themes
    (`data-visualisation` (`ember` families), `fuchsia-orange`, `fuchsia-blue`).
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
