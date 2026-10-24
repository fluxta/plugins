import { defineConfig } from "vitest/config";

import { scriptText } from "./script-text.ts";

export default defineConfig({
  plugins: [scriptText()],
});
