import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runTrustedRepoMigration } from "@fluxta/cli/migration";

import {
  collectDependencyReferences,
  createCatalogMigration,
  dependencySlug,
  findCatalogEntry,
  inspectPackage,
  mergeOutcomes,
  migrationBranchName,
  planMigration,
  replaceCatalogEntry,
  splitRange,
} from "../scripts/lib/migrate.mjs";
import { runMigrate, validManifest, withTempDir, writeManifest } from "./helpers.mjs";

const WORKSPACE = [
  "packages:",
  "  - apps/*",
  "",
  "catalog:",
  '  "@fluxta/cli": "^0.4.0"',
  '  "@fluxta/sdk": "^0.1.2"',
  "  turbo: ^2.7.3",
  "",
  "minimumReleaseAgeExclude:",
  "  - '@fluxta/sdk@0.1.2'",
  "",
].join("\n");

function git(dir, ...args) {
  execFileSync("git", args, { cwd: dir });
}

async function scaffoldRepo(root) {
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
}

/**
 * One Plugin Source Package as this repository stores it: a manifest, its own
 * pnpm workspace with a catalog, and a sub-package that reaches the shared
 * dependency through that catalog.
 */
async function scaffoldPackage(root, id, { workspace = WORKSPACE, subPackage } = {}) {
  await writeManifest(root, id, validManifest({ name: id, version: "1.2.3" }));
  const packageDir = path.join(root, "plugins", id);
  if (workspace !== null) {
    await writeFile(path.join(packageDir, "pnpm-workspace.yaml"), workspace);
  }
  await mkdir(path.join(packageDir, "apps", "plugin"), { recursive: true });
  await writeFile(
    path.join(packageDir, "apps", "plugin", "package.json"),
    `${JSON.stringify(subPackage ?? { name: `${id}-plugin`, dependencies: { "@fluxta/sdk": "catalog:" } }, null, 2)}\n`,
  );
  return packageDir;
}

function acceptingInstaller() {
  const calls = [];
  return {
    calls,
    install: async (packageDir) => {
      calls.push(packageDir);
      return { ok: true };
    },
  };
}

test("dependencySlug and migrationBranchName name a run after its dependency", () => {
  assert.equal(dependencySlug("@fluxta/sdk"), "fluxta-sdk");
  assert.equal(dependencySlug("turbo"), "turbo");
  assert.equal(migrationBranchName("@fluxta/sdk", "0.2.0"), "migrate/fluxta-sdk-0.2.0");
});

test("splitRange separates a catalog entry's range operator from its version", () => {
  assert.deepEqual(splitRange("^0.1.2"), { operator: "^", version: "0.1.2" });
  assert.deepEqual(splitRange("~1.0.0"), { operator: "~", version: "1.0.0" });
  assert.deepEqual(splitRange("0.1.2"), { operator: "", version: "0.1.2" });
  assert.deepEqual(splitRange(">=2.0.0"), { operator: ">=", version: "2.0.0" });
});

test("findCatalogEntry finds a dependency declared in the catalog block", () => {
  const found = findCatalogEntry(WORKSPACE, "@fluxta/sdk");
  assert.equal(found.status, "found");
  assert.equal(found.entry.value.text, "^0.1.2");
  assert.equal(found.entry.indent, "  ");
});

test("findCatalogEntry reads unquoted catalog keys too", () => {
  const found = findCatalogEntry(WORKSPACE, "turbo");
  assert.equal(found.status, "found");
  assert.equal(found.entry.value.text, "^2.7.3");
});

test("findCatalogEntry ignores lines outside the catalog block", () => {
  // The same name appears under minimumReleaseAgeExclude; a top-level key
  // ends the catalog block, so only the catalog's own entry counts.
  assert.equal(findCatalogEntry(WORKSPACE, "@fluxta/bindings").status, "absent");

  const otherBlock = ["other:", '  "@fluxta/sdk": "^9.9.9"', ""].join("\n");
  assert.equal(findCatalogEntry(otherBlock, "@fluxta/sdk").status, "absent");
});

test("findCatalogEntry reports a duplicated entry rather than picking one", () => {
  const duplicated = ["catalog:", '  "@fluxta/sdk": "^0.1.2"', '  "@fluxta/sdk": "^0.1.1"', ""].join(
    "\n",
  );
  const found = findCatalogEntry(duplicated, "@fluxta/sdk");
  assert.equal(found.status, "ambiguous");
  assert.equal(found.count, 2);
});

