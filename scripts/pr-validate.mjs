#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "./process.mjs";
import { parseCliArgs } from "./lib/args.mjs";
import { INDEX_OBJECT_KEY } from "./lib/publication-index.mjs";
import { REGISTRY_SYNC_TOKEN_VAR } from "./lib/registry-sync.mjs";
import { R2_ENV_VARS } from "./publisher.mjs";

export const CREDENTIAL_ENV_VARS = [
  ...R2_ENV_VARS,
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  REGISTRY_SYNC_TOKEN_VAR,
];

const FLAGS = {
  "--root": {
    key: "root",
    takesValue: true,
    valueDescription: "a directory path",
  },
  "--base-ref": {
    key: "baseRef",
    takesValue: true,
    valueDescription: "a git ref name",
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
  "--help": { key: "help" },
  "-h": { key: "help" },
};

function usage() {
  return [
    "Usage: pr-validate [--root <dir>] [--base-ref <ref>] [--previous-index <file>]",
    "                    [--source-commit <sha>]",
    "",
    "Runs the repository validation seam in validate-only mode for pull request CI,",
    "prints a package-scoped report, and fails when validation fails. The command",
    "performs no network writes and requires no Cloudflare R2 credentials.",
    "--base-ref supplies already-published versions from the base branch's",
    "publication-index.json; --previous-index points at a local Publication Index",
    "file instead.",
  ].join("\n");
}

function defaultOptions() {
  return {
    root: process.cwd(),
    baseRef: null,
    previousIndexPath: null,
    sourceCommit: null,
    help: false,
  };
}

function presentCredentials() {
  return CREDENTIAL_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return value !== undefined && value !== "";
  });
}

