import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Codified negative tests for scripts/validate-tokens.mjs (review item M3): until now
// every failure mode was only verified by hand during PR review, so a refactor could
// silently lose a check. Each fixture under tests/fixtures/validate/ is a minimal
// tokens/ tree; the validator runs against it as a real subprocess (the script resolves
// tokens/ from cwd), and we assert the exit code and the specific diagnostic.

const root = process.cwd()
const script = resolve(root, 'scripts', 'validate-tokens.mjs')

const runValidator = (fixture: string) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: resolve(root, 'tests', 'fixtures', 'validate', fixture),
    encoding: 'utf8',
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

describe('validate-tokens', () => {
  it('passes a minimal valid tree', () => {
    const { status, output } = runValidator('valid')
    expect(output).toContain('Token validation passed')
    expect(status).toBe(0)
  })

  const failures: Array<[fixture: string, diagnostic: string]> = [
    ['alias-cycle', 'alias cycle detected'],
    ['dangling-alias', 'unresolved alias "{space.nope}"'],
    ['missing-value', 'missing $value'],
    ['bad-dimension-unit', 'dimension unit "em"'],
    ['number-not-number', 'number $value must be a JSON number'],
    ['composite-literal-subvalue', 'must be an {alias} to a primitive'],
    ['composite-wrong-type-alias', 'resolves to a "number" token; fontSize requires "dimension"'],
    ['shadow-bad-color-alias', 'resolves to a "dimension" token; shadowColor requires "color"'],
    // DTCG Color-module conformance is error severity (review item M2) — a regression
    // to the pre-C1 shape must fail CI, not warn.
    ['color-channels-regression', 'uses "channels"; DTCG expects "components"'],
    ['color-channels-regression', 'colorSpace "rgb"; DTCG expects "srgb"'],
    ['color-channels-regression', 'sRGB components appear to be 0–255'],
    ['duplicate-conflict', 'duplicate token "space.4" with conflicting values'],
  ]

  for (const [fixture, diagnostic] of failures) {
    it(`rejects ${fixture}: ${diagnostic}`, () => {
      const { status, output } = runValidator(fixture)
      expect(output).toContain(diagnostic)
      expect(status).toBe(1)
    })
  }
})
