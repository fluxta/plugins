import { spawn } from "node:child_process";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "../../dist/wave-link",
  clean: false,
  copy: [
    { from: "../../manifest.json" },
    { from: "../../icons/*.svg", to: "../../dist/wave-link/icons" },
  ],
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
  onSuccess: () =>
    new Promise<void>((resolve) => {
      spawn("fluxta restart", { cwd: "../..", stdio: "inherit", shell: true })
        .on("error", () => resolve())
        .on("exit", () => resolve());
    }),
});
