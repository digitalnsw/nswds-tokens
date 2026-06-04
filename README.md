# @nswds/tokens

Colour tokens and related assets for the NSW Design System.

The published package currently ships:

- the root JavaScript and CommonJS entrypoints at `@nswds/tokens`
- raw colour token files under `css/`, `scss/`, `less/`, `js/`, `json/`, `tailwind/`, `tokens/`, `ts/`, and `figma/`
- Prism styles at `@nswds/tokens/prism.css`
- brand assets under `@nswds/tokens/brand/*`

---

## Features

- Global, semantic, and themed NSW colour tokens
- Published outputs for CSS, Sass/SCSS, Less, JavaScript, JSON, Tailwind, DTCG JSON, and Figma
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

If you are using this repo locally (e.g. via workspace):

```bash
npm install
# or yarn / pnpm install
```

---

## Using the tokens

Use the package export paths directly. Do not import from `dist/`.

### 1. JavaScript / TypeScript

```ts
import { tokens } from '@nswds/tokens'

console.log(tokens.colors.global.hex['nsw-blue'][500].$value)
```

### 2. CSS custom properties

```css
@import '@nswds/tokens/css/colors/global/hex.css';
@import '@nswds/tokens/css/colors/themes/masterbrand/hex.css';

.my-button {
  background-color: var(--nsw-blue-500);
}
```

### 3. Prism CSS

```css
@import '@nswds/tokens/prism.css';
```

Or via the full exported subpath:

```css
@import '@nswds/tokens/css/prism/prism.css';
```

### 4. Sass / SCSS

```scss
@use '@nswds/tokens/scss/colors/global/hex.scss' as *;

.page-heading {
  color: $nsw-blue-500;
}
```

### 5. Raw JSON and design-token files

```ts
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const globalHex = require('@nswds/tokens/json/colors/global/hex.json')
const rawHex = require('@nswds/tokens/tokens/global/color/hex.json')
const masterbrandFigma = require('@nswds/tokens/figma/color/themes/masterbrand/color/hex.json')

console.log(globalHex['nsw-blue'][500].$value)
console.log(rawHex['nsw-blue'][500].$value)
console.log(masterbrandFigma.primary[500].$value)
```

### 6. Tailwind CSS

> **Requires Tailwind CSS v4.0 or later.** The Tailwind outputs use the CSS-first
> [`@theme`](https://tailwindcss.com/docs/theme) at-rule, which does not exist in v3.

The Tailwind files map Tailwind's `--color-*` theme variables onto the NSW custom
properties (e.g. `--color-nsw-blue-500: var(--nsw-blue-500)`). Because they reference
`var(--nsw-*)`, you **must also import the matching CSS variables file** so the values
resolve:

```css
@import 'tailwindcss';

/* 1. The token values, as CSS custom properties */
@import '@nswds/tokens/css/colors/global/hex.css';
/* 2. The Tailwind @theme mapping that exposes `bg-nsw-*`, `text-nsw-*`, etc. */
@import '@nswds/tokens/tailwind/colors/global/hex.css';
```

```html
<button class="bg-nsw-blue-500 text-nsw-grey-50">Save</button>
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

Use Node.js `^20.19.0` or `>=22.12.0` for local development. This repo now runs `vitest@4` for `npm run test:tokens`, and that toolchain requires at least Node `20.19.0` on the Node 20 release line.

Build:

```bash
npm run build
npm run smoke:package-surface
npm run test:tokens
npm run lint
```

---

## Versioning & releases

Semantic versioning:

- **Major** for breaking changes.
- **Minor** for additive changes.
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

MIT License. See [`LICENSE`](./LICENSE).
