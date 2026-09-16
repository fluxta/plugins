import { readFile } from "node:fs/promises";

type ManifestShape = { version?: unknown };

/**
 * Reads the manifest the sidecar shipped with. Fluxta copies it next to the
 * bundled entry file, so it is always a sibling of this module at runtime.
 */
export async function readManifestVersion(): Promise<string> {
  try {
    const source = await readFile(new URL("./manifest.json", import.meta.url), "utf8");
    const manifest = JSON.parse(source) as ManifestShape;
    return typeof manifest.version === "string" ? manifest.version : "unknown";
  } catch (error) {
    console.error("Could not read the manifest next to the sidecar:", error);
    return "unknown";
  }
}
