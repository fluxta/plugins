#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSemVer } from "@fluxta/cli/semver";
import { runTrustedRepoMigration } from "@fluxta/cli/migration";
import { parseCliArgs } from "./lib/args.mjs";
import {
  createCatalogMigration,
  mergeOutcomes,
  migrationBranchName,
  planMigration,
} from "./lib/migrate.mjs";
import { discoverPluginSourcePackages } from "./lib/validate.mjs";
import { runProcess } from "./process.mjs";
import { tail } from "./lib/shared.mjs";

const BUMP_KINDS = new Set(["patch", "minor", "major"]);

const FLAGS = {
  "--root": { key: "root", takesValue: true, valueDescription: "a directory path" },
  "--dependency": {
    key: "dependency",
    takesValue: true,
    valueDescription: "an npm package name",
  },
  "--version": { key: "version", takesValue: true, valueDescription: "a SemVer version" },
  "--bump": {
    key: "bump",
    takesValue: true,
    valueDescription: "patch, minor, or major",
    validate: (value) => {
      if (!BUMP_KINDS.has(value)) {
        throw new Error("--bump must be one of patch, minor, major");
      }
    },
  },
  "--only": {
    key: "only",
    takesValue: true,
    valueDescription: "a comma-separated list of plugin IDs",
  },
  "--branch": { key: "branch", takesValue: true, valueDescription: "a git branch name" },
  "--base": { key: "base", takesValue: true, valueDescription: "a git branch name" },
  "--dry-run": { key: "dryRun" },
  "--verify": { key: "verify" },
  "--push": { key: "push" },
  "--open-pr": { key: "openPr" },
  "--allow-failures": { key: "allowFailures" },
  "--json": { key: "json" },
  "--pretty": { key: "pretty" },
  "--help": { key: "help" },
  "-h": { key: "help" },
};

function usage() {
  return [
    "Usage: migrate --dependency <name> --version <semver> [--root <dir>]",
    "               [--bump patch|minor|major] [--only <ids>] [--branch <name>]",
    "               [--base <name>] [--dry-run] [--verify] [--push] [--open-pr]",
    "               [--allow-failures] [--json] [--pretty]",
    "",
    "Runs a Trusted-Repo Migration across this checkout: for every",
    "Plugin Source Package that takes <name> through its own pnpm catalog, the",
    "catalog entry is bumped to <semver>, the package's lockfile is refreshed,",
    "its manifest.version is bumped, and the package is committed on its own —",
    "one commit per package, so every touched package still earns its own",
    "immutable published version. @fluxta/cli owns the version bump, the",
    "publish-origin marker, and the commits; this command owns the dependency",
    "edit, the branch, and the pull request.",
    "",
    "The version lives in plugins/<name>/pnpm-workspace.yaml's 'catalog:' block,",
    "which sub-packages reference as \"catalog:\". A package that names the",
    "dependency anywhere else is reported as failed rather than skipped: CI",
    "builds with 'pnpm install --frozen-lockfile', so a package this command",
    "cannot update needs a person, not silence.",
    "",
    "--bump applies to every package the run migrates (default: patch). It is",
    "one kind per run; to give different packages different bumps, run the",
    "command again on the same branch with --only and another --bump — the",
    "commits accumulate and one pull request covers them all.",
    "",
    "--dry-run reports what the run would do and writes nothing, touching",
    "neither git nor the lockfiles. --verify additionally runs the repository",
    "validation seam over the migrated packages, which is what pull request CI",
    "would do anyway, just sooner.",
    "",
    "--push pushes the branch; --open-pr pushes it and opens the pull request",
    "through 'gh'. Neither runs when a package failed, unless",
    "--allow-failures says the run may proceed without it.",
  ].join("\n");
}

function defaultOptions() {
  return {
    root: process.cwd(),
    dependency: null,
    version: null,
    bump: "patch",
    only: null,
    branch: null,
    base: "main",
    dryRun: false,
    verify: false,
    push: false,
    openPr: false,
    allowFailures: false,
    json: false,
    pretty: false,
    help: false,
  };
}

