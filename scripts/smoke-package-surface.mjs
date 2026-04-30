import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const documentedSpecifiers = [
  '@nswds/tokens/brand/logo.svg',
  '@nswds/tokens/prism.css',
  '@nswds/tokens/css/colors/global/hex.css',
  '@nswds/tokens/css/colors/themes/masterbrand/hex.css',
  '@nswds/tokens/js/colors/global/hex.js',
  '@nswds/tokens/scss/colors/global/hex.scss',
  '@nswds/tokens/less/colors/global/hex.less',
  '@nswds/tokens/json/colors/global/hex.json',
  '@nswds/tokens/tailwind/colors/themes/masterbrand/hex.css',
  '@nswds/tokens/tokens/global/color/hex.json',
  '@nswds/tokens/ts/colors/global/hex.ts',
  '@nswds/tokens/figma/color/themes/masterbrand/color/hex.json',
]

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return result.stdout?.trimEnd() ?? ''
}

const root = resolve()
const tempRoot = mkdtempSync(join(tmpdir(), 'nswds-tokens-surface-'))
const npmCache = join(tempRoot, 'npm-cache')
const consumerDir = join(tempRoot, 'consumer')
const packageDir = join(consumerDir, 'node_modules', '@nswds', 'tokens')

try {
  const [packResult] = JSON.parse(
    run(npmCommand, ['--cache', npmCache, 'pack', '--dry-run', '--json'], { cwd: root }),
  )

  const publishedPaths = packResult.files.map(({ path }) => path)
  const sourcePaths = publishedPaths.filter((path) => path.startsWith('src/'))

  if (sourcePaths.length > 0) {
    console.error('Source files should not be published:')
    for (const path of sourcePaths) {
      console.error(`- ${path}`)
    }
    process.exit(1)
  }

  mkdirSync(packageDir, { recursive: true })

  for (const publishedPath of publishedPaths) {
    const source = resolve(root, publishedPath)
    const destination = join(packageDir, publishedPath)

    mkdirSync(dirname(destination), { recursive: true })
    cpSync(source, destination)
  }

  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ name: 'nswds-tokens-surface-smoke', private: true, type: 'module' }, null, 2)}\n`,
    'utf8',
  )

  writeFileSync(
    join(consumerDir, 'verify.mjs'),
    `import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const documentedSpecifiers = ${JSON.stringify(documentedSpecifiers, null, 2)}
const toPath = (resolvedUrl) => (resolvedUrl.startsWith('file:') ? fileURLToPath(resolvedUrl) : resolvedUrl)

const esmEntrypoint = toPath(import.meta.resolve('@nswds/tokens'))
assert.ok(
  esmEntrypoint.endsWith(path.join('dist', 'index.js')),
  \`Expected import entrypoint to resolve to dist/index.js, got \${esmEntrypoint}\`,
)

const cjsEntrypoint = require.resolve('@nswds/tokens')
assert.ok(
  cjsEntrypoint.endsWith(path.join('dist', 'index.cjs')),
  \`Expected require entrypoint to resolve to dist/index.cjs, got \${cjsEntrypoint}\`,
)

const esmModule = await import('@nswds/tokens')
assert.equal(esmModule.tokens.colors.global.hex['nsw-blue'][500].$value, '#26aeff')

const cjsModule = require('@nswds/tokens')
assert.equal(cjsModule.tokens.colors.global.hex['nsw-blue'][500].$value, '#26aeff')

const resolvedPaths = documentedSpecifiers.map((specifier) => {
  const resolvedPath = toPath(import.meta.resolve(specifier))
  assert.ok(
    resolvedPath.includes(path.join('node_modules', '@nswds', 'tokens')),
    \`\${specifier} did not resolve inside the packed package: \${resolvedPath}\`,
  )

  return [specifier, resolvedPath]
})

console.log('Resolved documented package specifiers:')
for (const [specifier, resolvedPath] of resolvedPaths) {
  console.log(\`- \${specifier} -> \${resolvedPath}\`)
}
`,
    'utf8',
  )

  run(process.execPath, [join(consumerDir, 'verify.mjs')], { cwd: consumerDir, stdio: 'inherit' })

  console.log('\nPackage surface smoke check passed.')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
