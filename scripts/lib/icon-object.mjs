import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ICON_CONTENT_TYPES = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/**
 * Stages one icon as its own file next to the artifacts, to be uploaded as an
 * individual object the Marketplace loads before anything is installed — an
 * Iconset Preview icon (ADR-0044) or a plugin's own `icon` (ADR-0047). The
 * local path is the object key itself, so the two can never drift. Returns
 * the planned write: where it came from, where it goes, and its checksum.
 */
export async function stageIconObject(rootDir, sourceFile, iconPath, objectKey) {
  const bytes = await readFile(sourceFile);
  const target = path.join(rootDir, objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return {
    icon: iconPath,
    objectKey,
    size: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    contentType: iconContentType(iconPath),
  };
}

function iconContentType(iconPath) {
  const extension = path.extname(iconPath).slice(1).toLowerCase();
  return ICON_CONTENT_TYPES[extension] ?? "application/octet-stream";
}
