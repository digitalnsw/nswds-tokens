import { cpSync, mkdirSync, rmSync } from 'node:fs';
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

mkdirSync(distDir, { recursive: true });

for (const directory of SOURCE_DIRS) {
  const source = resolve(srcDir, directory);
  const destination = resolve(distDir, directory);

  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, force: true });
}
