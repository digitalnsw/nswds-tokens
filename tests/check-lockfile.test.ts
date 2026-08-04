import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'

// Negative tests for scripts/check-lockfile.mjs, following the pattern established by
// validate-tokens.test.ts (review item M3): every failure mode of that script had only
// ever been verified by hand, so a refactor could silently lose a check. The same was
// true here — PR #169 review surfaced that a string-valued entry was being silently
// skipped, which hand-testing had missed.
//
// Unlike the validate fixtures, these are written to a temp dir rather than committed:
// each case is a one-line mutation of a minimal lockfile, and keeping the malformation
// next to its assertion is clearer than eight near-identical JSON files. The script
// takes the lockfile path as an optional argument so it can be pointed at them.

const script = resolve(process.cwd(), 'scripts', 'check-lockfile.mjs')
const workspace = mkdtempSync(join(tmpdir(), 'nswds-check-lockfile-'))

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

type Packages = Record<string, unknown>

const baseLockfile = (packages: Packages) => ({
  name: '@nswds/tokens',
  version: '4.2.4',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: '@nswds/tokens', version: '4.2.4' },
    'node_modules/real-dep': { version: '1.0.0', resolved: 'https://example.test/d.tgz' },
    ...packages,
  },
})

const runRaw = (name: string, contents: string) => {
  const lockfile = join(workspace, `${name}.json`)
  writeFileSync(lockfile, contents)

  const result = spawnSync(process.execPath, [script, lockfile], { encoding: 'utf8' })
  // Spawn failures (bad path, permissions) set `error` with a null status — surface
  // them as the real cause instead of a confusing `expected null to be 1` assertion.
  if (result.error) throw result.error
  return { status: result.status ?? -1, output: `${result.stdout}\n${result.stderr}` }
}

const runCheck = (name: string, packages: Packages) =>
  runRaw(name, JSON.stringify(baseLockfile(packages), null, 2))

