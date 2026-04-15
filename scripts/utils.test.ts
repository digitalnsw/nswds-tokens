import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { assertSafeObjectKey, assertSafePathSegment, resolvePathInsideDirectory } from './utils.js'

function withTempDir(assertions: (dir: string) => void) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nswds-tokens-'))

  try {
    assertions(tempDir)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('assertSafeObjectKey', () => {
  it('rejects unsafe prototype keys', () => {
    expect(() => {
      assertSafeObjectKey('__proto__', 'token name')
    }).toThrowError('Invalid token name: "__proto__"')
  })
})

describe('assertSafePathSegment', () => {
  it('rejects path traversal segments', () => {
    expect(() => {
      assertSafePathSegment('../tokens', 'collection name')
    }).toThrowError('Invalid collection name: "../tokens"')
  })
})

describe('resolvePathInsideDirectory', () => {
  it('resolves nested paths inside the allowed root', () => {
    withTempDir((allowedRoot) => {
      const realAllowedRoot = fs.realpathSync.native(allowedRoot)
      expect(resolvePathInsideDirectory('tokens/new', allowedRoot, 'output directory')).toBe(
        path.resolve(realAllowedRoot, 'tokens/new'),
      )
    })
  })

  it('allows directory names that start with two dots', () => {
    withTempDir((allowedRoot) => {
      const realAllowedRoot = fs.realpathSync.native(allowedRoot)
      expect(resolvePathInsideDirectory('..tokens/output', allowedRoot, 'output directory')).toBe(
        path.resolve(realAllowedRoot, '..tokens/output'),
      )
    })
  })

  it('rejects paths that escape the allowed root', () => {
    withTempDir((allowedRoot) => {
      expect(() => {
        resolvePathInsideDirectory('../tokens', allowedRoot, 'output directory')
      }).toThrowError(`Invalid output directory: "../tokens" must stay within ${allowedRoot}`)
    })
  })

  it('rejects symlink escapes', () => {
    withTempDir((tempRoot) => {
      const allowedRoot = path.join(tempRoot, 'allowed')
      const outsideRoot = path.join(tempRoot, 'outside')
      const symlinkPath = path.join(allowedRoot, 'linked')

      fs.mkdirSync(allowedRoot)
      fs.mkdirSync(outsideRoot)
      fs.symlinkSync(outsideRoot, symlinkPath)

      expect(() => {
        resolvePathInsideDirectory('linked/file.json', allowedRoot, 'output directory')
      }).toThrowError(
        `Invalid output directory: "linked/file.json" must stay within ${allowedRoot}`,
      )
    })
  })
})