test("replaceCatalogEntry keeps indentation, quoting, range operator, and comments", () => {
  const contents = [
    "catalog:",
    '  "@fluxta/sdk": "^0.1.2" # shared across every package',
    "",
  ].join("\n");
  const replaced = replaceCatalogEntry(contents, "@fluxta/sdk", "0.2.0");

  assert.equal(replaced.status, "replaced");
  assert.equal(replaced.fromVersion, "^0.1.2");
  assert.equal(replaced.toVersion, "^0.2.0");
  assert.equal(
    replaced.contents,
    ["catalog:", '  "@fluxta/sdk": "^0.2.0" # shared across every package', ""].join("\n"),
  );
});

test("replaceCatalogEntry keeps a pinned entry pinned", () => {
  const contents = ["catalog:", "  \"@fluxta/sdk\": '0.1.2'", ""].join("\n");
  const replaced = replaceCatalogEntry(contents, "@fluxta/sdk", "0.2.0");

  assert.equal(replaced.status, "replaced");
  assert.equal(replaced.toVersion, "0.2.0");
  assert.equal(replaced.contents, ["catalog:", "  \"@fluxta/sdk\": '0.2.0'", ""].join("\n"));
});

test("replaceCatalogEntry reports an entry already at the target version as unchanged", () => {
  const replaced = replaceCatalogEntry(WORKSPACE, "@fluxta/sdk", "0.1.2");
  assert.equal(replaced.status, "unchanged");
  assert.equal(replaced.fromVersion, "^0.1.2");
});

test("collectDependencyReferences reports how each package.json reaches the dependency", async () => {
  await withTempDir(async (root) => {
    const packageDir = await scaffoldPackage(root, "example-plugin");
    await mkdir(path.join(packageDir, "apps", "editor"), { recursive: true });
    await writeFile(
      path.join(packageDir, "apps", "editor", "package.json"),
      `${JSON.stringify({ name: "editor", devDependencies: { "@fluxta/sdk": "^0.1.2" } })}\n`,
    );
    // Installed and built copies are not what the package declares.
    await mkdir(path.join(packageDir, "node_modules", "@fluxta", "sdk"), { recursive: true });
    await writeFile(
      path.join(packageDir, "node_modules", "@fluxta", "sdk", "package.json"),
      `${JSON.stringify({ name: "@fluxta/sdk", dependencies: { "@fluxta/sdk": "^9.9.9" } })}\n`,
    );

    const references = await collectDependencyReferences(packageDir, "@fluxta/sdk");

    assert.deepEqual(
      references.map((reference) => [reference.file, reference.field, reference.kind]),
      [
        [path.join("apps", "editor", "package.json"), "devDependencies", "direct"],
        [path.join("apps", "plugin", "package.json"), "dependencies", "catalog"],
      ],
    );
  });
});

test("inspectPackage plans a catalog bump without writing anything", async () => {
  await withTempDir(async (root) => {
    const packageDir = await scaffoldPackage(root, "example-plugin");

    const inspected = await inspectPackage(packageDir, {
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: null,
    });

    assert.equal(inspected.action, "migrate");
    assert.equal(inspected.fromVersion, "^0.1.2");
    assert.equal(inspected.toVersion, "^0.2.0");
    assert.match(inspected.contents, /"@fluxta\/sdk": "\^0\.2\.0"/);
    assert.equal(
      await readFile(path.join(packageDir, "pnpm-workspace.yaml"), "utf8"),
      WORKSPACE,
      "inspecting a package must not write to it",
    );
  });
});

test("inspectPackage skips a package that does not use the dependency at all", async () => {
  await withTempDir(async (root) => {
    const packageDir = await scaffoldPackage(root, "example-plugin", {
      subPackage: { name: "example-plugin", dependencies: { react: "catalog:" } },
      workspace: ["packages:", "  - apps/*", "", "catalog:", "  react: ^19.2.3", ""].join("\n"),
    });

    const inspected = await inspectPackage(packageDir, {
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: null,
    });

    assert.equal(inspected.action, "skip");
    assert.match(inspected.reason, /does not depend on '@fluxta\/sdk'/);
  });
});

test("inspectPackage fails a package that declares the dependency outside the catalog", async () => {
  await withTempDir(async (root) => {
    const packageDir = await scaffoldPackage(root, "example-plugin", {
      workspace: ["packages:", "  - apps/*", "", "catalog:", "  react: ^19.2.3", ""].join("\n"),
      subPackage: { name: "example-plugin", dependencies: { "@fluxta/sdk": "^0.1.2" } },
    });

    const inspected = await inspectPackage(packageDir, {
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: null,
    });

    assert.equal(inspected.action, "fail");
    assert.match(inspected.reason, /has no catalog entry for it/);
    assert.match(inspected.reason, /apps.plugin.package\.json \(dependencies\)/);
  });
});

