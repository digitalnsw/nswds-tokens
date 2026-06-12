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
  // Phase 4 dimension categories
  '@nswds/tokens/css/space/global.css',
  '@nswds/tokens/js/radius/global.js',
  '@nswds/tokens/tailwind/breakpoints/global.css',
  '@nswds/tokens/tokens/global/space/canonical.json',
  // Phase 4b typography
  '@nswds/tokens/css/typography/global.css',
  '@nswds/tokens/tailwind/typography/global.css',
  // Phase 4c semantic typography composites
  '@nswds/tokens/css/typography/semantic.css',
  // Phase 4d border + shadow
  '@nswds/tokens/css/border/global.css',
  '@nswds/tokens/tailwind/shadow/global.css',
  // Dark mode (D1)
  '@nswds/tokens/css/colors/global/hex.dark.css',
  '@nswds/tokens/css/colors/global/hex.dark-media.css',
  '@nswds/tokens/css/colors/semantic/hex.dark.css',
  '@nswds/tokens/js/colors/global/hex.dark.js',
  '@nswds/tokens/tokens/global/color/hex.dark.json',
]

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw Object.assign(new Error(`Command failed with status ${result.status ?? 1}: ${command}`), {
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    })
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
    throw new Error(
      `Source files should not be published:\n${sourcePaths.map((path) => `- ${path}`).join('\n')}`,
    )
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

// Runtime shape guard for the style leaves: the d.ts ANNOTATES these as string, so a
// regression back to namespace imports ({ default: '...' }) would not be caught at the
// type level — tsup does not typecheck the initialiser against the annotation.
for (const [label, mod] of [['ESM', esmModule], ['CJS', cjsModule]]) {
  const leaf = mod.tokens.css.global.hex
  assert.equal(typeof leaf, 'string', label + ': tokens.css.global.hex must be a plain string, got ' + typeof leaf)
  assert.ok(leaf.startsWith(':root'), label + ': tokens.css.global.hex must contain the stylesheet text')
  assert.equal(typeof mod.tokens.tailwind.space.global, 'string', label + ': tailwind leaves must be plain strings')
  const dark = mod.tokens.css.global.dark.hex
  assert.equal(typeof dark, 'string', label + ': tokens.css.global.dark.hex must be a plain string')
  assert.ok(dark.startsWith("[data-theme='dark']"), label + ': dark CSS must scope under the dark selector')
  const media = mod.tokens.css.global.darkMedia.hex
  assert.ok(media.startsWith('@media (prefers-color-scheme: dark)'), label + ': darkMedia CSS must scope under the media query')
}

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

  // TypeScript consumer check: the ./js/* subpaths must carry .d.ts siblings — a strict
  // consumer importing them previously failed with TS7016 (implicit any). Compiles a real
  // consumer project against the packed package using the repo's own TypeScript.
  writeFileSync(
    join(consumerDir, 'consumer.ts'),
    [
      "import { tokens } from '@nswds/tokens'",
      "import { nswBlue } from '@nswds/tokens/js/colors/global/hex.js'",
      "import { radius } from '@nswds/tokens/js/radius/global.js'",
      "import { heading1 } from '@nswds/tokens/js/typography/semantic.js'",
      '',
      "const root: string = tokens.colors.global.hex['nsw-blue'][500].$value",
      'const blue: string = nswBlue[500]',
      'const md: string = radius.md',
      'const weight: number = heading1.fontWeight',
      'const css: string = tokens.css.global.hex // style leaves are plain typed strings',
      'const darkCss: string = tokens.css.global.dark.hex // dark mode (D1) nested sub-object',
      'const darkMediaCss: string = tokens.css.global.darkMedia.hex // prefers-color-scheme flavour',
      'export { root, blue, md, weight, css, darkCss, darkMediaCss }',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          // Deliberately STRICTER than the ecosystem default (skipLibCheck: true): the
          // published d.ts files themselves must compile. The root index.d.ts once
          // failed this with TS2708 (style text imports synthesised as namespaces) —
          // fixed by build-index's explicit type annotation; this setting guards it.
          skipLibCheck: false,
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  run(process.execPath, [resolve(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'], {
    cwd: consumerDir,
  })
  console.log('TypeScript consumer check passed (js subpaths are typed).')

  console.log('\nPackage surface smoke check passed.')
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout)
  if (error.stderr) process.stderr.write(error.stderr)
  console.error(error.message)
  process.exitCode = 1
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
