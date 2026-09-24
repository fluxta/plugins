import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildIconsetArtifactZip } from "@fluxta/cli/iconset";
import { artifactObjectKey, previewObjectKey } from "./publication-index.mjs";
import { isNonEmptyString, packageError } from "./shared.mjs";

const PREVIEW_CONTENT_TYPES = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/**
 * Packages an Iconset that already passed the CLI seam (ADR-0043). There is
 * no build to run: the artifact is zipped straight from the files the seam
 * selected, with the same deterministic archiver `fluxta package` uses, so an
 * author can reproduce the published checksum locally. Each Iconset Preview
 * icon is also staged as its own file next to the artifact, to be uploaded as
 * an individual object the Marketplace can show before anything is installed
 * (ADR-0044).
 */
export async function buildIconsetArtifact(rootDir, sourcePackage, manifest, files) {
  const errors = [];
  const version = isNonEmptyString(manifest.version) ? manifest.version : "0.0.0";
  const relativePath = artifactObjectKey(sourcePackage.id, version);
  const artifactPath = path.join(rootDir, relativePath);
  const staged = [artifactPath];

  try {
    await mkdir(path.dirname(artifactPath), { recursive: true });
    const archive = await buildIconsetArtifactZip(sourcePackage.absolutePath, sourcePackage.id);
    await writeFile(artifactPath, archive);

    const preview = [];
    for (const iconPath of manifest.preview) {
      const objectKey = previewObjectKey(sourcePackage.id, version, iconPath);
      const target = path.join(rootDir, objectKey);
      staged.push(target);
      const bytes = await readFile(path.join(sourcePackage.absolutePath, iconPath));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      preview.push({
        icon: iconPath,
        objectKey,
        size: bytes.length,
        checksum: sha256(bytes),
        contentType: previewContentType(iconPath),
      });
    }

    return {
      build: {
        status: "built",
        outputDir: null,
        pluginFolder: sourcePackage.id,
        artifact: {
          path: relativePath,
          size: archive.length,
          checksum: sha256(archive),
        },
        preview,
        iconCount: files.filter((file) => file.startsWith("icons/")).length,
      },
      errors,
    };
  } catch (error) {
    await Promise.all(staged.map((file) => rm(file, { force: true }).catch(() => {})));
    errors.push(
      packageError(
        sourcePackage,
        "ARTIFACT_CREATION_FAILED",
        "build",
        `Could not create the Iconset artifact for '${sourcePackage.id}': ${error.message}`,
      ),
    );
    return { build: null, errors };
  }
}

function previewContentType(iconPath) {
  const extension = path.extname(iconPath).slice(1).toLowerCase();
  return PREVIEW_CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
