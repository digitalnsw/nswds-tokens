declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.scss' {
  const content: string;
  export default content;
}

declare module '*.less' {
  const content: string;
  export default content;
}

declare module '*.js' {
  const content: { [key: string]: any };
  export default content;
}

declare module '*.ts' {
  const content: { [key: string]: any };
  export default content;
}

