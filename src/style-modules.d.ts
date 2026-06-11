// tsup bundles stylesheet imports as text (see the package.json tsup.loader config).
// These wildcard declarations give those imports a real module shape, so the generated
// dist/index.d.ts types them as strings instead of synthesising namespaces — which made
// the published types fail under skipLibCheck: false (TS2708: namespace used as a value).
// This file lives at the src/ root (not in a Style Dictionary-owned directory) and is
// consumed at build time by tsup's dts step; it is not published.
declare module '*.css' {
  const css: string
  export default css
}
declare module '*.scss' {
  const scss: string
  export default scss
}
declare module '*.less' {
  const less: string
  export default less
}