function parseOnly(value) {
  if (typeof value !== "string") return null;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : null;
}

async function git(rootDir, args) {
  return runProcess("git", ["-C", rootDir, ...args]);
}

async function gitOutput(rootDir, args) {
  const result = await git(rootDir, args);
  return result.code === 0 ? result.stdout.trim() : null;
}

/** True when the checkout has no uncommitted change of any kind. */
async function isWorkingTreeClean(rootDir) {
  const status = await gitOutput(rootDir, ["status", "--porcelain"]);
  return status === "";
}

async function refExists(rootDir, ref) {
  const result = await git(rootDir, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return result.code === 0;
}

/**
 * Puts the checkout on the branch this run commits to. Rerunning on a branch
 * that already carries a previous run is how a second dependency or a second
 * --bump joins the same pull request, so an already-checked-out target branch
 * is continued rather than rejected.
 */
async function ensureBranch(rootDir, branch, base) {
  const current = await gitOutput(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current === branch) {
    return { ok: true, branch, created: false };
  }

  if (await refExists(rootDir, `refs/heads/${branch}`)) {
    return {
      ok: false,
      reason:
        `branch '${branch}' already exists but is not checked out; check it out to add to ` +
        "that run, or pass --branch with another name",
    };
  }

  const startPoint = (await refExists(rootDir, `refs/remotes/origin/${base}`))
    ? `origin/${base}`
    : base;
  if (!(await refExists(rootDir, startPoint))) {
    return { ok: false, reason: `base '${base}' does not resolve to a commit` };
  }

  const created = await git(rootDir, ["checkout", "-b", branch, startPoint]);
  if (created.code !== 0) {
    return { ok: false, reason: `could not create branch '${branch}': ${created.stderr.trim()}` };
  }
  return { ok: true, branch, created: true, startPoint };
}

/**
 * How many commits the branch adds to its base. A rerun after fixing a failed
 * package migrates nothing new, but the branch still carries the earlier
 * run's commits — so whether there is anything to push is a question about
 * the branch, not about this run.
 */
async function commitsAhead(rootDir, base) {
  const baseRef = (await refExists(rootDir, `refs/remotes/origin/${base}`))
    ? `origin/${base}`
    : base;
  const count = await gitOutput(rootDir, ["rev-list", "--count", `${baseRef}..HEAD`]);
  return count === null ? 0 : Number.parseInt(count, 10) || 0;
}

/** Refreshes origin/<base> so a new branch starts from the real trusted-repo tip. */
async function fetchBase(rootDir, base) {
  const remote = await gitOutput(rootDir, ["remote"]);
  if (!remote) return { fetched: false, reason: "no git remote configured" };

  const result = await git(rootDir, ["fetch", "origin", base]);
  return result.code === 0
    ? { fetched: true }
    : { fetched: false, reason: result.stderr.trim() || "fetch failed" };
}

function installLockfile() {
  return async (packageDir) => {
    const result = await runProcess("pnpm", ["install", "--lockfile-only"], { cwd: packageDir });
    if (result.code === 0) return { ok: true };
    const output = (result.stderr || result.stdout || "").trim();
    return {
      ok: false,
      reason:
        typeof result.code === "string"
          ? `could not start pnpm (${result.code})`
          : `exit code ${result.code}${output ? `\n${tail(output, 1500)}` : ""}`,
    };
  };
}

function restorePackageWith(rootDir) {
  return async (name) => {
    await git(rootDir, ["checkout", "--", `plugins/${name}`]);
    await git(rootDir, ["clean", "-fd", "--", `plugins/${name}`]);
  };
}

async function verifyMigrated(rootDir, migratedIds) {
  const seamPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "plugins.mjs");
  const result = await runProcess(process.execPath, [
    seamPath,
    "validate",
    "--root",
    rootDir,
    "--only",
    migratedIds.join(","),
    "--json",
  ]);

  try {
    const output = JSON.parse(result.stdout);
    return {
      ok: output.ok === true,
      errors: output.validation?.errors ?? [],
    };
  } catch {
    return {
      ok: false,
      errors: [{ code: "VERIFY_UNREADABLE", message: tail(result.stderr || result.stdout, 1500) }],
    };
  }
}

