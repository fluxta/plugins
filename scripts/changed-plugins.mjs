#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./lib/args.mjs";
import { discoverPluginSourcePackages } from "./lib/validate.mjs";
import { runProcess } from "./process.mjs";

// Paths outside plugins/ that can affect every plugin's build or publish
// outcome. A change here means every plugin needs a full rebuild, not just
// whichever plugin directories the diff happens to name.
const SHARED_PATH_PATTERNS = [
  /^scripts\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.github\/workflows\/publish\.yml$/,
];

const ZERO_SHA = "0000000000000000000000000000000000000000";

const FLAGS = {
  "--root": { key: "root", takesValue: true, valueDescription: "a directory path" },
  "--before": { key: "before", takesValue: true, valueDescription: "a git commit sha" },
  "--after": { key: "after", takesValue: true, valueDescription: "a git commit sha" },
  "--out": { key: "out", takesValue: true, valueDescription: "a file path" },
  "--github-output": {
    key: "githubOutput",
    takesValue: true,
    valueDescription: "a file path (normally $GITHUB_OUTPUT)",
  },
  "--json": { key: "json" },
  "--pretty": { key: "pretty" },
  "--help": { key: "help" },
  "-h": { key: "help" },
};

function usage() {
  return [
    "Usage: changed-plugins --root <dir> --before <sha> --after <sha>",
    "                        [--out <file>] [--github-output <file>] [--json] [--pretty]",
    "",
    "Diffs --before..--after and decides which Plugin Source Packages a CI run",
    "should build and publish, so a push that never touches plugins/ does not",
    "rebuild and re-publish every package in the checkout.",
    "",
    "mode 'none' — nothing relevant changed; the caller should skip build and",
    "publish entirely.",
    "mode 'full' — a change outside plugins/ could affect every package (this",
    "repository's own scripts/, the lockfile, or the publish workflow itself),",
    "or --before cannot be diffed at all (first push, force-push, or history",
    "rewrite); the caller should build and publish every package, same as",
    "passing no --only.",
    "mode 'only' — every changed path is under plugins/; the caller should",
    "pass the reported plugin IDs as build --only. A changed path for a plugin",
    "directory that no longer exists (the plugin was deleted) is dropped",
    "rather than reported, since there is nothing left to build for it.",
    "",
    "--github-output additionally appends 'run=' and 'only=' lines in",
    "$GITHUB_OUTPUT format to the given file.",
  ].join("\n");
}

function defaultOptions() {
  return {
    root: process.cwd(),
    before: null,
    after: null,
    out: null,
    githubOutput: null,
    json: false,
    pretty: false,
    help: false,
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Decides the build scope for one push, given the full list of changed paths
 * (relative to the repository root, forward-slash separated — the shape
 * `git diff --name-only` reports) and the plugin IDs that currently exist on
 * disk. Kept separate from git and file I/O so the decision itself is
 * trivially unit-testable.
 */
export function decideChangeScope(changedPaths, existingPluginIds) {
  if (changedPaths.length === 0) {
    return { mode: "none", only: [], reason: "no files changed" };
  }

  const touchesSharedTooling = changedPaths.some((changedPath) =>
    SHARED_PATH_PATTERNS.some((pattern) => pattern.test(changedPath)),
  );
  if (touchesSharedTooling) {
    return {
      mode: "full",
      only: [],
      reason: "a change outside plugins/ could affect every plugin: building every plugin",
    };
  }

  const existingIds = new Set(existingPluginIds);
  const touchedIds = new Set();
  for (const changedPath of changedPaths) {
    const match = /^plugins\/([^/]+)\//.exec(changedPath);
    if (match && existingIds.has(match[1])) {
      touchedIds.add(match[1]);
    }
  }

  if (touchedIds.size === 0) {
    return {
      mode: "none",
      only: [],
      reason: "changed files do not touch any existing plugin or shared build tooling",
    };
  }

  const only = [...touchedIds].sort();
  return { mode: "only", only, reason: `plugin(s) changed: ${only.join(", ")}` };
}

async function commitExists(rootDir, sha) {
  const result = await runProcess("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: rootDir });
  return result.code === 0;
}

async function diffChangedPaths(rootDir, before, after) {
  const result = await runProcess("git", ["diff", "--name-only", before, after], {
    cwd: rootDir,
  });
  if (result.code !== 0) {
    throw new Error(`git diff '${before}..${after}' failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function resolveScope(rootDir, before, after) {
  if (!isNonEmptyString(before) || before === ZERO_SHA || !(await commitExists(rootDir, before))) {
    return {
      mode: "full",
      only: [],
      reason:
        "no comparable previous commit (first push, force-push, or history rewrite): " +
        "building every plugin",
    };
  }

  const changedPaths = await diffChangedPaths(rootDir, before, after);
  const discovered = await discoverPluginSourcePackages(rootDir);
  return decideChangeScope(changedPaths, discovered.map((pkg) => pkg.id));
}

async function writeGithubOutput(githubOutputPath, scope) {
  if (!githubOutputPath) {
    return;
  }
  const lines = [
    `run=${scope.mode === "none" ? "false" : "true"}`,
    `mode=${scope.mode}`,
    `only=${scope.only.join(",")}`,
    "",
  ];
  await appendFile(githubOutputPath, lines.join("\n"));
}

function printJson(result, pretty) {
  process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = { ...defaultOptions(), ...parseCliArgs(argv, FLAGS) };
  } catch (error) {
    printJson({ ok: false, errors: [{ code: "INVALID_ARGUMENTS", message: error.message }] }, true);
    return 2;
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!isNonEmptyString(options.after)) {
    printJson(
      { ok: false, errors: [{ code: "INVALID_ARGUMENTS", message: "--after <sha> is required" }] },
      true,
    );
    return 2;
  }

  const rootDir = path.resolve(options.root);
  const scope = await resolveScope(rootDir, options.before, options.after);
  const result = {
    schemaVersion: 1,
    ok: true,
    root: rootDir,
    before: options.before ?? null,
    after: options.after,
    ...scope,
    run: scope.mode !== "none",
  };

  if (options.out) {
    const outPath = path.resolve(options.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(result, null, 2));
  }
  await writeGithubOutput(options.githubOutput, scope);

  printJson(result, options.pretty || !options.json);
  return 0;
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
