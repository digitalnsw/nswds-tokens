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

**Status:** hex `css`/`scss`/`less` for global, semantic, and masterbrand are
**9/9 byte-identical** — including masterbrand aliases resolving to concrete hex. The
transformer reproduces the current published bytes, so the approach is proven before any
cut-over.

## Phases

- **Phase 0 — scaffold + parity harness (this PR).** Non-breaking. SD added as a devDep;
  config in `build/style-dictionary.config.mjs`; harness in `scripts/sd-parity.mjs`.
- **Phase 1 — custom formats** (js/ts/json/tailwind/figma/root) + colour transforms for
  hsl/rgb/oklch, to value-parity. hex stays byte-identical; hsl/rgb/oklch re-derived from
  hex via culori (decision #2) — differences are a documented one-time delta.
- **Phase 2 — cut over.** Replace `copy-styles.mjs`, delete hand-authored `src/*` format
  dirs, regenerate `dist/` from SD. Lock with snapshot tests.
- **Phase 3 — breaking (major).** C1 (DTCG colour shape: `components`/`srgb`/0–1/`"none"`/
  `hex` fallback), H1 (collapse the 4 colour-space source trees to one), M2
  (semantic → alias), M5 (real `data-visualisation`/`fuchsia-orange` source).
- **Phase 4 — non-colour tokens** (spacing, typography, radius, shadow…) once the pipeline
  is proven.

## Scope notes / risks

- Phase 0 wires up **only `hex.json`** sources. The hsl/rgb/oklch object-form tokens use
  the non-standard `channels`/`rgb` shape (C1) and are handled in Phase 1/3.
- hsl/rgb/oklch outputs will change in the last decimals once re-derived from hex — locked
  behind snapshot review.
- C1 is breaking for raw-DTCG (`tokens/`, `figma/`) consumers; CSS/JS consumers unaffected.