function indent(text, prefix) {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

async function resolvePreviousIndex(rootDir, options) {
  if (options.previousIndexPath) {
    return {
      source: `file ${options.previousIndexPath}`,
      path: path.resolve(rootDir, options.previousIndexPath),
      cleanupDir: null,
      error: null,
    };
  }

  if (options.baseRef) {
    const resolvedRef = await runProcess(
      "git",
      ["rev-parse", "--verify", "--quiet", `${options.baseRef}^{commit}`],
      { cwd: rootDir },
    );
    if (resolvedRef.code !== 0) {
      return {
        source: `git ref '${options.baseRef}'`,
        path: null,
        cleanupDir: null,
        error: `base ref '${options.baseRef}' does not resolve to a commit`,
      };
    }

    const result = await runProcess(
      "git",
      ["show", `${options.baseRef}:${INDEX_OBJECT_KEY}`],
      { cwd: rootDir },
    );
    if (result.code === 0 && result.stdout.trim().length > 0) {
      const dir = await mkdtemp(path.join(tmpdir(), "plugins-previous-"));
      const target = path.join(dir, INDEX_OBJECT_KEY);
      await writeFile(target, result.stdout);
      return {
        source: `git ref '${options.baseRef}' (${INDEX_OBJECT_KEY})`,
        path: target,
        cleanupDir: dir,
        error: null,
      };
    }
    return {
      source: `git ref '${options.baseRef}' has no ${INDEX_OBJECT_KEY}`,
      path: null,
      cleanupDir: null,
      error: null,
    };
  }

  return { source: "none", path: null, cleanupDir: null, error: null };
}

function renderReport(rootDir, publicationStateSource, sourceCommit, credentialNames, output) {
  const lines = [];
  lines.push("plugins pull-request validation");
  lines.push("mode: validate (dry-run)");
  lines.push(`root: ${rootDir}`);
  lines.push(`publication state: ${publicationStateSource}`);
  lines.push(`source commit: ${sourceCommit ?? "none"}`);
  lines.push("");
  lines.push("Packages:");
  for (const pkg of output.packages) {
    const version = pkg.manifest?.version ?? "-";
    const change = pkg.change ? ` change: ${pkg.change.kind}` : "";
    lines.push(`  [${pkg.status === "valid" ? "ok" : "invalid"}] ${pkg.id} ${version}${change}`);
  }
  lines.push("");

  const errors = output.validation.errors;
  if (errors.length > 0) {
    lines.push("Errors:");
    const errorsByPackage = new Map();
    for (const error of errors) {
      const group = error.package ?? "(repository)";
      const bucket = errorsByPackage.get(group) ?? [];
      bucket.push(error);
      errorsByPackage.set(group, bucket);
    }
    for (const [group, groupedErrors] of errorsByPackage) {
      for (const error of groupedErrors) {
        const field = error.field ? ` (${error.field})` : "";
        lines.push(`  ${group} [${error.code}]${field}`);
        lines.push(
          ...indent(error.message, "      ").split("\n"),
        );
      }
    }
    lines.push("");
  }

  const plan = output.publicationPlan;
  const recommendations = plan.recommendations
    .map((entry) => `${entry.package} -> ${entry.latestVersion}`)
    .join(", ");
  lines.push("Publication plan (dry-run):");
  lines.push(`  planned artifact writes: ${plan.artifactWrites.length}`);
  for (const write of plan.artifactWrites) {
    lines.push(
      `    ${write.package} ${write.version} -> ${write.artifact} (${write.checksum})`,
    );
  }
  lines.push(
    `  planned index write: ${
      plan.indexWrites.length === 0 ? "none" : plan.indexWrites.map((entry) => entry.objectKey).join(", ")
    }`,
  );
  lines.push(`  recommendations: ${recommendations.length === 0 ? "none" : recommendations}`);
  lines.push("");

  lines.push("Guards:");
  lines.push(
    `  no Cloudflare R2 credentials present: ${
      credentialNames.length === 0 ? "PASS" : `FAIL (${credentialNames.join(", ")})`
    }`,
  );
  lines.push(
    `  no network writes planned (validate-only): ${
      plan.networkWrites.length === 0 ? "PASS" : "FAIL"
    }`,
  );
  lines.push("");

  return lines;
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = { ...defaultOptions(), ...parseCliArgs(argv, FLAGS) };
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const seamPath = path.join(scriptDir, "plugins.mjs");
  const rootDir = path.resolve(options.root);

  const previous = await resolvePreviousIndex(rootDir, options);

  let seam;
  let cleanupError = null;
  try {
    const seamArgs = ["validate", "--root", rootDir, "--json"];
    if (previous.path) {
      seamArgs.push("--previous-index", previous.path);
    }
    if (options.sourceCommit) {
      seamArgs.push("--source-commit", options.sourceCommit);
    }
    seam = await runProcess(process.execPath, [seamPath, ...seamArgs]);
  } finally {
    if (previous.cleanupDir) {
      try {
        await rm(previous.cleanupDir, { recursive: true, force: true });
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (cleanupError) {
    process.stderr.write(`pr-validate could not clean up: ${cleanupError.message}\n`);
    return 1;
  }

  let output;
  try {
    output = JSON.parse(seam.stdout);
  } catch (error) {
    process.stderr.write(
      `pr-validate could not read the validation seam output: ${error.message}\n`,
    );
    return 1;
  }

  const credentialNames = presentCredentials();
  const report = renderReport(
    rootDir,
    previous.source,
    options.sourceCommit,
    credentialNames,
    output,
  );
  const networkWritesPlanned = output.publicationPlan.networkWrites.length > 0;

  const pass =
    output.ok &&
    credentialNames.length === 0 &&
    !networkWritesPlanned &&
    previous.error === null;
  if (pass) {
    report.push("RESULT: PASSED");
  } else {
    const errorCount = output.validation.errors.length;
    const packageCount = new Set(
      output.validation.errors
        .map((error) => error.package)
        .filter((packageId) => packageId !== undefined),
    ).size;
    const guardFailures = [
      previous.error ?? null,
      credentialNames.length > 0 ? "credentials present" : null,
      networkWritesPlanned ? "network writes planned" : null,
    ].filter((failure) => failure !== null);
    const summary = guardFailures.length > 0
      ? `guard failures: ${guardFailures.join(", ")}`
      : `${errorCount} error${errorCount === 1 ? "" : "s"} across ${packageCount} package${packageCount === 1 ? "" : "s"}`;
    report.push(`RESULT: FAILED (${summary})`);
  }

  process.stdout.write(`${report.join("\n")}\n`);
  return pass ? 0 : 1;
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
