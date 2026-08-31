import path from "node:path";
import { PACKAGE_METADATA_FIELDS } from "@fluxta/cli/validation/package-metadata";
import { compareSemVer } from "@fluxta/cli/semver";
import { isNonEmptyString, stringOrNull } from "./shared.mjs";

export const INDEX_SCHEMA_VERSION = 1;
export const INDEX_OBJECT_KEY = "publication-index.json";
const ARTIFACTS_OUTPUT_DIR = "artifacts";
// Canonical field order for the nested objects of a Publication Index entry.
// The index is compared by checksum, so its key order is part of its contract.
const INDEX_MANIFEST_FIELDS = ["name", "version", "apiVersion", "title", "description"];
const INDEX_ARTIFACT_FIELDS = [
  "objectKey",
  "checksum",
  "size",
  "sourceCommit",
  "publishedAt",
];
const VERSION_STATUSES = new Set(["published", "yanked", "unlisted"]);

export function emptyPublicationIndex() {
  return { schemaVersion: INDEX_SCHEMA_VERSION, packages: [] };
}

export function serializePublicationIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/**
 * Puts one published version into the Publication Index's canonical shape and
 * key order. The index is serialized with JSON.stringify, so key order is part
 * of the bytes: building every entry here — rather than spreading whatever the
 * previous index happened to contain — is what keeps the index checksum stable
 * across runs and stops the publisher from rewriting an unchanged index.
 *
 * Legacy `yanked` and `unlisted` booleans are folded into `status`.
 */
function normalizeVersionEntry(entry) {
  const legacyStatus =
    entry.yanked === true ? "yanked" : entry.unlisted === true ? "unlisted" : null;
  return {
    version: entry.version,
    manifest: pickFields(entry.manifest, INDEX_MANIFEST_FIELDS),
    packageMetadata: pickFields(entry.packageMetadata, PACKAGE_METADATA_FIELDS),
    artifact: pickFields(entry.artifact, INDEX_ARTIFACT_FIELDS),
    status: VERSION_STATUSES.has(entry.status) ? entry.status : (legacyStatus ?? "published"),
    reason: stringOrNull(entry.reason),
  };
}

/** Rebuilds a nested index object with a fixed field set and key order. */
function pickFields(source, fields) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const result = {};
  for (const field of fields) {
    result[field] = source[field] ?? null;
  }
  return result;
}

function sortVersions(versions) {
  return [...versions].sort((left, right) => compareSemVer(left.version, right.version));
}

function latestRecommendedVersion(versions) {
  const candidates = versions.filter((entry) => entry.status === "published");
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((latest, entry) =>
    compareSemVer(entry.version, latest.version) > 0 ? entry : latest,
  );
}

export function deriveRecommendations(index) {
  return index.packages.flatMap((pkg) => {
    const latest = latestRecommendedVersion(pkg.versions);
    return latest ? [{ package: pkg.name, latestVersion: latest.version }] : [];
  });
}

/**
 * Merges the current checkout into the previously published Publication Index
 * and reports versions whose state cannot be reconciled with it.
 */
export function buildPublicationIndex(
  packages,
  previousIndex,
  sourceCommit,
  publishedAt,
  publicationStates,
  requirePublishedHistory,
) {
  const packagesByName = new Map();
  const previousVersionsByPackage = new Map();
  const packagePathById = new Map(packages.map((pkg) => [pkg.id, pkg.path]));

  for (const previousPackage of previousIndex.packages) {
    if (!isNonEmptyString(previousPackage.name) || !Array.isArray(previousPackage.versions)) {
      continue;
    }
    const versions = previousPackage.versions
      .filter((entry) => entry && isNonEmptyString(entry.version))
      .map((entry) => normalizeVersionEntry(entry));
    if (versions.length > 0) {
      packagesByName.set(previousPackage.name, { name: previousPackage.name, versions });
      previousVersionsByPackage.set(
        previousPackage.name,
        new Set(versions.map((entry) => entry.version)),
      );
    }
  }

  for (const pkg of packages) {
    if (!pkg.build) {
      continue;
    }
    const version = pkg.manifest.version;
    const existing = packagesByName.get(pkg.id) ?? { name: pkg.id, versions: [] };
    if (!existing.versions.some((entry) => entry.version === version)) {
      existing.versions.push(
        normalizeVersionEntry({
          version,
          manifest: { ...pkg.manifest },
          packageMetadata: { ...pkg.packageMetadata },
          artifact: {
            objectKey: artifactObjectKey(pkg.id, version),
            checksum: pkg.build.artifact.checksum,
            size: pkg.build.artifact.size,
            sourceCommit,
            publishedAt,
          },
        }),
      );
    }
    packagesByName.set(pkg.id, existing);
  }

  const errors = [];
  for (const [packageId, stateEntries] of publicationStates ?? []) {
    const pkg = packagesByName.get(packageId);
    const publishedVersions = previousVersionsByPackage.get(packageId);
    for (const stateEntry of stateEntries) {
      const target =
        pkg?.versions.find((entry) => entry.version === stateEntry.version) ?? null;
      if (target && publishedVersions?.has(stateEntry.version)) {
        target.status = stateEntry.status;
        target.reason = stateEntry.reason;
        continue;
      }

      if (requirePublishedHistory) {
        errors.push({
          code: "PUBLICATION_STATE_UNPUBLISHED_VERSION",
          package: packageId,
          path: packagePathById.get(packageId) ?? path.join("plugins", packageId),
          field: `versions.${stateEntry.version}.status`,
          message:
            `Publication state marks version '${stateEntry.version}' of '${packageId}' as ` +
            `'${stateEntry.status}' but the supplied Publication Index has no published ` +
            "history for that version. Publication state can only mark versions that have " +
            "been published.",
        });
      }
    }
  }

  return {
    index: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      packages: [...packagesByName.values()]
        .map((pkg) => ({ ...pkg, versions: sortVersions(pkg.versions) }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    },
    errors,
  };
}

export function artifactObjectKey(packageId, version) {
  return `${ARTIFACTS_OUTPUT_DIR}/${packageId}-${sanitizeArtifactFileName(version)}.zip`;
}

function sanitizeArtifactFileName(value) {
  return value.replace(/[^A-Za-z0-9.-]/g, "-");
}

export function artifactMetadataFromIndex(index, packageId, version) {
  const pkg = index.packages.find((entry) => entry.name === packageId);
  const versionEntry = pkg?.versions.find((entry) => entry.version === version);
  if (!versionEntry?.artifact) {
    return null;
  }
  const { objectKey, checksum, size, sourceCommit, publishedAt } = versionEntry.artifact;
  return { objectKey, checksum, size, sourceCommit, publishedAt };
}

export function indexPublishedVersionsByPackage(previousIndex) {
  const byPackage = new Map();

  for (const previousPackage of previousIndex.packages ?? []) {
    if (!isNonEmptyString(previousPackage.name) || !Array.isArray(previousPackage.versions)) {
      continue;
    }
    const versions = previousPackage.versions
      .filter((entry) => entry && isNonEmptyString(entry.version))
      .map((entry) => normalizeVersionEntry(entry));
    if (versions.length > 0) {
      byPackage.set(previousPackage.name, versions);
    }
  }

  return byPackage;
}