function statusLabel(status) {
  return { migrated: "migrated", skipped: "skipped ", failed: "failed  " }[status] ?? status;
}

function renderReport(state) {
  const lines = [];
  lines.push("plugins trusted-repo migration");
  lines.push(`mode: ${state.dryRun ? "dry-run" : "run"}`);
  lines.push(`root: ${state.root}`);
  lines.push(`dependency: ${state.dependency} -> ${state.version}`);
  lines.push(`bump: ${state.bump}`);
  lines.push(`branch: ${state.branch ?? "(none)"}`);
  if (state.baseNote) lines.push(`base: ${state.baseNote}`);
  lines.push("");

  lines.push("Packages:");
  if (state.packages.length === 0) {
    lines.push("  (no Plugin Source Packages found)");
  }
  for (const entry of state.packages) {
    const detail =
      entry.status === "migrated"
        ? `${entry.fromVersion} -> ${entry.toVersion}${entry.newVersion ? `, version ${entry.newVersion}` : ""}`
        : entry.reason;
    lines.push(`  [${statusLabel(entry.status)}] ${entry.name}${detail ? ` — ${detail}` : ""}`);
  }
  lines.push("");

  const counts = state.packages.reduce((totals, entry) => {
    totals[entry.status] = (totals[entry.status] ?? 0) + 1;
    return totals;
  }, {});
  lines.push(
    `Summary: ${counts.migrated ?? 0} migrated, ${counts.skipped ?? 0} skipped, ${counts.failed ?? 0} failed`,
  );

  if (state.verification) {
    lines.push("");
    lines.push(`Verification: ${state.verification.ok ? "PASSED" : "FAILED"}`);
    for (const error of state.verification.errors) {
      lines.push(`  ${error.package ?? "(repository)"} [${error.code}] ${error.message}`);
    }
  }

  if (state.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const note of state.notes) lines.push(`  ${note}`);
  }

  lines.push("");
  lines.push(`RESULT: ${state.ok ? "PASSED" : "FAILED"}`);
  return lines.join("\n");
}

function printReport(state) {
  if (state.json) {
    process.stdout.write(`${JSON.stringify(state, null, state.pretty ? 2 : 0)}\n`);
    return;
  }
  process.stdout.write(`${renderReport(state)}\n`);
}

function failure(options, message) {
  printReport({
    schemaVersion: 1,
    ok: false,
    dryRun: Boolean(options?.dryRun),
    root: options?.root ?? process.cwd(),
    dependency: options?.dependency ?? null,
    version: options?.version ?? null,
    bump: options?.bump ?? "patch",
    branch: null,
    packages: [],
    notes: [message],
    verification: null,
    json: Boolean(options?.json),
    pretty: Boolean(options?.pretty),
  });
  return 2;
}

async function pushBranch(rootDir, branch, notes) {
  const pushed = await git(rootDir, ["push", "--set-upstream", "origin", branch]);
  if (pushed.code !== 0) {
    notes.push(`push failed: ${pushed.stderr.trim()}`);
    return false;
  }
  notes.push(`pushed ${branch} to origin`);
  return true;
}

