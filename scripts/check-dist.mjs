import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const capture = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  return result.stdout.trimEnd()
}

run(npmCommand, ['run', 'build'])
run(npmCommand, ['run', 'smoke:package-surface'])

// src/ is now generated from tokens/ too (Style Dictionary), so verify both trees.
const distStatus = capture('git', ['status', '--porcelain=v1', '--', 'src', 'dist'])

if (distStatus) {
  console.error(
    '\nCommitted src/dist artifacts are out of date. Rebuild and commit the updated files.',
  )
  console.error(distStatus)

  const distDiff = capture('git', ['diff', '--stat', '--', 'src', 'dist'])

  if (distDiff) {
    console.error(`\n${distDiff}`)
  }

  process.exit(1)
}

// Bundle-size watch (review item M6): the root bundles embed every generated stylesheet
// as text and grow with each category. Catch a surprise jump in review instead of in a
// consumer's bundle-analyzer. Raise the budget deliberately when new categories land.
const BUNDLE_BUDGET_BYTES = 3 * 1024 * 1024 // 3 MiB; ~2.2 MiB as of Phase 4
for (const bundle of ['dist/index.js', 'dist/index.cjs']) {
  const bytes = statSync(bundle).size
  console.log(
    `${bundle}: ${(bytes / 1024 / 1024).toFixed(2)} MiB (budget ${(BUNDLE_BUDGET_BYTES / 1024 / 1024).toFixed(0)} MiB)`,
  )
  if (bytes > BUNDLE_BUDGET_BYTES) {
    console.error(
      `❌ ${bundle} exceeds the bundle budget — raise BUNDLE_BUDGET_BYTES deliberately if this growth is intended.`,
    )
    process.exit(1)
  }
}

console.log('\nCommitted src/dist artifacts are up to date.')
