import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/probe.ts"],
  format: ["esm"],
  outDir: "../../artifacts/probe",
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
});
