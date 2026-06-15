# @nswds/tokens

[![Release](https://github.com/digitalnsw/nswds-tokens/actions/workflows/release.yml/badge.svg)](https://github.com/digitalnsw/nswds-tokens/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/%40nswds%2Ftokens)](https://www.npmjs.com/package/@nswds/tokens)

Design tokens for the NSW Design System — colour, spacing, typography, radius,
breakpoints, borders, shadows, motion, and z-index — plus related brand assets.

The published package ships:

- the root JavaScript and CommonJS entrypoints at `@nswds/tokens`
- token files for every category under `css/`, `scss/`, `less/`, `js/`, `json/`,
  `tailwind/`, `tokens/`, and `ts/` — plus colour round-trip files under `figma/`
  (colour-only; the other categories reach Figma via the variable sync, not files)
- Prism styles at `@nswds/tokens/prism.css`
- brand assets under `@nswds/tokens/brand/*`

---

## Features

- Global, semantic, and themed NSW **colour** tokens (hex, rgb, hsl, and oklch outputs)
- **Spacing** (4px-grid rem scale), **radius**, **breakpoints**, **border widths**,
  **shadows** (elevation ramp + inset rings), and **typography** (font stacks, sizes,
  weights, line-heights, tracking) — with semantic typography styles (`heading-1`…`code`)
- **Motion** (durations, cubic-bezier easings, and intent-paired transition composites)
  with a built-in reduced-motion override, and a **z-index** scale
- DTCG 2025.10-compliant raw token JSON under `@nswds/tokens/tokens/*`
- Tailwind CSS v4 `@theme` files for every category
- Root JS API for consuming token collections directly
- Prism stylesheet and brand asset files alongside the token exports

---

## Installation

Install via your package manager:

```bash
npm install @nswds/tokens
# or
yarn add @nswds/tokens
# or
pnpm add @nswds/tokens
```

> **Tip:** prefer the subpath imports shown below over the root `@nswds/tokens` import in
> browser apps. The root bundle embeds every generated stylesheet as text (~2 MB) — great
> for tooling, wasteful in an app bundle. Subpath imports load only what you use.

---

## Using the tokens

Use the package export paths directly. Do not import from `dist/`.

### 1. JavaScript / TypeScript

```ts
import { tokens } from '@nswds/tokens'

console.log(tokens.colors.global.hex['nsw-blue'][500].$value)
console.log(tokens.js.space.global) // { space: { 4: '1rem', ... } }
```

### 2. CSS custom properties

```css
@import '@nswds/tokens/css/colors/global/hex.css';
@import '@nswds/tokens/css/colors/themes/masterbrand/hex.css';

.my-button {
  background-color: var(--nsw-blue-500);
}
```

### 3. Spacing, radius, breakpoints, borders, and shadows

Each category publishes per-format files named by layer:

```css
@import '@nswds/tokens/css/space/global.css'; /* --space-0 … --space-16        */
@import '@nswds/tokens/css/radius/global.css'; /* --radius-none … --radius-pill */
@import '@nswds/tokens/css/breakpoints/global.css'; /* --breakpoint-xs … -xl          */
@import '@nswds/tokens/css/border/global.css'; /* --border-width-thin … -default */
@import '@nswds/tokens/css/shadow/global.css'; /* --shadow-sm … --box-shadow-*   */

.card {
  padding: var(--space-6);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
```

The same values are available as SCSS/LESS variables and JS/JSON modules, e.g.
`@nswds/tokens/js/radius/global.js` exports `radius = { none: '0px', sm: '4px', … }`.

Motion follows the NSW motion brief; the z-index scale is confirmed.

```css
@import '@nswds/tokens/css/motion/global.css'; /* --duration-*, --easing-*, --transition-* */
@import '@nswds/tokens/css/z-index/global.css'; /* --z-index-base … --z-index-tooltip      */

.drawer {
  /* transition composites pair a duration, curve, and delay by intent */
  transition: transform var(--transition-overlay);
  z-index: var(--z-index-modal);
}
```

`duration.*` are CSS times (`150ms`), `easing.*` are `cubic-bezier(…)` timing functions,
`transition.*` are ready-to-use `transition`-shorthand values
(`<duration> <timing-function> <delay>`), and `z-index.*` are plain integers.

**Reduced motion** is built into `css/motion/global.css`: a
`@media (prefers-reduced-motion: reduce)` block collapses every duration to `0.01ms`
(kept non-zero so `transitionend`/`animationend` still fire), leaving the curves and
opacity changes intact. Tailwind/raw consumers who don't load that file should add the
same override.

Motion usage principles:

- Duration scales with size and distance — a small chip and a full-screen sheet should not
  share a duration. Bigger, or further to travel, means longer.
- Move on one axis at a time — separate horizontal and vertical movement rather than
  animating diagonally.
- Keep crossfades short (~100ms, the `instant` step) to avoid muddy overlapping frames.
- Never rely on motion alone to communicate a state change; reduced motion is always
  honoured.

### 4. Typography

```css
@import '@nswds/tokens/css/typography/global.css'; /* primitives                     */
@import '@nswds/tokens/css/typography/semantic.css'; /* heading-1…4, body, lead, code… */

h1 {
  font: var(--typography-heading-1);
  letter-spacing: var(--typography-heading-1-letter-spacing);
}
```

> **Letter-spacing is not part of the CSS `font` shorthand** — that's a CSS limitation,
> not a token gap. Each semantic style also publishes per-property custom properties
> (`--typography-body-font-size`, `--typography-body-line-height`, …) so nothing about
> the composite is lost.

> ⚠️ **Fonts are not bundled.** The typography tokens reference **Public Sans** and
> **JetBrains Mono**, but this package does not ship the font files. Load them yourself
> (webfont service or `@font-face`) or text falls back to the system stacks built into
> the tokens.

### 5. Prism CSS

```css
@import '@nswds/tokens/prism.css';
```

Or via the full exported subpath:

```css
@import '@nswds/tokens/css/prism/prism.css';
```

### 6. Sass / SCSS

```scss
@use '@nswds/tokens/scss/colors/global/hex.scss' as *;

.page-heading {
  color: $nsw-blue-500;
}
```

### 7. Raw JSON and design-token (DTCG) files

```ts
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const globalHex = require('@nswds/tokens/json/colors/global/hex.json')
const rawCanonical = require('@nswds/tokens/tokens/global/color/canonical.json')
const spaceTokens = require('@nswds/tokens/tokens/global/space/canonical.json')

console.log(globalHex['nsw-blue'][500].$value)
console.log(spaceTokens.space['4'].$value) // { value: 1, unit: 'rem' }
```

The files under `@nswds/tokens/tokens/*` follow the
[DTCG 2025.10](https://www.designtokens.org/tr/2025.10/) format — `canonical.json` files
are the source of truth; `hex/rgb/hsl/oklch.json` are derived colour views.

### 8. Tailwind CSS

> **Requires Tailwind CSS v4.0 or later.** The Tailwind outputs use the CSS-first
> [`@theme`](https://tailwindcss.com/docs/theme) at-rule, which does not exist in v3.

**One-import preset** — covers global + semantic colours (hex) and every non-colour
category in a single file:

```css
@import '@nswds/tokens/tailwind/preset.css';
/* themes are opt-in (they define the same family names as one another): */
@import '@nswds/tokens/tailwind/colors/themes/masterbrand/hex.css';
```

Or import per category. Every category publishes a Tailwind `@theme` file. Colour files
map onto `--color-*` and reference the CSS variables file (import both); non-colour
categories carry direct values (one import each):

| Import                                       | Namespace                                                                | Utilities unlocked                                            |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `tailwind/colors/global/hex.css` (+ css/...) | `--color-nsw-*`                                                          | `bg-nsw-blue-500`, `text-nsw-grey-50`, …                      |
| `tailwind/space/global.css`                  | `--spacing-*`                                                            | `p-4`, `gap-6`, `m-12`, …                                     |
| `tailwind/radius/global.css`                 | `--radius-*`                                                             | `rounded-md`, `rounded-pill`, …                               |
| `tailwind/breakpoints/global.css`            | `--breakpoint-*`                                                         | `md:flex`, `xl:grid`, …                                       |
| `tailwind/typography/global.css`             | `--font-*`, `--text-*`, `--font-weight-*`, `--leading-*`, `--tracking-*` | `font-sans`, `text-16`, `leading-base`, …                     |
| `tailwind/shadow/global.css`                 | `--shadow-*`, `--inset-shadow-*`                                         | `shadow-md`, `inset-shadow-thin`, …                           |
| `tailwind/border/global.css`                 | `--border-width-*` (plain vars; no native namespace)                     | arbitrary values: `border-[length:var(--border-width-thick)]` |
| `tailwind/motion/global.css`                 | `--ease-*` (native); `--duration-*`, `--transition-*` (plain vars)       | `ease-standard`; `duration-[var(--duration-fast)]`            |
| `tailwind/z-index/global.css`                | `--z-index-*` (plain vars; no native namespace)                          | arbitrary values: `z-[var(--z-index-modal)]`                  |

```css
@import 'tailwindcss';

/* Colours need both files (the @theme mapping references the CSS variables) */
@import '@nswds/tokens/css/colors/global/hex.css';
@import '@nswds/tokens/tailwind/colors/global/hex.css';

/* Non-colour categories are single imports */
@import '@nswds/tokens/tailwind/space/global.css';
@import '@nswds/tokens/tailwind/typography/global.css';
```

```html
<button class="bg-nsw-blue-500 text-nsw-grey-50 rounded-md p-4 font-sans">Save</button>
```

---

## Published Surface

The package exports these public subpath families:

- `@nswds/tokens`
- `@nswds/tokens/brand/*`
- `@nswds/tokens/css/*`
- `@nswds/tokens/figma/*`
- `@nswds/tokens/js/*`
- `@nswds/tokens/json/*`
- `@nswds/tokens/less/*`
- `@nswds/tokens/scss/*`
- `@nswds/tokens/tailwind/*`
- `@nswds/tokens/tokens/*`
- `@nswds/tokens/ts/*`
- `@nswds/tokens/prism.css`

> `@nswds/tokens/ts/*` ships raw TypeScript source. It type-checks in TypeScript projects
> but only runs through a bundler that transpiles `node_modules` — for plain Node or
> typical apps, prefer `js/*` or the root import.

---

## Theming

Theme-specific colour files are published under the `.../colors/themes/` paths, including the masterbrand outputs used by the root package exports. Tailwind theme files are also available under `@nswds/tokens/tailwind/colors/themes/*`.

---

## Local development

```bash
git clone https://github.com/digitalnsw/nswds-tokens.git
cd nswds-tokens
nvm use
npm install
```

Use Node.js `^22.14.0 || >=24.10.0` for local development — Node 22 LTS recommended; `.nvmrc` pins it. The range mirrors `semantic-release@25` (which publishes this package): Node 23.x and 24.0–24.9 are not supported by its tooling, and Node 20 reached end-of-life in April 2026.

Build and verify:

```bash
npm run build
npm run validate:tokens
npm run typecheck
npm run test:tokens
npm run lint
npm run smoke:package-surface
```

See [`docs/architecture.md`](./docs/architecture.md) for how tokens flow from source to
published outputs, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for conventions.

---

## Versioning & releases

Semantic versioning:

- **Major** for breaking changes (including raw token JSON shape changes — see
  [`MIGRATION.md`](./MIGRATION.md)).
- **Minor** for additive changes (new tokens, categories, or outputs).
- **Patch** for fixes.

---

## Contributing

1. Create a feature branch
2. Make changes
3. Update tests
4. Run build
5. Open a PR

---

## License

Mozilla Public License 2.0. See [`LICENSE`](./LICENSE).
