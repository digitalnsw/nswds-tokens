// One-time: convert the Figma-sync staging files (primitives-*.light.json, themes-*.light.json)
// from hex-string colour values to the DTCG sRGB object shape, for consistency with the rest of
// the token source. $description, $extensions, and aliases are preserved. (The Figma sync now
// reads/writes this shape too — see scripts/color.ts rgbToDtcg/dtcgToRgb.)

import { readFileSync, writeFileSync } from 'node:fs'
import { converter } from 'culori'

const toRgb = converter('rgb')
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

const toDtcg = (hex) => {
  const { r, g, b, alpha = 1 } = toRgb(hex)
  return { colorSpace: 'srgb', components: [r, g, b], alpha, hex }
}

const convertLeaf = (leaf) => {
  if (leaf.$type !== 'color' || typeof leaf.$value !== 'string' || !HEX.test(leaf.$value)) {
    return leaf // aliases ({...}) and non-colour/object values are left as-is
  }
  return { ...leaf, $value: toDtcg(leaf.$value) }
}

const FILES = [
  'tokens/primitives-global.light.json',
  'tokens/primitives-semantic.light.json',
  'tokens/themes-masterbrand.light.json',
]

for (const file of FILES) {
  const obj = JSON.parse(readFileSync(file, 'utf8'))
  for (const family of Object.keys(obj)) {
    for (const step of Object.keys(obj[family])) {
      obj[family][step] = convertLeaf(obj[family][step])
    }
  }
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`)
  console.log(`converted ${file}`)
}
