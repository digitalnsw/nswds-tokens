// Parity harness — generates the Style Dictionary outputs to a scratch dir and diffs
// each against the committed dist/ file. Proves the transformer reproduces the current
// published bytes before any cut-over. Exits non-zero if a target is NOT byte-identical.

import StyleDictionary from 'style-dictionary'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import config from '../build/style-dictionary.config.mjs'

const OUT = 'build/.sd-out'

rmSync(OUT, { recursive: true, force: true })
const sd = new StyleDictionary(config)
await sd.buildAllPlatforms()

const TARGETS = [
  'css/colors/global/hex.css',
  'css/colors/semantic/hex.css',
  'css/colors/themes/masterbrand/hex.css',
  'scss/colors/global/hex.scss',
  'scss/colors/semantic/hex.scss',
  'scss/colors/themes/masterbrand/hex.scss',
  'less/colors/global/hex.less',
  'less/colors/semantic/hex.less',
  'less/colors/themes/masterbrand/hex.less',
]

const firstDiff = (a, b) => {
  const al = a.split('\n')
  const bl = b.split('\n')
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) {
      return `  line ${i + 1}:\n    dist: ${JSON.stringify(al[i])}\n    sd:   ${JSON.stringify(bl[i])}`
    }
  }
  return '  (differs only in length)'
}

let identical = 0
const failures = []

for (const rel of TARGETS) {
  const genPath = resolve(OUT, rel)
  const distPath = resolve('dist', rel)
  if (!existsSync(genPath)) {
    failures.push(`✖ ${rel}: SD produced no file`)
    continue
  }
  if (!existsSync(distPath)) {
    failures.push(`✖ ${rel}: no dist file to compare`)
    continue
  }
  const gen = readFileSync(genPath, 'utf8')
  const dist = readFileSync(distPath, 'utf8')
  if (gen === dist) {
    identical++
    console.log(`✅ byte-identical  ${rel}`)
  } else {
    failures.push(`✖ DIFFERS  ${rel}\n${firstDiff(dist, gen)}`)
  }
}

console.log(`\n${identical}/${TARGETS.length} targets byte-identical.`)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
console.log('Parity proven for hex CSS/SCSS/LESS. ✅')
