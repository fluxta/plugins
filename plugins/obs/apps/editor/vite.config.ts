import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

// One HTML entry per editor. The host never tells an iframe which Action it is
// editing — it only serves the path the manifest points at — so an editor
// cannot dispatch on the Action type at runtime. Adding an editor therefore
// means adding an HTML file here and pointing the manifest at it; nothing else.
const entries = Object.fromEntries(
  readdirSync(root)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [file.slice(0, -".html".length), resolve(root, file)]),
);

export default defineConfig({
  // Editors are served from a nested path, so every asset reference must be
  // relative.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    // Safe to empty: this is the editor's own subdirectory, and the sidecar
    // bundle lands in the parent. Without it, renamed asset chunks pile up.
    emptyOutDir: true,
    outDir: "../../dist/obs/editor",
    rollupOptions: { input: entries },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
