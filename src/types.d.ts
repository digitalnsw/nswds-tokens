interface JsModule {
  [key: string]: string | number
}
declare module '*.css' {
  const content: string
  export default content
}

declare module '*.scss' {
  const content: string
  export default content
}

declare module '*.less' {
  const content: string
  export default content
}

declare module '*.js' {
  const content: { [key: string]: JsModule }
  export default content
}

declare module '*.ts' {
  const content: { [key: string]: JsModule }
  export default content
}
