// Style Dictionary 4 config — Phase 0 (proof-of-parity).
//
// Scope: regenerate the hex CSS/SCSS/LESS outputs from the canonical DTCG source and
// prove they are byte-identical to the hand-authored files in dist/. Only `hex.json`
// sources are wired up here on purpose — the hsl/rgb/oklch object-form tokens use the
// non-standard `channels`/`rgb` shape (review item C1) and are handled in Phase 1/3,
// once a colour transform + the DTCG fix land. js/ts/json/tailwind/figma/root formats
// are also Phase 1 (custom formats).
//
// Output goes to a scratch dir (build/.sd-out/), NOT dist/, so nothing is overwritten.

const OUT = 'build/.sd-out/'

// Restrict a platform file to the tokens that came from one source file (one layer).
const fromFile = (fragment) => (token) => token.filePath.replaceAll('\\', '/').includes(fragment)

const LAYERS = [
  { dest: 'global', fragment: '/global/color/hex.json' },
  { dest: 'semantic', fragment: '/semantic/color/hex.json' },
  { dest: 'themes/masterbrand', fragment: '/themes/color/masterbrand/hex.json' },
]

const platform = (transformGroup, format, ext, dir) => ({
  transformGroup,
  buildPath: OUT,
  options: { showFileHeader: false },
  files: LAYERS.map(({ dest, fragment }) => ({
    destination: `${dir}/colors/${dest}/hex.${ext}`,
    format,
    filter: fromFile(fragment),
  })),
})

export default {
  // Include every hex source so theme aliases ({nsw-blue.50}) resolve against globals.
  source: ['tokens/**/hex.json'],
  platforms: {
    css: platform('css', 'css/variables', 'css', 'css'),
    scss: platform('scss', 'scss/variables', 'scss', 'scss'),
    less: platform('less', 'less/variables', 'less', 'less'),
  },
}
