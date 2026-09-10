import { emptyPublicationIndex } from "./publication-index.mjs";

export const OUTPUT_SCHEMA_VERSION = 1;

export function emptyPublicationPlan({ mode = "dry-run", notes } = {}) {
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    mode,
    networkWrites: [],
    artifactWrites: [],
    indexWrites: [],
    recommendations: [],
    notes:
      notes ??
      [
        "Dry-run mode: locally built Plugin Artifacts and the generated Publication " +
          "Index are recorded as planned writes; nothing is published and no " +
          "Cloudflare R2 credentials are used.",
      ],
  };
}

/** The validate-mode result envelope used when the checkout cannot be read. */
export function failureResult(rootDir, errors) {
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    ok: false,
    mode: "validate",
    dryRun: true,
    root: rootDir,
    packages: [],
    validation: {
      errors,
      warnings: [],
    },
    publicationIndex: emptyPublicationIndex(),
    publicationPlan: emptyPublicationPlan(),
  };
}

/** The publish-mode result envelope used before anything could be written. */
export function publishFailureResult(rootDir, publisherName, errors) {
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    ok: false,
    mode: "publish",
    dryRun: false,
    root: rootDir,
    publisher: publisherName,
    packages: [],
    validation: {
      errors,
      warnings: [],
    },
    publicationIndex: emptyPublicationIndex(),
    publicationPlan: {
      ...emptyPublicationPlan({ mode: "publish", notes: ["No objects were written."] }),
    },
    publication: {
      schemaVersion: 1,
      publisher: publisherName,
      previousIndexSource: null,
      artifactWrites: [],
      alreadyPublished: [],
      refusals: [],
      indexWrite: null,
      notes: ["No objects were written."],
    },
  };
}
