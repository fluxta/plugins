import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PACKAGE_METADATA_FIELDS } from "@fluxta/cli/validation/package-metadata";
import { parsePublicationIndex } from "@fluxta/cli/previous-index";
import { compareSemVer } from "@fluxta/cli/semver";
import { validateSourcePackageWithCli } from "../cli-validation.mjs";
import { runProcess } from "../process.mjs";
import { loadCodeowners, validatePackageOwnership } from "./codeowners.mjs";
import { buildAndValidatePluginArtifact } from "./build.mjs";
import {
  INDEX_OBJECT_KEY,
  artifactObjectKey,
  buildPublicationIndex,
  deriveRecommendations,
  emptyPublicationIndex,
  highestPublishedVersion,
  indexPublishedVersionsByPackage,
  serializePublicationIndex,
} from "./publication-index.mjs";
import { loadPublicationState } from "./publication-state.mjs";
import { OUTPUT_SCHEMA_VERSION, emptyPublicationPlan, failureResult } from "./results.mjs";
import {
  hasPackageErrors,
  isNonEmptyString,
  packageError,
  pathExists,
  rootDirectoryErrors,
  stringOrNull,
} from "./shared.mjs";

const PLUGINS_DIR = "plugins";
const UNKNOWN_SOURCE_COMMIT = "unknown";