describe('check-lockfile', () => {
  it('passes a well-formed lockfile', () => {
    const { status, output } = runCheck('valid', {})
    expect(output).toContain('package-lock.json is well-formed')
    expect(status).toBe(0)
  })

  it('passes a workspace symlink entry, which carries no version by design', () => {
    const { status, output } = runCheck('link', {
      'node_modules/@scope/ws': { link: true, resolved: 'packages/ws' },
    })
    expect(output).toContain('well-formed')
    expect(status).toBe(0)
  })

  // The symlink skip tests `link === true`, not truthiness. npm only ever writes the
  // boolean, so a truthy non-boolean is itself corruption — and skipping on it would
  // mask whatever else is wrong with the entry. Both cases below were fail-open until
  // the second Copilot review on #169.
  it('does not let a non-boolean link mask a missing version', () => {
    const { status, output } = runCheck('link-masks-version', {
      'node_modules/broken': { link: 'oops' },
    })
    expect(output).toContain('node_modules/broken has no version')
    expect(output).not.toContain('well-formed')
    expect(status).toBe(1)
  })

  it('does not let a non-boolean link mask an extraneous entry', () => {
    const { status, output } = runCheck('link-masks-extraneous', {
      'node_modules/broken': { link: 1, version: '1.0.0', extraneous: true },
    })
    expect(output).toContain('node_modules/broken is marked extraneous')
    expect(status).toBe(1)
  })

  // The regression that broke main in #164: arborist's canDedupe() calls semver.eq()
  // on the empty version, so npm ci dies before installing anything.
  it('rejects a version-less entry', () => {
    const { status, output } = runCheck('no-version', {
      'node_modules/rolldown/node_modules/@rolldown/binding-android-arm64': {
        dev: true,
        optional: true,
      },
    })
    expect(output).toContain('has no version')
    expect(output).toContain('Invalid Version:')
    expect(status).toBe(1)
  })

  it('rejects an extraneous entry', () => {
    const { status, output } = runCheck('extraneous', {
      'node_modules/conventional-commits-filter': { version: '6.0.1', extraneous: true },
    })
    expect(output).toContain('is marked extraneous')
    expect(status).toBe(1)
  })

  // A string entry must NOT be treated as a workspace symlink. Strings inherit the
  // legacy String.prototype.link method, which is truthy, so before #169 review this
  // entry was skipped and the lockfile reported as well-formed — a false negative in
  // the one check whose whole job is catching corrupt lockfiles.
  it('rejects a string entry instead of silently skipping it', () => {
    const { status, output } = runCheck('string', { 'node_modules/broken': 'oops' })
    expect(output).toContain('is a string, not an object')
    expect(output).not.toContain('well-formed')
    expect(status).toBe(1)
  })

  // A null entry previously threw a TypeError, losing every diagnostic below it.
  it('reports a null entry rather than throwing', () => {
    const { status, output } = runCheck('null', { 'node_modules/broken': null })
    expect(output).toContain('is null, not an object')
    expect(output).not.toContain('TypeError')
    expect(status).toBe(1)
  })

  const nonObjects: Array<[label: string, value: unknown, described: string]> = [
    ['number', 42, 'is a number, not an object'],
    ['array', [], 'is an array, not an object'],
    ['boolean', true, 'is a boolean, not an object'],
  ]

  for (const [label, value, described] of nonObjects) {
    it(`rejects a ${label} entry`, () => {
      const { status, output } = runCheck(label, { 'node_modules/broken': value })
      expect(output).toContain(described)
      expect(status).toBe(1)
    })
  }

  it('reports every malformed entry, not just the first', () => {
    const { status, output } = runCheck('multiple', {
      'node_modules/a': { dev: true },
      'node_modules/b': { version: '1.0.0', extraneous: true },
    })
    expect(output).toContain('node_modules/a has no version')
    expect(output).toContain('node_modules/b is marked extraneous')
    expect(status).toBe(1)
  })

  it('prints the repair recipe, which npm cannot perform itself', () => {
    const { output } = runCheck('repair-hint', { 'node_modules/broken': { dev: true } })
    expect(output).toContain('npm install --package-lock-only')
  })

  it('rejects a lockfile with no packages map', () => {
    const { status, output } = runRaw(
      'v1',
      JSON.stringify({ name: 'x', version: '1', lockfileVersion: 1 }),
    )
    expect(output).toContain('"packages" is undefined, not an object')
    // The entry-level repair recipe makes no sense for a whole-file shape problem.
    expect(output).not.toContain('npm install --package-lock-only')
    expect(status).toBe(1)
  })

  // `typeof [] === 'object'` and a non-empty array is truthy, so an array passes the
  // obvious shape tests and then iterates zero entries — the script would report a
  // corrupt lockfile as well-formed. Fail-open until the second Copilot review on #169.
  it('rejects a packages map that is an array', () => {
    const { status, output } = runRaw(
      'packages-array',
      JSON.stringify({ name: 'x', version: '1', lockfileVersion: 3, packages: [] }),
    )
    expect(output).toContain('"packages" is an array, not an object')
    expect(output).not.toContain('well-formed')
    expect(status).toBe(1)
  })

  const badLockfiles: Array<[label: string, contents: string, described: string]> = [
    ['null', 'null', 'package-lock.json is null, not an object'],
    ['an array', '[]', 'package-lock.json is an array, not an object'],
    ['a string', '"oops"', 'package-lock.json is a string, not an object'],
  ]

  // Reading `.packages` off a null lockfile threw a TypeError and lost the diagnostic.
  for (const [label, contents, described] of badLockfiles) {
    it(`reports a lockfile that is ${label}`, () => {
      const { status, output } = runRaw(`root-${label.replace(/\s/g, '-')}`, contents)
      expect(output).toContain(described)
      expect(output).not.toContain('TypeError')
      expect(status).toBe(1)
    })
  }
})
