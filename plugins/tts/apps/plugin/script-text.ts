/** The extensions of the scripts the engines run: JXA for macOS, PowerShell for Windows. */
const SCRIPTS = [".jxa", ".ps1"];

/**
 * Loads an engine's script — `.jxa`, `.ps1` — as its source text. The scripts
 * are what `osascript` or `powershell.exe` runs, not code of the sidecar, so
 * they ship inside the bundle as strings — nothing beside `index.mjs` to find
 * at run time. One plugin for tsdown and vitest alike: both call a
 * Rollup-style `transform` hook.
 */
export function scriptText() {
  return {
    name: "script-text",
    transform(code: string, id: string) {
      if (!SCRIPTS.some((extension) => id.endsWith(extension))) {
        return null;
      }
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}