export async function discoverPluginSourcePackages(rootDir) {
  const pluginsDir = path.join(rootDir, PLUGINS_DIR);

  if (!(await pathExists(pluginsDir))) {
    return [];
  }

  const entries = await readdir(pluginsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      path: path.relative(rootDir, path.join(pluginsDir, entry.name)),
      absolutePath: path.join(pluginsDir, entry.name),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Runs discovery and the build step only: CODEOWNERS load, per-package static
 * validation, ownership, and the package's own `pnpm install`/`pnpm run
 * build`. This is the only phase that executes Plugin Source Package-owned
 * code, so it is the phase CI runs with no publication credentials in scope —
 * see the `build` CLI command, which snapshots this output to disk, and
 * `validateFromSnapshot` below, which recombines a snapshot with real
 * publication history without running any package code again.
 */
export async function buildCheckout(rootDir, options = {}) {
  const rootErrors = await rootDirectoryErrors(rootDir);
  if (rootErrors.length > 0) {
    return {
      rootErrors,
      codeownersErrors: [],
      packages: [],
      buildErrors: [],
      publicationStates: new Map(),
    };
  }

  const codeowners = await loadCodeowners(rootDir);
  const codeownersErrors = codeowners
    ? codeowners.errors.map((error) => ({
        code: "INVALID_CODEOWNERS_ENTRY",
        file: codeowners.path,
        line: error.line,
        message: error.message,
      }))
    : [];

  const discoveredPackages = await discoverPluginSourcePackages(rootDir);
  const selected = selectPackages(discoveredPackages, options.only);
  const { packages, errors, publicationStates } = await validatePluginSourcePackages(
    rootDir,
    selected.packages,
    codeowners,
  );

  return {
    rootErrors: [],
    codeownersErrors,
    packages,
    buildErrors: [...selected.errors, ...errors],
    publicationStates,
  };
}

/**
 * Narrows discovery down to `--only`'s package IDs, when given. CI uses this
 * to build and publish just the Plugin Source Packages a push actually
 * touched instead of every package in the checkout. A package left out is
 * simply absent from this run's packages list — `buildPublicationIndex`
 * carries its already-published versions forward from the previous
 * Publication Index unchanged, so omitting an untouched package here never
 * drops its published history.
 */
function selectPackages(discoveredPackages, only) {
  if (!only || only.length === 0) {
    return { packages: discoveredPackages, errors: [] };
  }

  const discoveredIds = new Set(discoveredPackages.map((pkg) => pkg.id));
  const errors = only
    .filter((id) => !discoveredIds.has(id))
    .map((id) => ({
      code: "UNKNOWN_ONLY_PACKAGE",
      message: `--only names package '${id}', which was not found under 'plugins/'.`,
    }));

  const wanted = new Set(only);
  return {
    packages: discoveredPackages.filter((pkg) => wanted.has(pkg.id)),
    errors,
  };
}

export async function validateCheckout(options) {
  const rootDir = path.resolve(options.root);
  const built = await buildCheckout(rootDir, { only: options.only });
  if (built.rootErrors.length > 0) {
    return failureResult(rootDir, built.rootErrors);
  }

  const errors = [...built.codeownersErrors, ...built.buildErrors];
  return finishValidation(rootDir, built.packages, errors, built.publicationStates, options);
}

/**
 * Recombines a checkout that was already built elsewhere (a snapshot from the
 * `build` CLI command, produced by an earlier, credential-free CI job) with
 * real publication history, without running any Plugin Source Package code
 * again. `publish --from-snapshot` uses this so the job holding R2
 * credentials never executes package-owned build scripts.
 */
export async function validateFromSnapshot(rootDir, snapshot, options) {
  return finishValidation(
    rootDir,
    snapshot.packages,
    snapshot.errors,
    snapshot.publicationStates,
    options,
  );
}

async function finishValidation(rootDir, packages, errors, publicationStates, options) {
  let previousIndex = emptyPublicationIndex();
  let publicationIndexUsable = true;
  const allErrors = [...errors];
  if (options.previousIndexPath) {
    const loaded = await loadPreviousIndex(options.previousIndexPath);
    if (loaded.error) {
      allErrors.push({ code: loaded.error.code, message: loaded.error.message });
      publicationIndexUsable = false;
    } else {
      previousIndex = loaded.index;
    }
  }

  const publicationInput = publicationIndexUsable
    ? {
        previousIndex,
        previousIndexSupplied: Boolean(options.previousIndexPath),
        sourceCommit: await resolveSourceCommit(options.sourceCommit, rootDir),
        publishedAt: options.publishedAt ?? new Date().toISOString(),
      }
    : null;

  return validationResult({
    rootDir,
    packages,
    errors: allErrors,
    publicationInput,
    publicationStates,
  });
}

async function validatePluginSourcePackages(rootDir, discoveredPackages, codeowners) {
  const errors = [];
  const packages = [];
  const publicationStates = new Map();

  errors.push(...caseInsensitiveCollisionErrors(discoveredPackages));

  for (const sourcePackage of discoveredPackages) {
    const { state, errors: stateErrors } = await loadPublicationState(sourcePackage);
    errors.push(...stateErrors);
    if (state) {
      publicationStates.set(sourcePackage.id, state.entries);
    }

    // Static package validation before the build: manifest shape, package id,
    // Package Metadata, SemVer, and the build contract all come from the CLI.
    const source = await validateSourcePackageWithCli(sourcePackage);
    errors.push(...source.errors);

    const manifest = await readSourceManifest(sourcePackage);
    if (!manifest) {
      packages.push({
        id: sourcePackage.id,
        path: sourcePackage.path,
        status: "invalid",
      });
      continue;
    }

    errors.push(...validatePackageDirectoryIdentity(sourcePackage, manifest));

    // Ownership is independent of whether the package builds, so it is checked
    // as soon as the manifest declares a maintainer list to route. A package
    // that never declared one has already been reported by the metadata rules.
    let ownership = null;
    if (Array.isArray(manifest.maintainers) && manifest.maintainers.length > 0) {
      const result = validatePackageOwnership(sourcePackage, manifest, codeowners);
      ownership = result.ownership;
      errors.push(...result.errors);
    }

    let build = null;
    if (!hasPackageErrors(errors, sourcePackage)) {
      const result = await buildAndValidatePluginArtifact(rootDir, sourcePackage, manifest);
      build = result.build;
      errors.push(...result.errors);
    }

    packages.push(
      packageSummary(
        sourcePackage,
        manifest,
        !hasPackageErrors(errors, sourcePackage),
        ownership,
        build,
      ),
    );
  }

  return { packages, errors, publicationStates };
}

/**
 * A repository-owned rule the CLI can only warn about: packages are discovered
 * by directory under plugins/, so the directory name is the package id and the
 * manifest must agree with it. Outside this repository a source package may
 * live in any directory, which is why the CLI treats the mismatch as a warning.
 */
function validatePackageDirectoryIdentity(sourcePackage, manifest) {
  if (isNonEmptyString(manifest.name) && manifest.name !== sourcePackage.id) {
    return [
      packageError(
        sourcePackage,
        "PACKAGE_ID_MISMATCH",
        "manifest.json.name",
        `Manifest name '${manifest.name}' must match package directory '${sourcePackage.id}'.`,
      ),
    ];
  }
  return [];
}

function caseInsensitiveCollisionErrors(discoveredPackages) {
  const packagesByLowerId = new Map();
  for (const sourcePackage of discoveredPackages) {
    const lowerId = sourcePackage.id.toLowerCase();
    const matchingPackages = packagesByLowerId.get(lowerId) ?? [];
    matchingPackages.push(sourcePackage);
    packagesByLowerId.set(lowerId, matchingPackages);
  }

  return [...packagesByLowerId.values()]
    .filter((matchingPackages) => matchingPackages.length > 1)
    .flatMap((matchingPackages) =>
      matchingPackages.map((sourcePackage) =>
        packageError(
          sourcePackage,
          "PACKAGE_ID_COLLISION",
          "name",
          `Package id '${sourcePackage.id}' collides case-insensitively with another package directory.`,
        ),
      ),
    );
}

/**
 * Reads the source manifest for reporting. Shape and content are already
 * validated by the CLI seam, so a manifest that cannot be read or parsed here
 * has already produced a MISSING_MANIFEST or INVALID_MANIFEST_JSON error.
 */
async function readSourceManifest(sourcePackage) {
  try {
    return JSON.parse(
      await readFile(path.join(sourcePackage.absolutePath, "manifest.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

function packageSummary(sourcePackage, manifest, isValid, ownership, build) {
  return {
    id: sourcePackage.id,
    path: sourcePackage.path,
    status: isValid ? "valid" : "invalid",
    manifest: {
      name: stringOrNull(manifest.name),
      version: stringOrNull(manifest.version),
      apiVersion: Number.isInteger(manifest.apiVersion) ? manifest.apiVersion : null,
      title: stringOrNull(manifest.title),
      description: stringOrNull(manifest.description),
    },
    packageMetadata: {
      author: stringOrNull(manifest.author),
      license: stringOrNull(manifest.license),
      repository: stringOrNull(manifest.repository),
      homepage: stringOrNull(manifest.homepage),
      minAppVersion: stringOrNull(manifest.minAppVersion),
      maintainers: Array.isArray(manifest.maintainers)
        ? manifest.maintainers.filter(isNonEmptyString)
        : [],
    },
    ownership,
    build,
  };
}

function analyzePublishedChange(pkg, publishedVersions, effectiveStatus) {
  const version = pkg.manifest.version;
  const published = publishedVersions.find((entry) => entry.version === version) ?? null;

  if (!published) {
    const highest = highestPublishedVersion(publishedVersions);
    if (highest && compareSemVer(version, highest) < 0) {
      const source = { id: pkg.id, path: pkg.path };
      const reason =
        `Version '${version}' of '${pkg.id}' is lower than the highest published version ` +
        `'${highest}'. manifest.version must be greater than every version already ` +
        "published for this package, so the publication attempt is rejected before upload.";
      return {
        pkg,
        change: { kind: "non-monotonic-version", reason },
        changeError: packageError(source, "NON_MONOTONIC_VERSION", "version", reason),
      };
    }

    const reason =
      publishedVersions.length === 0
        ? `Version '${version}' of '${pkg.id}' has no published history; the built ` +
          "Plugin Artifact is planned as the first publication."
        : `Version '${version}' of '${pkg.id}' has not been published before; the built ` +
          "Plugin Artifact is planned as a new publication.";
    return { pkg, change: { kind: "new-version", reason }, changeError: null };
  }

  const artifactChanged = pkg.build.artifact.checksum !== published.artifact?.checksum;
  const metadataChanged = !packageMetadataEqual(pkg.packageMetadata, published.packageMetadata);
  const statusNote =
    effectiveStatus !== "published"
      ? ` The published version stays ${effectiveStatus}; its status, reason, and artifact remain untouched.`
      : "";

  if (!artifactChanged && !metadataChanged) {
    return {
      pkg,
      change: {
        kind: "docs-only",
        reason:
          `Version '${version}' of '${pkg.id}' is already published with an identical ` +
          "Plugin Artifact and Package Metadata; the change is docs-only and requires " +
          `no new publication.${statusNote}`,
      },
      changeError: null,
    };
  }

  const differences = [];
  if (artifactChanged) {
    differences.push("the rebuilt Plugin Artifact differs from the published artifact");
  }
  if (metadataChanged) {
    differences.push("trusted Package Metadata changed, which is artifact-affecting");
  }

  const source = { id: pkg.id, path: pkg.path };
  const sharedPrefix =
    `Version '${version}' of '${pkg.id}' is already published and ` +
    `${differences.join("; ")}. `;
  return {
    pkg,
    change: {
      kind: "duplicate",
      reason:
        sharedPrefix +
        "The duplicate publication attempt is rejected: one " +
        "(manifest.name, manifest.version) pair always refers to one immutable Plugin " +
        `Artifact, so manifest.version must be bumped to publish the change.${statusNote}`,
    },
    changeError: packageError(
      source,
      "DUPLICATE_PUBLICATION",
      "version",
      sharedPrefix +
        "Artifact-affecting changes require a new " +
        `manifest.version; the duplicate publication attempt is rejected before upload.${statusNote}`,
    ),
  };
}

function packageMetadataEqual(left, right) {
  return PACKAGE_METADATA_FIELDS.every((field) => {
    const leftValue = left?.[field] ?? null;
    const rightValue = right?.[field] ?? null;
    return JSON.stringify(leftValue) === JSON.stringify(rightValue);
  });
}

function validationResult({ rootDir, packages, errors, publicationInput, publicationStates }) {
  const publishedVersionsByPackage = indexPublishedVersionsByPackage(
    publicationInput?.previousIndex ?? emptyPublicationIndex(),
  );

  const analyzedPackages = packages.map((pkg) => {
    if (!pkg.build) {
      return { pkg, change: null, changeError: null };
    }
    const published = publishedVersionsByPackage.get(pkg.id) ?? [];
    const stateEntry = publicationStates
      ?.get(pkg.id)
      ?.find((entry) => entry.version === pkg.manifest.version);
    const effectiveStatus =
      stateEntry?.status ??
      published.find((entry) => entry.version === pkg.manifest.version)?.status ??
      "published";
    return analyzePublishedChange(pkg, published, effectiveStatus);
  });

  const allErrors = [
    ...errors,
    ...analyzedPackages
      .map(({ changeError }) => changeError)
      .filter((changeError) => changeError !== null),
  ];

  const outputPackages = analyzedPackages.map(({ pkg, change }) => ({ ...pkg, change }));

  const artifactWrites = analyzedPackages
    .filter(({ change }) => change?.kind === "new-version")
    .map(({ pkg }) => ({
      package: pkg.id,
      version: pkg.manifest.version,
      pluginFolder: pkg.build.pluginFolder,
      artifact: pkg.build.artifact.path,
      objectKey: artifactObjectKey(pkg.id, pkg.manifest.version),
      size: pkg.build.artifact.size,
      checksum: pkg.build.artifact.checksum,
    }));

  let publicationIndex = emptyPublicationIndex();
  let indexWrites = [];
  let recommendations = [];
  if (publicationInput) {
    const builtIndex = buildPublicationIndex(
      packages,
      publicationInput.previousIndex,
      publicationInput.sourceCommit,
      publicationInput.publishedAt,
      publicationStates,
      publicationInput.previousIndexSupplied,
    );
    publicationIndex = builtIndex.index;
    allErrors.push(...builtIndex.errors);

    const indexBytes = serializePublicationIndex(publicationIndex);
    if (publicationIndex.packages.length > 0) {
      indexWrites = [
        {
          objectKey: INDEX_OBJECT_KEY,
          size: Buffer.byteLength(indexBytes, "utf8"),
          checksum: createHash("sha256").update(indexBytes, "utf8").digest("hex"),
        },
      ];
    }
    recommendations = deriveRecommendations(publicationIndex);
  }

  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    ok: allErrors.length === 0,
    mode: "validate",
    dryRun: true,
    root: rootDir,
    packages: outputPackages,
    validation: {
      errors: allErrors,
      warnings: [],
    },
    publicationIndex,
    publicationPlan: {
      ...emptyPublicationPlan(),
      artifactWrites,
      indexWrites,
      recommendations,
    },
  };
}

export async function loadPreviousIndex(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    return {
      error: {
        code: "PREVIOUS_INDEX_UNREADABLE",
        message: `Could not read the previous Publication Index '${filePath}': ${error.message}`,
      },
    };
  }

  // The CLI owns the Publication Index schema, so authors reading an index with
  // `fluxta validate --previous-index` and this seam agree on what is valid.
  try {
    return { index: parsePublicationIndex(contents) };
  } catch (error) {
    return {
      error: {
        code: "INVALID_PREVIOUS_INDEX",
        message: `The previous Publication Index '${filePath}' is not usable: ${error.message}`,
      },
    };
  }
}

async function resolveSourceCommit(explicitSourceCommit, rootDir) {
  if (isNonEmptyString(explicitSourceCommit)) {
    return explicitSourceCommit;
  }

  const result = await runProcess("git", ["rev-parse", "HEAD"], { cwd: rootDir });
  if (result.code === 0) {
    const commit = result.stdout.trim();
    if (/^[0-9a-f]{40}$/.test(commit)) {
      return commit;
    }
  }

  return UNKNOWN_SOURCE_COMMIT;
}
