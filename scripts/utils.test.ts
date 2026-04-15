import * as path from 'path'

import { assertSafeObjectKey, assertSafePathSegment, resolvePathInsideDirectory } from './utils.js'

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
    expect(resolvePathInsideDirectory('tokens/new', '/repo', 'output directory')).toBe(
      path.resolve('/repo', 'tokens/new'),
    )
  })

  it('rejects paths that escape the allowed root', () => {
    expect(() => {
      resolvePathInsideDirectory('../tokens', '/repo', 'output directory')
    }).toThrowError('Invalid output directory: "../tokens" must stay within /repo')
  })
})
