import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildArtifactZip } from "@fluxta/cli/artifact";
import { validateSourcePackageWithCli } from "../cli-validation.mjs";
import { runProcess } from "../process.mjs";
import { artifactObjectKey } from "./publication-index.mjs";
import { hasPackageErrors, isNonEmptyString, packageError, tail } from "./shared.mjs";

const BUILD_OUTPUT_DIR = "dist";

/**
 * Runs the package's own build script, then hands the output back to the CLI
 * seam for Built Plugin Folder validation and deterministic zipping. Only the
 * build itself is this repository's concern; the CLI never runs builds.
 */
export async function buildAndValidatePluginArtifact(rootDir, sourcePackage, manifest) {
  const errors = [];

  const builtFolder = await runPackageBuild(sourcePackage, errors);
  if (!builtFolder) {
    return { build: null, errors };
  }

  const built = await validateSourcePackageWithCli(sourcePackage, {
    builtFolder: "exclusive",
  });
  errors.push(...built.errors);
  if (!built.builtFolder || hasPackageErrors(errors, sourcePackage)) {
    return { build: null, errors };
  }

  const pluginFolder = path.basename(built.builtFolder);
  const artifact = await createPluginArtifact(
    rootDir,
    sourcePackage,
    pluginFolder,
    built.builtFolder,
    manifest,
    errors,
  );
  if (!artifact) {
    return { build: null, errors };
  }

  return {
    build: {
      status: "built",
      outputDir: path.join(sourcePackage.path, BUILD_OUTPUT_DIR),
      pluginFolder,
      artifact,
    },
    errors,
  };
}

async function runPackageBuild(sourcePackage, errors) {
  const packageDir = sourcePackage.absolutePath;
  const outputDir = path.join(packageDir, BUILD_OUTPUT_DIR);

  await rm(outputDir, { recursive: true, force: true });

  for (const step of [
    ["install", ["install", "--frozen-lockfile"]],
    ["build", ["run", "build"]],
  ]) {
    const [name, args] = step;
    const result = await runProcess("pnpm", args, { cwd: packageDir });
    if (result.code !== 0) {
      errors.push(
        packageError(
          sourcePackage,
          "PACKAGE_BUILD_FAILED",
          "build",
          `Package build failed in step 'pnpm ${args.join(" ")}': ${buildFailureSummary(result)}`,
        ),
      );
      return null;
    }
  }

  return outputDir;
}

function buildFailureSummary(result) {
  if (typeof result.code === "string") {
    return `could not start pnpm (${result.code}). Ensure pnpm is installed and on PATH.`;
  }

  const output = (result.stderr || result.stdout || "").trim();
  const summary = output ? `\n${tail(output, 1500)}` : "no output captured.";
  return `exit code ${result.code}.${summary}`;
}

/**
 * Writes the Plugin Artifact and records its checksum and size. The zip bytes
 * come from the CLI's deterministic archiver, so `fluxta package -o` produces
 * a byte-identical artifact and an author can verify a published checksum
 * locally. The local path is derived from the same key as the artifact store
 * object, so the two can never drift.
 */
async function createPluginArtifact(
  rootDir,
  sourcePackage,
  pluginFolder,
  pluginDir,
  manifest,
  errors,
) {
  const version = isNonEmptyString(manifest.version) ? manifest.version : "0.0.0";
  const relativePath = artifactObjectKey(sourcePackage.id, version);
  const artifactPath = path.join(rootDir, relativePath);

  try {
    await mkdir(path.dirname(artifactPath), { recursive: true });
    const archive = await buildArtifactZip(pluginDir, pluginFolder);
    await writeFile(artifactPath, archive);
    return {
      path: relativePath,
      size: archive.length,
      checksum: createHash("sha256").update(archive).digest("hex"),
    };
  } catch (error) {
    await rm(artifactPath, { force: true }).catch(() => {});
    errors.push(
      packageError(
        sourcePackage,
        "ARTIFACT_CREATION_FAILED",
        "build",
        `Could not create the Plugin Artifact for '${sourcePackage.id}': ${error.message}`,
      ),
    );
    return null;
  }
}
