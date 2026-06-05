import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Snapshot a representative slice of the committed build outputs so that any unintended
// change to generated token values or shape surfaces as a reviewable snapshot diff.
// Covers one file per output format (CSS, SCSS, LESS, JS, JSON, Tailwind, raw tokens),
// with all three layers (global, semantic, theme) sampled via the CSS outputs.
//
// Update intentionally-changed snapshots with: npm run test:tokens -- -u

const root = process.cwd()
const read = (relPath: string) => readFileSync(resolve(root, relPath), 'utf8')

const OUTPUTS = [
  'dist/css/colors/global/hex.css',
  'dist/css/colors/semantic/hex.css',
  'dist/css/colors/themes/masterbrand/hex.css',
  'dist/scss/colors/global/hex.scss',
  'dist/less/colors/global/hex.less',
  'dist/js/colors/global/hex.js',
  'dist/json/colors/global/hex.json',
  'dist/tailwind/colors/global/hex.css',
  'dist/tokens/global/color/hex.json',
]

describe('built output snapshots', () => {
  for (const file of OUTPUTS) {
    it(file, () => {
      expect(read(file)).toMatchSnapshot()
    })
  }
})
