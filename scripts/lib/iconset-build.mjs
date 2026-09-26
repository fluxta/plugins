import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildIconsetArtifactZip } from "@fluxta/cli/iconset/artifact";
import { stageIconObject } from "./icon-object.mjs";
import { artifactObjectKey, previewObjectKey } from "./publication-index.mjs";
import { isNonEmptyString, packageError } from "./shared.mjs";

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
      staged.push(path.join(rootDir, objectKey));
      preview.push(
        await stageIconObject(
          rootDir,
          path.join(sourcePackage.absolutePath, iconPath),
          iconPath,
          objectKey,
        ),
      );
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
