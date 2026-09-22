import type { OBSWebSocket } from "obs-websocket-js";

const EXTENSION_FORMATS: Record<string, string> = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  bmp: "bmp",
};

/**
 * The image format OBS should encode with, derived from the path's own
 * extension — asking for the format separately let the two disagree (pick
 * "png", save to "test.jpg", and OBS silently writes PNG bytes into a file
 * named .jpg). `undefined` for an extension OBS's screenshot request
 * doesn't support.
 */
export function formatFromPath(path: string): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(path.trim());
  const extension = match?.[1]?.toLowerCase();
  return extension ? EXTENSION_FORMATS[extension] : undefined;
}

export async function saveScreenshot(
  obs: OBSWebSocket,
  source: string,
  format: string,
  path: string,
): Promise<void> {
  await obs.call("SaveSourceScreenshot", {
    sourceName: source,
    imageFormat: format,
    imageFilePath: path,
  });
}