test("inspectPackage leaves a package outside --only alone", async () => {
  await withTempDir(async (root) => {
    const packageDir = await scaffoldPackage(root, "example-plugin");

    const inspected = await inspectPackage(packageDir, {
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: ["other-plugin"],
    });

    assert.equal(inspected.action, "skip");
    assert.match(inspected.reason, /not selected by --only/);
  });
});

test("planMigration reports the version bump each migrated package would receive", async () => {
  await withTempDir(async (root) => {
    await scaffoldPackage(root, "example-plugin");
    await scaffoldPackage(root, "other-plugin", {
      workspace: ["packages:", "  - apps/*", "", "catalog:", "  react: ^19.2.3", ""].join("\n"),
      subPackage: { name: "other-plugin", dependencies: { react: "catalog:" } },
    });

    const plans = await planMigration(root, {
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: null,
      bump: "minor",
    });

    assert.deepEqual(
      plans.map((plan) => [plan.name, plan.action, plan.predictedVersion]),
      [
        ["example-plugin", "migrate", "1.3.0"],
        ["other-plugin", "skip", undefined],
      ],
    );
  });
});

test("a migration commits each changed package on its own, bumped and marked", async () => {
  await withTempDir(async (root) => {
    await scaffoldRepo(root);
    await scaffoldPackage(root, "example-plugin");
    await scaffoldPackage(root, "other-plugin");
    git(root, "add", "-A");
    git(root, "commit", "-m", "Initial commit");

    const installer = acceptingInstaller();
    const migration = createCatalogMigration({
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: ["example-plugin"],
      installLockfile: installer.install,
      restorePackage: async () => {},
    });

    const results = await runTrustedRepoMigration({
      repoDir: root,
      bump: "patch",
      transform: migration.transform,
      commitMessage: (name, version) => `Migrate ${name}@${version}`,
    });
    const merged = mergeOutcomes(results, migration.outcomes);

    assert.deepEqual(
      merged.map((entry) => [entry.name, entry.status, entry.newVersion]),
      [
        ["example-plugin", "migrated", "1.2.4"],
        ["other-plugin", "skipped", undefined],
      ],
    );
    assert.deepEqual(installer.calls, [path.join(root, "plugins", "example-plugin")]);

    const workspace = await readFile(
      path.join(root, "plugins", "example-plugin", "pnpm-workspace.yaml"),
      "utf8",
    );
    assert.match(workspace, /"@fluxta\/sdk": "\^0\.2\.0"/);

    const manifest = JSON.parse(
      await readFile(path.join(root, "plugins", "example-plugin", "manifest.json"), "utf8"),
    );
    assert.equal(manifest.version, "1.2.4");

    const marker = JSON.parse(
      await readFile(path.join(root, "plugins", "example-plugin", ".origin.json"), "utf8"),
    );
    assert.deepEqual(marker, { origin: "migration" });

    const subjects = execFileSync("git", ["log", "--format=%s"], { cwd: root }).toString().trim();
    assert.equal(subjects.split("\n")[0], "Migrate example-plugin@1.2.4");

    const touched = execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], {
      cwd: root,
    })
      .toString()
      .trim()
      .split("\n")
      .sort();
    assert.deepEqual(touched, [
      "plugins/example-plugin/.origin.json",
      "plugins/example-plugin/manifest.json",
      "plugins/example-plugin/pnpm-workspace.yaml",
    ]);

    // The unselected package keeps its own version and stays uncommitted-clean.
    const untouched = JSON.parse(
      await readFile(path.join(root, "plugins", "other-plugin", "manifest.json"), "utf8"),
    );
    assert.equal(untouched.version, "1.2.3");
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root }).toString(), "");
  });
});

