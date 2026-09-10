import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPublisher, missingR2Credentials } from "../publisher.mjs";
import { parseBuildSnapshot } from "./build-snapshot.mjs";
import {
  INDEX_OBJECT_KEY,
  artifactMetadataFromIndex,
  serializePublicationIndex,
} from "./publication-index.mjs";
import { publishFailureResult } from "./results.mjs";
import { rootDirectoryErrors } from "./shared.mjs";
import { validateCheckout, validateFromSnapshot } from "./validate.mjs";

/**
 * Publish runs the same seam as validate, then writes the planned Plugin
 * Artifacts and the generated Publication Index through the configured
 * publisher. Every phase reports `{ abort, result }`: `abort: true` carries a
 * fully shaped result and stops the run; anything already written stays
 * written, but nothing further is attempted.
 */
export async function publishCheckout(options) {
  const rootDir = path.resolve(options.root);

  const rootErrors = await rootDirectoryErrors(rootDir);
  if (rootErrors.length > 0) {
    return publishFailureResult(rootDir, options.publisher, rootErrors);
  }

  const opened = openPublisher(options);
  if (opened.error) {
    return publishFailureResult(rootDir, opened.publisherName, [opened.error]);
  }
  const { publisher } = opened;

  const staged = await stagePreviousIndexFromPublisher(publisher);
  if (staged.error) {
    return publishFailureResult(rootDir, publisher.name, [staged.error]);
  }

  let validation;
  try {
    validation = await resolveValidation(rootDir, options, staged.indexPath);
  } catch (error) {
    return publishFailureResult(rootDir, publisher.name, [
      {
        code: "BUILD_SNAPSHOT_UNREADABLE",
        message:
          `Could not read the build snapshot '${options.fromSnapshotPath}': ${error.message}`,
      },
    ]);
  } finally {
    await removeTempDir(staged.cleanupDir);
  }

  const publication = emptyPublication(publisher.name, staged.previousIndexSource);
  const run = { rootDir, publisher, validation, publication, networkWrites: [] };

  if (!validation.ok) {
    publication.notes.push("No objects were written: validation failed.");
    return finish(run);
  }

  // Refuse any conflicting existing artifact before uploading anything, so an
  // aborted publication leaves the store untouched.
  const classified = await classifyAgainstExistingObjects(run);
  if (classified.abort) {
    return classified.result;
  }
  if (publication.refusals.length > 0) {
    publication.notes.push(
      `Publication aborted before any upload: ${publication.refusals.length} ` +
        "existing artifact object(s) refused overwrite.",
    );
    return finish(run);
  }

  const uploaded = await uploadArtifactWrites(run, classified.writes);
  if (uploaded.abort) {
    return uploaded.result;
  }

  const indexed = await writePublicationIndex(run);
  return indexed.abort ? indexed.result : finish(run);
}

/**
 * `--from-snapshot` recombines a checkout that was already built by an
 * earlier, credential-free `build` step with real publication history,
 * without running any Plugin Source Package code in this (credentialed)
 * process. Without it, `publish` builds the checkout itself, unchanged from
 * before this flag existed — used by the `fake` publisher for local testing.
 */
async function resolveValidation(rootDir, options, previousIndexPath) {
  if (options.fromSnapshotPath) {
    const contents = await readFile(path.resolve(options.fromSnapshotPath), "utf8");
    const snapshot = parseBuildSnapshot(contents);
    return validateFromSnapshot(rootDir, snapshot, { ...options, previousIndexPath });
  }
  return validateCheckout({ ...options, previousIndexPath });
}

function openPublisher(options) {
  try {
    return { publisher: createPublisher(options.publisher, {
      stateDir: options.stateDir,
      env: process.env,
    }) };
  } catch (error) {
    const missing = missingR2Credentials(process.env);
    if (options.publisher === "r2" && missing.length > 0) {
      return {
        publisherName: "r2",
        error: {
          code: "PUBLISH_CREDENTIALS_MISSING",
          message:
            "R2 publishing requires environment variables " +
            missing.map((name) => `'${name}'`).join(", ") +
            ". They are only available to main-branch publication CI; pull " +
            "request validation never needs them.",
        },
      };
    }
    return {
      publisherName: options.publisher,
      error: { code: "INVALID_PUBLISHER", message: error.message },
    };
  }
}

