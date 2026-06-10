import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { describe, it, expect } from 'vitest'

// Snapshot EVERY committed build output so that any unintended change to generated token
// values or shape surfaces as a reviewable snapshot diff. The file list is enumerated from
// dist/ at run time, so new layers, themes, or colour spaces are covered automatically the
// moment they are generated — there is no hand-maintained list to fall out of date.
//
// check:dist guarantees dist/ matches a rebuild; these snapshots additionally make the
// *content* of that rebuild reviewable when code in build/ or scripts/ changes.
//
// Update intentionally-changed snapshots with: npm run test:tokens -- -u

const root = process.cwd()

// Every published output format directory. dist/brand (binary assets) and the tsup bundle
// entry points (index.js/cjs/d.ts — megabytes, already covered via the per-format files
// they embed) are excluded.
const FORMAT_DIRS = [
  'dist/css',
  'dist/scss',
  'dist/less',
  'dist/js',
  'dist/ts',
  'dist/json',
  'dist/tailwind',
  'dist/figma',
  'dist/tokens',
]

const listFiles = (dir: string): string[] =>
  readdirSync(resolve(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== '.DS_Store')
    .map((entry) => [relative(root, entry.parentPath), entry.name].join(sep).split(sep).join('/'))
    .sort()

describe('built output snapshots', () => {
  for (const dir of FORMAT_DIRS) {
    const files = listFiles(dir)

    it(`${dir} is not empty`, () => {
      expect(files.length).toBeGreaterThan(0)
    })

    for (const file of files) {
      it(file, () => {
        expect(readFileSync(resolve(root, file), 'utf8')).toMatchSnapshot()
      })
    }
  }
})