test("a package whose lockfile refresh fails is reported and rolled back, not committed", async () => {
  await withTempDir(async (root) => {
    await scaffoldRepo(root);
    await scaffoldPackage(root, "example-plugin");
    git(root, "add", "-A");
    git(root, "commit", "-m", "Initial commit");

    const migration = createCatalogMigration({
      dependency: "@fluxta/sdk",
      version: "0.2.0",
      only: null,
      installLockfile: async () => ({ ok: false, reason: "exit code 1" }),
      restorePackage: async (name) => {
        git(root, "checkout", "--", `plugins/${name}`);
      },
    });

    const results = await runTrustedRepoMigration({
      repoDir: root,
      bump: "patch",
      transform: migration.transform,
    });
    const merged = mergeOutcomes(results, migration.outcomes);

    assert.equal(merged[0].status, "failed");
    assert.match(merged[0].reason, /refreshing example-plugin's lockfile failed/);
    assert.equal(
      await readFile(path.join(root, "plugins", "example-plugin", "pnpm-workspace.yaml"), "utf8"),
      WORKSPACE,
      "a failed migration must leave the catalog as it found it",
    );
    assert.equal(
      execFileSync("git", ["log", "--format=%s"], { cwd: root }).toString().trim(),
      "Initial commit",
    );
  });
});

test("mergeOutcomes lets the migration's own failure outrank the transform's view", () => {
  const merged = mergeOutcomes(
    [{ name: "example-plugin", status: "failed", reason: "manifest.json is invalid JSON" }],
    new Map([["example-plugin", { status: "migrated", fromVersion: "^0.1.2", toVersion: "^0.2.0" }]]),
  );

  assert.equal(merged[0].status, "failed");
  assert.match(merged[0].reason, /invalid JSON/);
});

test("migrate --dry-run reports the plan and writes nothing", async () => {
  await withTempDir(async (root) => {
    await scaffoldPackage(root, "example-plugin");

    const result = await runMigrate([
      "--root",
      root,
      "--dependency",
      "@fluxta/sdk",
      "--version",
      "0.2.0",
      "--dry-run",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /mode: dry-run/);
    assert.match(result.stdout, /\[migrated\] example-plugin — \^0\.1\.2 -> \^0\.2\.0/);
    assert.match(result.stdout, /RESULT: PASSED/);
    assert.equal(
      await readFile(path.join(root, "plugins", "example-plugin", "pnpm-workspace.yaml"), "utf8"),
      WORKSPACE,
    );
  });
});

test("migrate --dry-run fails when a package cannot be migrated mechanically", async () => {
  await withTempDir(async (root) => {
    await scaffoldPackage(root, "example-plugin", {
      workspace: ["packages:", "  - apps/*", "", "catalog:", "  react: ^19.2.3", ""].join("\n"),
      subPackage: { name: "example-plugin", dependencies: { "@fluxta/sdk": "^0.1.2" } },
    });

    const result = await runMigrate([
      "--root",
      root,
      "--dependency",
      "@fluxta/sdk",
      "--version",
      "0.2.0",
      "--dry-run",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /\[failed {2}\] example-plugin/);
    assert.match(result.stdout, /RESULT: FAILED/);
  });
});

test("migrate requires a dependency and a SemVer version", async () => {
  const missing = await runMigrate(["--dependency", "@fluxta/sdk", "--dry-run"]);
  assert.equal(missing.code, 2);
  assert.match(missing.stdout, /--version <semver> is required/);

  const invalid = await runMigrate([
    "--dependency",
    "@fluxta/sdk",
    "--version",
    "not-a-version",
    "--dry-run",
  ]);
  assert.equal(invalid.code, 2);
  assert.match(invalid.stdout, /is not a SemVer version/);
});

test("migrate rejects --only names that no package in the checkout carries", async () => {
  await withTempDir(async (root) => {
    await scaffoldPackage(root, "example-plugin");

    const result = await runMigrate([
      "--root",
      root,
      "--dependency",
      "@fluxta/sdk",
      "--version",
      "0.2.0",
      "--only",
      "example-plugin,ghost-plugin",
      "--dry-run",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /--only names unknown package\(s\): ghost-plugin/);
  });
});

test("migrate refuses to run against a checkout with uncommitted changes", async () => {
  await withTempDir(async (root) => {
    await scaffoldRepo(root);
    await scaffoldPackage(root, "example-plugin");
    git(root, "add", "-A");
    git(root, "commit", "-m", "Initial commit");
    await writeFile(path.join(root, "plugins", "example-plugin", "README.md"), "uncommitted\n");

    const result = await runMigrate([
      "--root",
      root,
      "--dependency",
      "@fluxta/sdk",
      "--version",
      "0.2.0",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /uncommitted changes/);
  });
});

test("migrate does not push a branch that adds no commits to its base", async () => {
  await withTempDir(async (root) => {
    await scaffoldRepo(root);
    // Already at the target version: the run migrates nothing, so the branch
    // it would push is identical to its base.
    await scaffoldPackage(root, "example-plugin", {
      workspace: WORKSPACE.replace('"@fluxta/sdk": "^0.1.2"', '"@fluxta/sdk": "^0.2.0"'),
    });
    git(root, "add", "-A");
    git(root, "commit", "-m", "Initial commit");

    const result = await runMigrate([
      "--root",
      root,
      "--dependency",
      "@fluxta/sdk",
      "--version",
      "0.2.0",
      "--push",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /catalog already names '@fluxta\/sdk' \^0\.2\.0/);
    assert.match(result.stdout, /not pushing: 'migrate\/fluxta-sdk-0\.2\.0' adds no commits to main/);
  });
});
