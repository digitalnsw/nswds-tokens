import { readFileSync, writeFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageLockPath = new URL('../package-lock.json', import.meta.url)
const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'))
const rootPackage = packageLock.packages?.['']

if (!rootPackage) {
  console.error('package-lock.json is missing the root package entry at packages[""].')
  process.exit(1)
}

let changed = false

if (packageLock.name !== packageJson.name) {
  packageLock.name = packageJson.name
  changed = true
}

if (packageLock.version !== packageJson.version) {
  packageLock.version = packageJson.version
  changed = true
}

if (rootPackage.name !== packageJson.name) {
  rootPackage.name = packageJson.name
  changed = true
}

if (rootPackage.version !== packageJson.version) {
  rootPackage.version = packageJson.version
  changed = true
}

if (changed) {
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`)
  console.log(`Synced package-lock.json to ${packageJson.name}@${packageJson.version}.`)
} else {
  console.log(`package-lock.json already matches ${packageJson.name}@${packageJson.version}.`)
}
