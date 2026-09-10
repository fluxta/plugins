import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "../../dist/test",
  clean: false,
  copy: [{ from: "../../manifest.json" }],
  noExternal: [/^@fluxta/],
  onSuccess: "cd ../.. && fluxta restart || true",
});
