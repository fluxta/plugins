import { defineConfig } from "vite";

export default defineConfig({
  // The sidecar serves the page at `/player` and its scripts at `/assets/…`,
  // which relative references from `/player` resolve to.
  base: "./",
  build: {
    // Safe to empty: this is the page's own subdirectory of the Built Plugin
    // Folder, and the sidecar bundle lands in the parent.
    emptyOutDir: true,
    outDir: "../../dist/song-requests/player",
  },
});
