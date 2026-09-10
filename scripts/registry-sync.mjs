#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./lib/args.mjs";
import {
  REGISTRY_SYNC_TOKEN_VAR,
  REGISTRY_SYNC_URL_VAR,
  postPublicationIndex,
} from "./lib/registry-sync.mjs";

const FLAGS = {
  "--result": {
    key: "resultPath",
    takesValue: true,
    valueDescription: "a file path",
  },
  "--help": { key: "help" },
  "-h": { key: "help" },
};

function usage() {
  return [
    "Usage: registry-sync --result <file>",
    "",
    "Posts the publicationIndex recorded in a 'plugins.mjs publish' JSON",
    `result file to the Fluxta Plugin Registry's POST /v1/sync endpoint. Reads`,
    `the endpoint URL from ${REGISTRY_SYNC_URL_VAR} and the bearer token from`,
    `${REGISTRY_SYNC_TOKEN_VAR}.`,
    "",
    "The post is idempotent and carries the whole index rather than a delta, so",
    "this command runs after every successful publication regardless of whether",
    "the index changed since the last one. Unconfigured credentials, an",
    "unreachable Registry, and a non-200 response are all reported here and this",
    "command exits non-zero, but none of that is a reason to fail the publication",
    "itself, which already succeeded against R2 by the time this runs — invoke it",
    "with 'continue-on-error: true' (or equivalent) in CI.",
  ].join("\n");
}

function readPublicationIndex(resultPath, contents) {
  let result;
  try {
    result = JSON.parse(contents);
  } catch (error) {
    throw new Error(`'${resultPath}' is not valid JSON: ${error.message}`);
  }
  const index = result.publicationIndex;
  if (!index || typeof index !== "object" || !Array.isArray(index.packages)) {
    throw new Error(`'${resultPath}' carries no publicationIndex`);
  }
  return index;
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseCliArgs(argv, FLAGS);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!options.resultPath) {
    process.stderr.write("registry-sync requires --result <file>\n");
    return 2;
  }

  const resultPath = path.resolve(options.resultPath);
  let index;
  try {
    const contents = await readFile(resultPath, "utf8");
    index = readPublicationIndex(options.resultPath, contents);
  } catch (error) {
    process.stdout.write(
      `::warning::Plugin Registry sync skipped: could not read a publicationIndex from ` +
        `'${options.resultPath}': ${error.message}\n`,
    );
    return 1;
  }

  const outcome = await postPublicationIndex({
    url: process.env[REGISTRY_SYNC_URL_VAR],
    token: process.env[REGISTRY_SYNC_TOKEN_VAR],
    index,
  });

  const packageCount = index.packages.length;
  if (outcome.ok) {
    process.stdout.write(
      `Posted the Publication Index (${packageCount} package` +
        `${packageCount === 1 ? "" : "s"}) to the Fluxta Plugin Registry.\n`,
    );
    return 0;
  }

  process.stdout.write(
    `::warning::Plugin Registry sync failed (non-blocking; R2 stays authoritative): ` +
      `${outcome.reason}\n`,
  );
  return 1;
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
