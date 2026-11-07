import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: "../../dist/wave-link/editor",
    rollupOptions: {
      input: Object.fromEntries(
        readdirSync(fileURLToPath(new URL(".", import.meta.url)))
          .filter((name) => name.endsWith(".html"))
          .map((name) => [
            name.slice(0, -5),
            fileURLToPath(new URL(name, import.meta.url)),
          ]),
      ),
    },
  },
  resolve: { dedupe: ["react", "react-dom"] },
});
