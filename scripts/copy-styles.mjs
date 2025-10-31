import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_DIRS = [
  'css',
  'figma',
  'js',
  'json',
  'less',
  'scss',
  'tailwind',
  'ts',
  'brand',
];

const root = resolve();
const distDir = resolve(root, 'dist');
const srcDir = resolve(root, 'src');
const tokensDir = resolve(root, 'tokens');
const distTokensDir = resolve(distDir, 'tokens');

mkdirSync(distDir, { recursive: true });

for (const directory of SOURCE_DIRS) {
  const source = resolve(srcDir, directory);
  const destination = resolve(distDir, directory);

  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, force: true });
}

rmSync(distTokensDir, { recursive: true, force: true });
cpSync(tokensDir, distTokensDir, { recursive: true, force: true });

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const clone = (value) => JSON.parse(JSON.stringify(value));

const ALIAS_PATTERN = /^\{([\w-]+(?:\.[\w-]+)*)\}$/;

const buildColorLookup = (palette) => {
  const lookup = {};

  const walk = (node, path) => {
    if ('$value' in node && isObject(node.$value) && 'colorSpace' in node.$value) {
      lookup[path.join('.')] = node.$value;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === '$value' || key === '$type') continue;

      if (isObject(value)) {
        walk(value, [...path, key]);
      }
    }
  };

  for (const [key, value] of Object.entries(palette)) {
    if (isObject(value)) {
      walk(value, [key]);
    }
  }

  return lookup;
};

const rehydrateAliases = (palette, lookup) => {
  if (!isObject(palette)) {
    return palette;
  }

  const cloned = clone(palette);

  const walk = (node) => {
    if (typeof node.$value === 'string') {
      const match = ALIAS_PATTERN.exec(node.$value);
      if (match) {
        const alias = match[1];
        const resolved = lookup[alias];
        if (resolved) {
          node.$value = clone(resolved);
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === '$value' || key === '$type') continue;

      if (isObject(value)) {
        walk(value);
      }
    }
  };

  walk(cloned);

  return cloned;
};

const globalHsl = readJson(resolve(tokensDir, 'global/color/hsl.json'));
const globalOklch = readJson(resolve(tokensDir, 'global/color/oklch.json'));
const globalRgb = readJson(resolve(tokensDir, 'global/color/rgb.json'));

const globalHslLookup = buildColorLookup(globalHsl);
const globalOklchLookup = buildColorLookup(globalOklch);
const globalRgbLookup = buildColorLookup(globalRgb);

const masterbrandHslPath = resolve(distTokensDir, 'themes/color/masterbrand/hsl.json');
const masterbrandOklchPath = resolve(distTokensDir, 'themes/color/masterbrand/oklch.json');
const masterbrandRgbPath = resolve(distTokensDir, 'themes/color/masterbrand/rgb.json');

const masterbrandHsl = readJson(masterbrandHslPath);
const masterbrandOklch = readJson(masterbrandOklchPath);
const masterbrandRgb = readJson(masterbrandRgbPath);

writeJson(masterbrandHslPath, rehydrateAliases(masterbrandHsl, globalHslLookup));
writeJson(masterbrandOklchPath, rehydrateAliases(masterbrandOklch, globalOklchLookup));
writeJson(masterbrandRgbPath, rehydrateAliases(masterbrandRgb, globalRgbLookup));