/**
 * Downloads the previously published Publication Index from the publisher into
 * a temporary file so validate can diff against real published history. The
 * caller removes the file once validation finishes.
 */
async function stagePreviousIndexFromPublisher(publisher) {
  const existing = await publisherRead(publisher, INDEX_OBJECT_KEY);
  if (existing.error) {
    return { error: existing.error };
  }

  if (!existing.object) {
    return {
      indexPath: null,
      cleanupDir: null,
      previousIndexSource: `publisher '${publisher.name}' (no index yet)`,
    };
  }

  try {
    const cleanupDir = await mkdtemp(path.join(tmpdir(), "plugins-publish-"));
    const indexPath = path.join(cleanupDir, INDEX_OBJECT_KEY);
    await writeFile(indexPath, existing.object.bytes);
    return {
      indexPath,
      cleanupDir,
      previousIndexSource: `publisher '${publisher.name}' (${INDEX_OBJECT_KEY})`,
    };
  } catch (error) {
    return {
      error: {
        code: "PREVIOUS_INDEX_UNREADABLE",
        message: `Could not stage the previous Publication Index: ${error.message}`,
      },
    };
  }
}

async function removeTempDir(cleanupDir) {
  if (!cleanupDir) {
    return;
  }
  await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Reads every planned artifact object from the store, recording a refusal for
 * each one that already exists with different content. Existing objects with
 * identical content pass through as no-op uploads.
 */
async function classifyAgainstExistingObjects(run) {
  const { publisher, publication, validation } = run;
  const writes = [];

  for (const write of validation.publicationPlan.artifactWrites) {
    const existing = await publisherRead(publisher, write.objectKey);
    if (existing.error) {
      return { abort: true, result: failPublication(run, [existing.error]) };
    }
    if (existing.object && existing.object.checksum !== write.checksum) {
      publication.refusals.push(
        overwriteRefusal(
          write,
          `Object '${write.objectKey}' already exists with different content ` +
            `(existing ${existing.object.checksum}, planned ${write.checksum}).`,
        ),
      );
    }
    writes.push({ write, existing: existing.object });
  }

  return { abort: false, writes };
}

async function uploadArtifactWrites(run, classified) {
  const { rootDir, publisher, publication, validation, networkWrites } = run;

  for (const { write, existing } of classified) {
    const metadata =
      artifactMetadataFromIndex(validation.publicationIndex, write.package, write.version) ?? {};

    if (existing) {
      publication.alreadyPublished.push({ ...write, ...metadata });
      publication.notes.push(
        `Object '${write.objectKey}' already exists with identical content ` +
          `(${write.checksum}); nothing to overwrite.`,
      );
      continue;
    }

    let bytes;
    try {
      bytes = await readFile(path.join(rootDir, write.artifact));
    } catch (error) {
      return {
        abort: true,
        result: failPublication(run, [
          {
            code: "ARTIFACT_READ_FAILED",
            message: `Could not read the built Plugin Artifact '${write.artifact}': ${error.message}`,
          },
        ]),
      };
    }

    const put = await publisherPutIfAbsent(publisher, write.objectKey, bytes);
    if (put.error) {
      return { abort: true, result: failPublication(run, [put.error]) };
    }
    if (put.status === "written") {
      publication.artifactWrites.push({ ...write, ...metadata });
      networkWrites.push({
        objectKey: write.objectKey,
        size: write.size,
        checksum: write.checksum,
      });
      publication.notes.push(`Published Plugin Artifact '${write.objectKey}' (${write.checksum}).`);
      continue;
    }

    // Another process created the object between our check and our write.
    // Accept it only when it is byte-identical to what we planned.
    const raced = await publisherRead(publisher, write.objectKey);
    if (raced.error) {
      return { abort: true, result: failPublication(run, [raced.error]) };
    }
    if (raced.object && raced.object.checksum === write.checksum) {
      publication.alreadyPublished.push({ ...write, ...metadata });
      publication.notes.push(
        `Object '${write.objectKey}' appeared during publication with identical ` +
          `content (${write.checksum}); recorded as already published.`,
      );
      continue;
    }

    publication.refusals.push(
      overwriteRefusal(
        write,
        `Object '${write.objectKey}' appeared during publication with different ` +
          `content (${raced.object?.checksum ?? "unknown"}, planned ${write.checksum}).`,
      ),
    );
    publication.notes.push(
      `Refused to overwrite existing object '${write.objectKey}' with different content.`,
    );
    return { abort: true, result: finish(run) };
  }

  return { abort: false };
}

async function writePublicationIndex(run) {
  const { publisher, publication, validation, networkWrites } = run;
  const plannedWrites = validation.publicationPlan.indexWrites;

  if (plannedWrites.length === 0) {
    publication.notes.push("No Publication Index write planned; nothing to publish.");
    return { abort: false };
  }

  const planned = plannedWrites[0];
  const indexBytes = Buffer.from(
    serializePublicationIndex(validation.publicationIndex),
    "utf8",
  );

  const existing = await publisherRead(publisher, planned.objectKey);
  if (existing.error) {
    return { abort: true, result: failPublication(run, [existing.error]) };
  }
  if (existing.object && existing.object.checksum === planned.checksum) {
    publication.indexWrite = { ...planned, skipped: true, reason: "already current" };
    publication.notes.push(
      "Publication Index 'publication-index.json' is already current; not rewritten.",
    );
    return { abort: false };
  }

  const put = await publisherWrite(publisher, planned.objectKey, indexBytes);
  if (put.error) {
    return { abort: true, result: failPublication(run, [put.error]) };
  }
  publication.indexWrite = { ...planned, skipped: false };
  networkWrites.push({
    objectKey: planned.objectKey,
    size: planned.size,
    checksum: planned.checksum,
  });
  publication.notes.push("Wrote the generated Publication Index 'publication-index.json'.");
  return { abort: false };
}

const IMMUTABLE_ARTIFACT_RULE =
  "An existing Plugin Artifact for the same (manifest.name, manifest.version) " +
  "is never overwritten.";

function overwriteRefusal(write, reason) {
  return {
    package: write.package,
    version: write.version,
    objectKey: write.objectKey,
    reason: `${reason} ${IMMUTABLE_ARTIFACT_RULE}`,
  };
}

function emptyPublication(publisherName, previousIndexSource) {
  return {
    schemaVersion: 1,
    publisher: publisherName,
    previousIndexSource,
    artifactWrites: [],
    alreadyPublished: [],
    refusals: [],
    indexWrite: null,
    errors: [],
    notes: [],
  };
}

function finish(run) {
  const { validation, publisher, publication, networkWrites } = run;
  const notes =
    publication.notes.length > 0
      ? publication.notes
      : [
          "Publish mode: Plugin Artifacts and the generated Publication Index were " +
            "written through the configured publisher.",
        ];
  return {
    ...validation,
    ok:
      validation.ok && publication.refusals.length === 0 && publication.errors.length === 0,
    mode: "publish",
    dryRun: false,
    publisher: publisher.name,
    publicationPlan: {
      ...validation.publicationPlan,
      mode: "publish",
      networkWrites,
      notes,
    },
    publication,
  };
}

function failPublication(run, errors) {
  run.publication.errors.push(...errors);
  run.publication.notes.push(
    errors.map((error) => `${error.code}: ${error.message}`).join(" "),
  );
  return finish(run);
}

async function publisherRead(publisher, objectKey) {
  try {
    return { object: await publisher.getObject(objectKey), error: null };
  } catch (error) {
    return { object: null, error: publisherError(publisher, "read", objectKey, error) };
  }
}

async function publisherWrite(publisher, objectKey, bytes) {
  try {
    return { written: await publisher.putObject(objectKey, bytes), error: null };
  } catch (error) {
    return { written: null, error: publisherError(publisher, "write", objectKey, error) };
  }
}

async function publisherPutIfAbsent(publisher, objectKey, bytes) {
  try {
    const outcome = await publisher.putObjectIfAbsent(objectKey, bytes);
    return outcome.refused
      ? { status: "exists", error: null }
      : { status: "written", error: null };
  } catch (error) {
    return { status: null, error: publisherError(publisher, "write", objectKey, error) };
  }
}

function publisherError(publisher, operation, objectKey, error) {
  return {
    code: "PUBLISHER_ERROR",
    message: `Publisher '${publisher.name}' could not ${operation} '${objectKey}': ${error.message}`,
  };
}
