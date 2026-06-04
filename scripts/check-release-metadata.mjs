import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const checkTag = args.has('--check-tag')

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
)
const rootPackage = packageLock.packages?.['']
const issues = []

if (!rootPackage) {
  issues.push('package-lock.json is missing the root package entry at packages[""].')
} else {
  if (packageLock.name !== packageJson.name) {
    issues.push(
      `package-lock.json name is ${JSON.stringify(packageLock.name)} but package.json name is ${JSON.stringify(packageJson.name)}.`,
    )
  }

  if (rootPackage.name !== packageJson.name) {
    issues.push(
      `package-lock.json packages[""].name is ${JSON.stringify(rootPackage.name)} but package.json name is ${JSON.stringify(packageJson.name)}.`,
    )
  }

  if (packageLock.version !== packageJson.version) {
    issues.push(
      `package-lock.json version is ${packageLock.version} but package.json version is ${packageJson.version}.`,
    )
  }

  if (rootPackage.version !== packageJson.version) {
    issues.push(
      `package-lock.json packages[""].version is ${rootPackage.version} but package.json version is ${packageJson.version}.`,
    )
  }
}

let latestTag = null

if (checkTag) {
  const tagResult = spawnSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' })

  if (tagResult.error) {
    throw tagResult.error
  }

  if (tagResult.status !== 0) {
    issues.push('Unable to determine the latest git tag with `git describe --tags --abbrev=0`.')
  } else {
    latestTag = tagResult.stdout.trim()

    if (latestTag) {
      const tagVersion = latestTag.startsWith('v') ? latestTag.slice(1) : latestTag

      if (tagVersion !== packageJson.version) {
        issues.push(
          `latest git tag is ${latestTag} but package.json version is ${packageJson.version}.`,
        )
      }
    } else {
      issues.push('The latest git tag is empty.')
    }
  }
}

if (issues.length > 0) {
  console.error('Release metadata is out of sync:')
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

console.log(`Release metadata is aligned for ${packageJson.name}@${packageJson.version}.`)

if (latestTag) {
  console.log(`Latest tag: ${latestTag}`)
}
