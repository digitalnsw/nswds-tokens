# nswds-tokens

Design tokens for the NSW Design System – a single source of truth for colour, typography, spacing, radii, breakpoints and more.

These tokens are used to keep NSW digital products visually consistent, accessible and easy to maintain.

> ℹ️ **Note:** Update package names, file paths and script names below to match this repo’s actual setup.

---

## Features

- 🎨 Centralised colour system (including Aboriginal and NSW palettes)
- ✏️ Typography scales and font stacks
- 📏 Spacing, sizing and layout tokens
- 🧱 Border radius, shadows and other UI primitives
- 🌗 Theme-aware tokens for different NSW themes
- 🧩 Ready to consume from CSS, Sass, JavaScript/TypeScript or build tools

---

## Installation

Install via your package manager (replace the package name if different):

```bash
npm install @digitalnsw/nswds-tokens
# or
yarn add @digitalnsw/nswds-tokens
# or
pnpm add @digitalnsw/nswds-tokens
```

If you are using this repo locally (e.g. via workspace):

```bash
npm install
# or yarn / pnpm install
```

---

## Using the tokens

There are a few common ways to consume the tokens. Adjust paths to match your `dist/` structure.

### 1. CSS custom properties

```css
@import '@digitalnsw/nswds-tokens/dist/tokens.css';

.my-button {
  background-color: var(--nsw-color-primary);
  color: var(--nsw-color-text-on-primary);
  padding: var(--nsw-space-3);
  border-radius: var(--nsw-radius-md);
}
```

### 1a. Prism CSS (standalone)

```css
@import '@nswds/tokens/prism.css';
```

Or via JS/TS (for bundlers that support CSS imports):

```ts
import '@nswds/tokens/prism.css'
```

The full path is also available:

```css
@import '@nswds/tokens/css/prism/prism.css';
```

### 2. Sass / SCSS variables or maps

```scss
@use '@digitalnsw/nswds-tokens/dist/tokens' as nsw;

.page-heading {
  font-family: nsw.$font-family-sans;
  font-size: nsw.$font-size-xxl;
  margin-bottom: nsw.$space-4;
}
```

### 3. JavaScript / TypeScript

```ts
import tokens from '@digitalnsw/nswds-tokens/dist/tokens.json'

console.log(tokens.color['nsw-blue-500'])
```

---

## Token structure

Tokens are organised into logical groups such as:

- `color`
- `font`
- `fontSize`, `fontWeight`, `lineHeight`
- `space`
- `radius`
- `shadow`
- `border`
- `breakpoint`
- `motion`
- `theme`

---

## Theming

Token sets support multiple NSW themes via **alias tokens** mapping to base tokens.

Example:

```json
{
  "theme": {
    "light": {
      "background": { "value": "{color.nsw-grey-050}" },
      "text": { "value": "{color.nsw-grey-900}" }
    }
  }
}
```

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
