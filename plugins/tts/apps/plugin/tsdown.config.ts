import { spawn } from "node:child_process";
import { isBuiltin } from "node:module";

import { defineConfig } from "tsdown";

import { scriptText } from "./script-text.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "../../dist/tts",
  clean: false,
  copy: [
    { from: "../../manifest.json" },
    { from: "../../icons/*.svg", to: "../../dist/tts/icons" },
  ],
  plugins: [scriptText()],
  // Fluxta starts the sidecar with a bundled Node and no node_modules in the
  // plugin folder, so the entry file must be self-contained. Anything that is
  // not a Node builtin gets inlined — listing packages one by one only fails
  // at runtime, on the machine that installed the plugin.
  noExternal: (id) => !isBuiltin(id),
  // Links this build into a running Fluxta and restarts the plugin in it. A
  // restart that fails — Fluxta not running — does not fail the build. Run
  // from Node, not as a shell line ending in `|| true`: cmd.exe has no `true`.
  onSuccess: () =>
    new Promise<void>((resolve) => {
      spawn("fluxta restart", { cwd: "../..", stdio: "inherit", shell: true })
        .on("error", () => resolve())
        .on("exit", () => resolve());
    }),
});
