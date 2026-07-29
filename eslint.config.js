// Bespoke config, deliberately NOT @nswds/eslint-config: this repo is a token
// pipeline, not a Next.js app. @nswds/eslint-config@1.1.0 added a framework-free
// './base' entry point with the same shape as this file (@eslint/js +
// typescript-eslint + prettier-as-a-rule) — converge on it next time this file
// needs a change, keeping the repo-specific ignores below.
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettier from 'eslint-plugin-prettier'

export default defineConfig([
  { files: ['**/*.{js,mjs,cjs,ts}'] },
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ['**/*.{js,mjs,cjs,ts}'], plugins: { js }, extends: ['js/recommended'] },
  tseslint.configs.recommended,
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      'prettier/prettier': 'error', // Enforce Prettier formatting
    },
  },
  globalIgnores(['dist/**', 'scripts/index.ts']),
])
