/** A JXA script, bundled as its source text (see `script-text.ts`). */
declare module "*.jxa" {
  const source: string;
  export default source;
}

/** A PowerShell script, bundled as its source text (see `script-text.ts`). */
declare module "*.ps1" {
  const source: string;
  export default source;
}
