#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isoTimestampFlag, parseCliArgs } from "./lib/args.mjs";
import { serializeBuildSnapshot } from "./lib/build-snapshot.mjs";
import { publishCheckout } from "./lib/publish.mjs";
import { OUTPUT_SCHEMA_VERSION, failureResult, publishFailureResult } from "./lib/results.mjs";
import { buildCheckout, validateCheckout } from "./lib/validate.mjs";

const FLAGS = {
  "--root": {
    key: "root",
    takesValue: true,
    valueDescription: "a directory path",
  },
  "--previous-index": {
    key: "previousIndexPath",
    takesValue: true,
    valueDescription: "a file path",
  },
  "--source-commit": {
    key: "sourceCommit",
    takesValue: true,
    valueDescription: "a commit sha",
  },
  "--published-at": isoTimestampFlag("--published-at"),
  "--publisher": {
    key: "publisher",
    takesValue: true,
    valueDescription: "a publisher kind",
  },
  "--state-dir": {
    key: "stateDir",
    takesValue: true,
    valueDescription: "a directory path",
  },
  "--out": {
    key: "out",
    takesValue: true,
    valueDescription: "a file path",
  },
  "--from-snapshot": {
    key: "fromSnapshotPath",
    takesValue: true,
    valueDescription: "a file path",
  },
  "--json": { key: "json" },
  "--pretty": { key: "pretty" },
  "--help": { key: "help" },
  "-h": { key: "help" },
};

function usage() {
  return [
    "Usage: plugins validate [--root <dir>] [--json] [--pretty]",
    "                                    [--previous-index <file>] [--source-commit <sha>]",
    "                                    [--published-at <iso-timestamp>]",
    "",
    "Usage: plugins build [--root <dir>] [--json] [--pretty] --out <file>",
    "",
    "Usage: plugins publish [--root <dir>] [--json] [--pretty]",
    "                                 [--source-commit <sha>]",
    "                                 [--published-at <iso-timestamp>]",
    "                                 [--from-snapshot <file>] [--out <file>]",
    "                                 --publisher <fake|r2> [--state-dir <dir>]",
    "",
    "validate runs the repository validation seam in validate-only mode: it",
    "validates the current checkout and produces a dry-run Publication Index and",
    "publication plan. --previous-index supplies already-published versions from a",
    "previously generated Publication Index; --source-commit and --published-at",
    "override the source commit and planned publication timestamp recorded for",
    "newly built Plugin Artifacts. Per-package publication-state.json files mark",
    "published versions as yanked or unlisted and are discovered from the checkout.",
    "This command performs no network writes and requires no R2 credentials.",
    "",
    "build runs only the discovery and build phase of the same seam: CODEOWNERS,",
    "per-package static validation and ownership, then each package's own",
    "'pnpm install'/'pnpm run build'. It is the only command that executes",
    "Plugin Source Package-owned code, so it requires no R2 credentials and",
    "writes a build snapshot to --out on success. publish --from-snapshot reads",
    "that snapshot instead of building the checkout itself, so a CI job holding",
    "R2 credentials never has to run code a Plugin Source Package controls.",
    "",
    "publish runs the same seam in publish mode: it validates the checkout, then",
    "writes new Plugin Artifact zip objects and the generated Publication Index",
    "through the configured publisher, refusing to overwrite existing artifact",
    "objects for the same (manifest.name, manifest.version). The previously",
    "published Publication Index is read from the publisher itself, so all-version",
    "history and yanked or unlisted state are preserved. --publisher selects the",
    "publisher seam: 'fake' records intended writes in memory or under --state-dir",
    "without any network access, while 'r2' writes to Cloudflare R2 using the",
    "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET",
    "environment variables (R2_ENDPOINT overrides the S3-compatible endpoint for",
    "local testing). --from-snapshot <file> takes packages, errors, and per-package",
    "publication state from a snapshot written by 'build' instead of building the",
    "checkout in this process. --out <file> additionally writes the full JSON",
    "result there (regardless of --json/--pretty), for a later step — such as",
    "registry-sync.mjs, which reads its publicationIndex — to consume without",
    "re-parsing stdout.",
  ].join("\n");
}

function defaultOptions(command) {
  return {
    command,
    root: process.cwd(),
    json: false,
    pretty: false,
    help: false,
    previousIndexPath: null,
    sourceCommit: null,
    publishedAt: null,
    publisher: null,
    stateDir: null,
    out: null,
    fromSnapshotPath: null,
  };
}

function printJson(result, pretty) {
  process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
}

function argumentFailure(code, message) {
  printJson(failureResult(process.cwd(), [
    { code, message },
  ]), true);
  return 2;
}

function publishArgumentFailure(options, publisherName, message) {
  const result = publishFailureResult(path.resolve(options.root), publisherName, [
    { code: "INVALID_ARGUMENTS", message },
  ]);
  printJson(result, options.pretty || !options.json);
  return 2;
}

/**
 * Runs only the build phase (see `buildCheckout`) and, on success, writes a
 * build snapshot to --out for `publish --from-snapshot` to consume later in a
 * separate, credentialed process. Never touches a publisher or R2.
 */
async function runBuild(options) {
  const rootDir = path.resolve(options.root);
  const built = await buildCheckout(rootDir);
  const errors =
    built.rootErrors.length > 0 ? built.rootErrors : [...built.codeownersErrors, ...built.buildErrors];
  const ok = errors.length === 0;

  if (ok) {
    const outPath = path.resolve(options.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(
      outPath,
      serializeBuildSnapshot({
        packages: built.packages,
        errors,
        publicationStates: built.publicationStates,
      }),
    );
  }

  printJson(
    {
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      ok,
      mode: "build",
      root: rootDir,
      packages: built.packages,
      validation: { errors, warnings: [] },
    },
    options.pretty || !options.json,
  );
  return ok ? 0 : 1;
}

export async function run(argv = process.argv.slice(2)) {
  let options;

  try {
    const [command, ...rest] = argv;
    options = { ...defaultOptions(command), ...parseCliArgs(rest, FLAGS) };
  } catch (error) {
    return argumentFailure("INVALID_ARGUMENTS", error.message);
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (options.command === "validate") {
    const result = await validateCheckout(options);
    printJson(result, options.pretty || !options.json);
    return result.ok ? 0 : 1;
  }

  if (options.command === "build") {
    if (!options.out) {
      return argumentFailure(
        "INVALID_ARGUMENTS",
        "build requires --out <file> to write the build snapshot.",
      );
    }
    return runBuild(options);
  }

  if (options.command === "publish") {
    if (!options.publisher) {
      return publishArgumentFailure(
        options,
        null,
        "publish requires --publisher <fake|r2> to select the publisher seam.",
      );
    }
    if (options.previousIndexPath) {
      return publishArgumentFailure(
        options,
        options.publisher,
        "publish always reads the previous Publication Index from the publisher " +
          "itself; use validate --previous-index to preview against a file.",
      );
    }
    const result = await publishCheckout(options);
    if (options.out) {
      const outPath = path.resolve(options.out);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(result, null, 2));
    }
    printJson(result, options.pretty || !options.json);
    return result.ok ? 0 : 1;
  }

  return argumentFailure(
    "UNKNOWN_COMMAND",
    options.command
      ? `Unknown command: ${options.command}`
      : "Missing command: expected validate, build, or publish",
  );
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
