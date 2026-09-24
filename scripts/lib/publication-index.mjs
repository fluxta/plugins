import path from "node:path";
import { PACKAGE_METADATA_FIELDS } from "@fluxta/cli/validation/package-metadata";
import { compareSemVer } from "@fluxta/cli/semver";
import { isNonEmptyString, stringOrNull } from "./shared.mjs";

export const INDEX_SCHEMA_VERSION = 1;
export const INDEX_OBJECT_KEY = "publication-index.json";
const ARTIFACTS_OUTPUT_DIR = "artifacts";
// Canonical field order for the nested objects of a Publication Index entry.
// The index is compared by checksum, so its key order is part of its contract.
// Runtime manifest fields and Package Metadata both live as top-level fields
// of manifest.json, so the index carries them as one `manifest` object too —
// matching the `Record<string, unknown>` shape `@fluxta/cli/previous-index`
// parses back (`PublishedVersion.manifest`, no separate `packageMetadata`).
const INDEX_MANIFEST_FIELDS = ["name", "version", "apiVersion", "title", "description"];
const INDEX_ENTRY_MANIFEST_FIELDS = [...INDEX_MANIFEST_FIELDS, ...PACKAGE_METADATA_FIELDS];
// An Iconset has no `apiVersion`; it has an Icon Color Mode instead (ADR-0043).
const INDEX_ICONSET_MANIFEST_FIELDS = [
  "name",
  "version",
  "title",
  "description",
  "color",
  ...PACKAGE_METADATA_FIELDS,
];
const PACKAGE_TYPES = new Set(["plugin", "iconset"]);
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

/** The Package Type an index entry declares; entries written before Iconsets are plugins. */
export function packageTypeOfEntry(entry) {
  return PACKAGE_TYPES.has(entry?.type) ? entry.type : "plugin";
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
function normalizeVersionEntry(entry, type = "plugin") {
  const legacyStatus =
    entry.yanked === true ? "yanked" : entry.unlisted === true ? "unlisted" : null;
  const status = VERSION_STATUSES.has(entry.status)
    ? entry.status
    : (legacyStatus ?? "published");

  if (type === "iconset") {
    // The Iconset Preview's object keys, in display order, and the icon count
    // the Marketplace card shows — both only known to an Iconset (ADR-0044).
    return {
      version: entry.version,
      manifest: pickFields(entry.manifest, INDEX_ICONSET_MANIFEST_FIELDS),
      artifact: pickFields(entry.artifact, INDEX_ARTIFACT_FIELDS),
      preview: Array.isArray(entry.preview) ? entry.preview.filter(isNonEmptyString) : [],
      iconCount: Number.isInteger(entry.iconCount) ? entry.iconCount : 0,
      status,
      reason: stringOrNull(entry.reason),
    };
  }

  return {
    version: entry.version,
    manifest: pickFields(entry.manifest, INDEX_ENTRY_MANIFEST_FIELDS),
    artifact: pickFields(entry.artifact, INDEX_ARTIFACT_FIELDS),
    status,
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

/**
 * The highest version ever published for a package, across every status —
 * including `yanked`/`unlisted`. A version number, once used, stays retired
 * regardless of status, so this is the floor a new `manifest.version` must
 * clear. Returns null when the package has no published history.
 */
export function highestPublishedVersion(versions) {
  if (versions.length === 0) {
    return null;
  }
  return versions.reduce((highest, entry) =>
    compareSemVer(entry.version, highest.version) > 0 ? entry : highest,
  ).version;
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
    const type = packageTypeOfEntry(previousPackage);
    const versions = previousPackage.versions
      .filter((entry) => entry && isNonEmptyString(entry.version))
      .map((entry) => normalizeVersionEntry(entry, type));
    if (versions.length > 0) {
      packagesByName.set(previousPackage.name, { name: previousPackage.name, type, versions });
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
    const type = pkg.type ?? "plugin";
    const existing = packagesByName.get(pkg.id) ?? { name: pkg.id, type, versions: [] };
    if (!existing.versions.some((entry) => entry.version === version)) {
      existing.versions.push(
        normalizeVersionEntry(
          {
            version,
            manifest: { ...pkg.manifest },
            artifact: {
              objectKey: artifactObjectKey(pkg.id, version),
              checksum: pkg.build.artifact.checksum,
              size: pkg.build.artifact.size,
              sourceCommit,
              publishedAt,
            },
            preview: pkg.build.preview?.map((entry) => entry.objectKey),
            iconCount: pkg.build.iconCount,
          },
          type,
        ),
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

/**
 * Where one Iconset Preview icon is published: beside the artifacts, under a
 * per-version folder, so a published version's preview is as immutable as its
 * artifact (ADR-0044).
 */
export function previewObjectKey(packageId, version, iconPath) {
  return (
    `${ARTIFACTS_OUTPUT_DIR}/previews/${packageId}/` +
    `${sanitizeArtifactFileName(version)}/${path.basename(iconPath)}`
  );
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
      .map((entry) => normalizeVersionEntry(entry, packageTypeOfEntry(previousPackage)));
    if (versions.length > 0) {
      byPackage.set(previousPackage.name, versions);
    }
  }

  return byPackage;
}
