# Architecture & token flow

This document explains how a colour value travels from Figma to a published artifact, and
how the token layers relate.

## Token layers

The system is organised in three layers (DTCG groups):

| Layer | Location | Holds | References |
| --- | --- | --- | --- |
| **Global / primitive** | `tokens/global/color/` | The raw NSW palette (`nsw-blue.500`, …) | literal colour values |
| **Semantic** | `tokens/semantic/color/` | Intent roles (`success`, `warning`, `danger`, `info`) | _should_ alias primitives* |
| **Theme** | `tokens/themes/color/<theme>/` | Brand mappings (`primary`, `accent`, `grey`) | alias primitives, e.g. `{nsw-blue.50}` |

\* Today the semantic layer stores literal values rather than aliases — see the repository
review (item M2). Converting it to alias-only is tracked as future work.

Each colour is currently authored in four parallel colour-space files — `hex.json`,
`hsl.json`, `rgb.json`, `oklch.json` — under every layer. (Consolidating these into a
single DTCG source with a `hex` fallback is tracked as future work; see review items
H1/C1.)

## Source of truth & sync

```
Figma variables
   │  npm run sync-figma-to-tokens   (scripts/sync_figma_to_tokens.ts)
   ▼
tokens/**  +  src/**            ← canonical DTCG JSON and per-format source
   │  npm run build
   ▼
dist/**                        ← published artifacts (committed, CI-verified)
```

- **`sync-figma-to-tokens`** pulls Figma variables and regenerates the token JSON.
- **`sync-tokens-to-figma`** pushes local tokens back into the Figma file.
  Both require Figma credentials supplied via environment / GitHub Secrets (never commit
  `.env`).

## Build

`npm run build` runs two stages:

1. **tsup** bundles `src/index.ts` into `dist/index.js` (ESM), `dist/index.cjs` (CJS), and
   `.d.ts` types.
2. **`scripts/copy-styles.mjs`** (the tsup `onSuccess` hook) copies the per-format sources
   (`src/css`, `src/scss`, `src/less`, `src/js`, `src/ts`, `src/json`, `src/tailwind`,
   `src/figma`, `src/brand`) and the `tokens/` tree into `dist/`, and rehydrates theme
   colour aliases to concrete values.

## Output formats

| Export subpath | Format | Notes |
| --- | --- | --- |
| `@nswds/tokens` | JS/TS API | `tokens.colors.<layer>.<space>...` |
| `@nswds/tokens/css/*` | CSS custom properties | `--nsw-blue-500: …` |
| `@nswds/tokens/scss/*` | Sass variables | `$nsw-blue-500` |
| `@nswds/tokens/less/*` | Less variables | `@nsw-blue-500` |
| `@nswds/tokens/js/*`, `/ts/*` | JS/TS modules | importable objects |
| `@nswds/tokens/json/*` | flat JSON | resolved values |
| `@nswds/tokens/tokens/*` | raw DTCG JSON | `$type` / `$value` (Tailwind v4 `@theme`) |
| `@nswds/tokens/tailwind/*` | Tailwind `@theme` | maps `--color-*` → `var(--nsw-*)` |
| `@nswds/tokens/figma/*` | DTCG + Figma `$extensions` | round-trips to Figma |

## Validation

- `check:dist` — ensures committed `dist/` matches a fresh build.
- `smoke:package-surface` — installs the packed tarball and asserts each public export
  resolves to expected values.
- `check:version-sync` — keeps `package.json`, `package-lock.json`, and the git tag aligned.
