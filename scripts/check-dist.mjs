import { spawnSync } from 'node:child_process'

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

const distStatus = capture('git', ['status', '--porcelain=v1', '--', 'dist'])

if (distStatus) {
  console.error(
    '\nCommitted dist artifacts are out of date. Rebuild and commit the updated dist files.',
  )
  console.error(distStatus)

  const distDiff = capture('git', ['diff', '--stat', '--', 'dist'])

  if (distDiff) {
    console.error(`\n${distDiff}`)
  }

  process.exit(1)
}

console.log('\nCommitted dist artifacts are up to date.')