async function openPullRequest(rootDir, state, body, notes) {
  const created = await runProcess(
    "gh",
    [
      "pr",
      "create",
      "--title",
      `Migrate ${state.dependency} to ${state.version}`,
      "--body",
      body,
      "--base",
      state.base,
      "--head",
      state.branch,
    ],
    { cwd: rootDir },
  );
  if (created.code !== 0) {
    notes.push(`gh pr create failed: ${(created.stderr || created.stdout).trim()}`);
    return false;
  }
  notes.push(`opened pull request: ${created.stdout.trim()}`);
  return true;
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = { ...defaultOptions(), ...parseCliArgs(argv, FLAGS) };
    options.only = parseOnly(options.only);
  } catch (error) {
    return failure(null, error.message);
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!options.dependency) return failure(options, "--dependency <name> is required");
  if (!options.version) return failure(options, "--version <semver> is required");
  if (!isSemVer(options.version)) {
    return failure(options, `--version '${options.version}' is not a SemVer version`);
  }

  const rootDir = path.resolve(options.root);
  const discovered = await discoverPluginSourcePackages(rootDir);
  if (options.only) {
    const known = new Set(discovered.map((pkg) => pkg.id));
    const unknown = options.only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return failure(options, `--only names unknown package(s): ${unknown.join(", ")}`);
    }
  }

  const state = {
    schemaVersion: 1,
    ok: true,
    dryRun: options.dryRun,
    root: rootDir,
    dependency: options.dependency,
    version: options.version,
    bump: options.bump,
    base: options.base,
    branch: null,
    baseNote: null,
    packages: [],
    notes: [],
    verification: null,
    json: options.json,
    pretty: options.pretty,
  };

  if (options.dryRun) {
    const plans = await planMigration(rootDir, {
      dependency: options.dependency,
      version: options.version,
      only: options.only,
      bump: options.bump,
    });
    state.packages = plans.map((plan) => ({
      name: plan.name,
      status: { migrate: "migrated", skip: "skipped", fail: "failed" }[plan.action],
      reason: plan.reason,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      newVersion: plan.predictedVersion,
    }));
    state.ok = !state.packages.some((entry) => entry.status === "failed");
    printReport(state);
    return state.ok ? 0 : 1;
  }

  if (!(await isWorkingTreeClean(rootDir))) {
    return failure(
      options,
      "the checkout has uncommitted changes; a migration commits one package at a time " +
        "and needs a clean working tree to tell its own changes apart",
    );
  }

  const fetched = await fetchBase(rootDir, options.base);
  state.baseNote = fetched.fetched
    ? `origin/${options.base} (fetched)`
    : `${options.base} (not fetched: ${fetched.reason})`;

  const branch = options.branch ?? migrationBranchName(options.dependency, options.version);
  const prepared = await ensureBranch(rootDir, branch, options.base);
  if (!prepared.ok) return failure(options, prepared.reason);
  state.branch = branch;
  if (!prepared.created) {
    state.notes.push(`continuing on the already checked-out branch '${branch}'`);
  }

  const migration = createCatalogMigration({
    dependency: options.dependency,
    version: options.version,
    only: options.only,
    installLockfile: installLockfile(),
    restorePackage: restorePackageWith(rootDir),
  });

  const results = await runTrustedRepoMigration({
    repoDir: rootDir,
    bump: options.bump,
    transform: migration.transform,
    commitMessage: (name, newVersion) =>
      `Migrate ${name}@${newVersion} to ${options.dependency} ${options.version}`,
  });

  state.packages = mergeOutcomes(results, migration.outcomes);
  const migrated = state.packages.filter((entry) => entry.status === "migrated");
  const failed = state.packages.filter((entry) => entry.status === "failed");

  if (options.verify && migrated.length > 0) {
    state.verification = await verifyMigrated(
      rootDir,
      migrated.map((entry) => entry.name),
    );
  }

  state.ok = failed.length === 0 && (state.verification?.ok ?? true);

  const mayPublish = state.ok || options.allowFailures;
  if ((options.push || options.openPr) && !mayPublish) {
    state.notes.push(
      `not pushing: ${failed.length} package(s) failed. Fix them and rerun, or pass ` +
        "--allow-failures to open the pull request without them",
    );
  } else if (options.push || options.openPr) {
    if ((await commitsAhead(rootDir, options.base)) === 0) {
      state.notes.push(`not pushing: '${branch}' adds no commits to ${options.base}`);
    } else if (await pushBranch(rootDir, branch, state.notes)) {
      if (options.openPr) {
        const body = `${renderReport({ ...state, notes: [] })}\n`;
        await openPullRequest(rootDir, state, body, state.notes);
      }
    }
  }

  printReport(state);
  return state.ok ? 0 : 1;
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
