import { readFile } from "node:fs/promises";
import path from "node:path";
import { isSemVer } from "@fluxta/cli/semver";
import { packageError, pathExists, stringOrNull } from "./shared.mjs";

export const PUBLICATION_STATE_FILE = "publication-state.json";
const VERSION_STATUSES = new Set(["published", "yanked", "unlisted"]);

/**
 * Loads and validates a package's publication-state.json, which marks already
 * published versions as yanked or unlisted. Returns the parsed state (or null
 * when absent/invalid) plus any package errors it produced.
 */
export async function loadPublicationState(sourcePackage) {
  const errors = [];
  const statePath = path.join(sourcePackage.absolutePath, PUBLICATION_STATE_FILE);

  if (!(await pathExists(statePath))) {
    return { state: null, errors };
  }

  let contents;
  try {
    contents = await readFile(statePath, "utf8");
  } catch (error) {
    errors.push(
      packageError(
        sourcePackage,
        "PUBLICATION_STATE_NOT_READABLE",
        PUBLICATION_STATE_FILE,
        `Could not read ${PUBLICATION_STATE_FILE}: ${error.message}`,
      ),
    );
    return { state: null, errors };
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        PUBLICATION_STATE_FILE,
        `${PUBLICATION_STATE_FILE} contains invalid JSON: ${error.message}`,
      ),
    );
    return { state: null, errors };
  }

  return { state: validatePublicationState(sourcePackage, parsed, errors), errors };
}

function validatePublicationState(sourcePackage, parsed, errors) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        PUBLICATION_STATE_FILE,
        `${PUBLICATION_STATE_FILE} must be a JSON object with 'package' and 'versions'.`,
      ),
    );
    return null;
  }

  if (parsed.package !== sourcePackage.id) {
    errors.push(
      packageError(
        sourcePackage,
        "PUBLICATION_STATE_PACKAGE_MISMATCH",
        "package",
        `${PUBLICATION_STATE_FILE} declares package '${parsed.package ?? null}' but the ` +
          `package id is '${sourcePackage.id}'. The state file must declare the package it ` +
          "belongs to.",
      ),
    );
    return null;
  }

  if (
    !parsed.versions ||
    typeof parsed.versions !== "object" ||
    Array.isArray(parsed.versions)
  ) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        "versions",
        `${PUBLICATION_STATE_FILE} must contain a 'versions' object mapping SemVer ` +
          "version strings to status entries.",
      ),
    );
    return null;
  }

  const entries = [];
  let valid = true;
  for (const [version, rawEntry] of Object.entries(parsed.versions)) {
    if (!isSemVer(version)) {
      errors.push(
        packageError(
          sourcePackage,
          "INVALID_PUBLICATION_STATE",
          `versions.${version}`,
          `Version key '${version}' in ${PUBLICATION_STATE_FILE} is not SemVer-compatible.`,
        ),
      );
      valid = false;
      continue;
    }

    const entry = validatePublicationStateEntry(sourcePackage, version, rawEntry, errors);
    if (entry) {
      entries.push(entry);
    } else {
      valid = false;
    }
  }

  return valid ? { package: sourcePackage.id, entries } : null;
}

function validatePublicationStateEntry(sourcePackage, version, rawEntry, errors) {
  if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        `versions.${version}`,
        `The entry for version '${version}' must be an object with 'status' and optional 'reason'.`,
      ),
    );
    return null;
  }

  const unknownKeys = Object.keys(rawEntry).filter((key) => key !== "status" && key !== "reason");
  if (unknownKeys.length > 0) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        `versions.${version}`,
        `The entry for version '${version}' declares unknown field` +
          `${unknownKeys.length === 1 ? "" : "s"} ` +
          `(${unknownKeys.map((key) => `'${key}'`).join(", ")}); only 'status' and 'reason' ` +
          "are allowed.",
      ),
    );
    return null;
  }

  if (!VERSION_STATUSES.has(rawEntry.status)) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        `versions.${version}.status`,
        `The entry for version '${version}' must declare 'status' as 'published', ` +
          "'yanked', or 'unlisted'.",
      ),
    );
    return null;
  }

  const reason = stringOrNull(rawEntry.reason);
  if (rawEntry.reason !== undefined && rawEntry.reason !== null && reason === null) {
    errors.push(
      packageError(
        sourcePackage,
        "INVALID_PUBLICATION_STATE",
        `versions.${version}.reason`,
        `The 'reason' for version '${version}' must be a non-empty string or null.`,
      ),
    );
    return null;
  }

  return { version, status: rawEntry.status, reason };
}
