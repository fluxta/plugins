import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  runCli,
  simpleBuildScript,
  validManifest,
  withTempDir,
  writeBuildContract,
  writeCodeowners,
  writeManifest,
  writePreviousIndex,
  writeSourceFiles,
} from "./helpers.mjs";

const SOURCE_COMMIT = "c".repeat(40);
const PUBLISHED_AT = "2026-08-06T12:00:00.000Z";

function indexVersion(version, overrides = {}) {
  return {
    version,
    manifest: {
      name: "example.plugin",
      version,
      apiVersion: 1,
      title: "Example Plugin",
      description: "An example trusted package.",
    },
    packageMetadata: {
      author: "Example Author",
      license: "MIT",
      repository: "https://github.com/example/example.plugin",
      homepage: null,
      minAppVersion: "0.1.0",
      maintainers: ["inferst"],
    },
    artifact: {
      objectKey: `artifacts/example.plugin-${version}.zip`,
      checksum: `sha256:${"a".repeat(64)}`,
      size: 1024,
      sourceCommit: "p".repeat(40),
      publishedAt: "2026-01-01T00:00:00.000Z",
    },
    status: "published",
    reason: null,
    ...overrides,
  };
}

function previousIndex(versions, packageName = "example.plugin") {
  return {
    schemaVersion: 1,
    packages: [{ name: packageName, versions }],
  };
}

function publishedEntry(version, artifact, overrides = {}) {
  return {
    ...indexVersion(version),
    artifact: { ...indexVersion(version).artifact, ...artifact },
    ...overrides,
  };
}

async function writeBuildablePackage(root, packageId, manifest, copiedDirs = []) {
  await writeManifest(root, packageId, manifest);
  await writeBuildContract(root, packageId, {
    buildScript: simpleBuildScript(packageId, copiedDirs),
  });
  await writeCodeowners(root, `plugins/${packageId} @inferst\n`);
  await writeSourceFiles(root, packageId, [
    ...copiedDirs.map((dir) => `${dir}/placeholder.svg`),
  ]);
}

async function writePublicationState(root, packageId, state) {
  const fullPath = path.join(root, "plugins", packageId, "publication-state.json");
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(state, null, 2)}\n`);
}

function stateFile(versions) {
  return { package: "example.plugin", versions };
}

async function baselineArtifact(root) {
  const baseline = JSON.parse(
    (
      await runCli([
        "validate",
        "--root",
        root,
        "--json",
        "--source-commit",
        SOURCE_COMMIT,
        "--published-at",
        PUBLISHED_AT,
      ])
    ).stdout,
  );
  assert.equal(baseline.ok, true);
  return baseline.packages[0].build.artifact;
}

test("a maintainer can mark a published version yanked with a reason; the latest recommendation falls back and history is preserved", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.1.0" }),
      ["process"],
    );
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const artifact = await baselineArtifact(root);

    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry("1.0.0", indexVersion("1.0.0").artifact),
        publishedEntry("1.1.0", artifact),
        indexVersion("1.2.0"),
      ]),
    );
    await writePublicationState(
      root,
      "example.plugin",
      stateFile({
        "1.2.0": { status: "yanked", reason: "Causes a crash on startup" },
      }),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
      "--source-commit",
      SOURCE_COMMIT,
      "--published-at",
      PUBLISHED_AT,
    ]);

    assert.equal(result.code, 0, `unexpected validation output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);

    const versions = output.publicationIndex.packages[0].versions;
    assert.deepEqual(
      versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0", "1.2.0"],
      "the yanked version stays in all-version history",
    );
    assert.equal(versions[2].status, "yanked");
    assert.equal(versions[2].reason, "Causes a crash on startup");
    assert.deepEqual(versions[2].artifact, indexVersion("1.2.0").artifact);

    assert.deepEqual(
      output.publicationPlan.recommendations,
      [{ package: "example.plugin", latestVersion: "1.1.0" }],
      "the latest recommended version skips the state-yanked version",
    );
    assert.deepEqual(
      output.publicationPlan.artifactWrites,
      [],
      "no artifact write is planned for a build matching the published history",
    );
  });
});

test("an unlisted version is excluded from the latest recommendation while staying in history with its reason", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.0.0" }),
      ["process"],
    );
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const artifact = await baselineArtifact(root);

    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry("1.0.0", artifact),
        indexVersion("1.1.0"),
      ]),
    );
    await writePublicationState(
      root,
      "example.plugin",
      stateFile({
        "1.1.0": { status: "unlisted", reason: "Superseded by the rewrite" },
      }),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 0, `unexpected validation output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);

    const versions = output.publicationIndex.packages[0].versions;
    assert.deepEqual(
      versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0"],
    );
    assert.equal(versions[1].status, "unlisted");
    assert.equal(versions[1].reason, "Superseded by the rewrite");

    assert.deepEqual(
      output.publicationPlan.recommendations,
      [{ package: "example.plugin", latestVersion: "1.0.0" }],
      "the latest version is unlisted, so the older published version is recommended",
    );
  });
});

test("publication state overrides supplied status while untouched entries keep theirs", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.0.0" }),
      ["process"],
    );
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const artifact = await baselineArtifact(root);

    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry("1.0.0", artifact, { status: "unlisted", reason: "From R2 history" }),
        indexVersion("1.1.0", { status: "yanked", reason: "Yanked earlier" }),
      ]),
    );
    await writePublicationState(
      root,
      "example.plugin",
      stateFile({
        "1.0.0": { status: "yanked", reason: "Crashes on startup" },
      }),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 0, `unexpected validation output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    const versions = output.publicationIndex.packages[0].versions;

    assert.equal(versions[0].status, "yanked", "state overrides the supplied status");
    assert.equal(versions[0].reason, "Crashes on startup");
    assert.equal(versions[1].status, "yanked", "status without state is preserved");
    assert.equal(versions[1].reason, "Yanked earlier");
    assert.equal(versions[1].artifact.objectKey, "artifacts/example.plugin-1.1.0.zip");

    assert.deepEqual(output.publicationPlan.recommendations, []);
  });
});

test("a state file that cannot be interpreted fails validation with a package-scoped error", async () => {
  const invalidStates = [
    {
      name: "invalid JSON",
      contents: "{ not json",
      expectedField: "publication-state.json",
    },
    {
      name: "package mismatch",
      state: stateFile({ "1.2.0": { status: "yanked" } }),
      override: { package: "other.plugin" },
      expectedCode: "PUBLICATION_STATE_PACKAGE_MISMATCH",
      expectedField: "package",
    },
    {
      name: "versions missing",
      state: { package: "example.plugin" },
      expectedField: "versions",
    },
    {
      name: "non-semver version key",
      state: stateFile({ "1.2": { status: "yanked" } }),
      expectedField: "versions.1.2",
    },
    {
      name: "status missing",
      state: stateFile({ "1.2.0": { reason: "no status" } }),
      expectedField: "versions.1.2.0.status",
    },
    {
      name: "invalid status value",
      state: stateFile({ "1.2.0": { status: "deprecated" } }),
      expectedField: "versions.1.2.0.status",
    },
    {
      name: "unknown field",
      state: stateFile({ "1.2.0": { yanked: true } }),
      expectedField: "versions.1.2.0",
    },
    {
      name: "non-string reason",
      state: stateFile({ "1.2.0": { status: "yanked", reason: 42 } }),
      expectedField: "versions.1.2.0.reason",
    },
  ];

  for (const invalid of invalidStates) {
    await withTempDir(async (root) => {
      await writeBuildablePackage(root, "example.plugin", validManifest());
      const previous = previousIndex([indexVersion("1.2.0")]);
      await writePreviousIndex(root, previous);

      if (invalid.contents !== undefined) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
          path.join(root, "plugins", "example.plugin", "publication-state.json"),
          invalid.contents,
        );
      } else {
        await writePublicationState(
          root,
          "example.plugin",
          invalid.override ? { ...invalid.state, ...invalid.override } : invalid.state,
        );
      }

      const result = await runCli([
        "validate",
        "--root",
        root,
        "--json",
        "--previous-index",
        path.join(root, "previous-index.json"),
      ]);

      assert.equal(result.code, 1, `${invalid.name}: expected validation failure`);
      const output = JSON.parse(result.stdout);
      assert.equal(output.ok, false, invalid.name);
      const stateError = output.validation.errors.find(
        (error) => error.package === "example.plugin",
      );
      assert.ok(stateError, `${invalid.name}: expected a package-scoped error`);
      assert.equal(
        stateError.code,
        invalid.expectedCode ?? "INVALID_PUBLICATION_STATE",
        invalid.name,
      );
      assert.equal(stateError.field, invalid.expectedField, invalid.name);
    });
  }
});

test("publication state for a version with no published history fails when a previous index is supplied", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest());
    await writePreviousIndex(root, previousIndex([indexVersion("1.0.0")]));
    await writePublicationState(
      root,
      "example.plugin",
      stateFile({
        "2.0.0": { status: "yanked", reason: "Never shipped" },
      }),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    const error = output.validation.errors.find(
      (entry) => entry.code === "PUBLICATION_STATE_UNPUBLISHED_VERSION",
    );
    assert.ok(error, JSON.stringify(output.validation.errors));
    assert.equal(error.package, "example.plugin");
    assert.match(error.message, /version '2\.0\.0'/);
    assert.match(error.message, /no published history/);
    assert.equal(
      output.publicationIndex.packages[0].versions.length,
      2,
      "history is still generated; the state entry is not applied",
    );
  });
});

test("publication state is inert when no previous index is supplied", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest());
    await writePublicationState(
      root,
      "example.plugin",
      stateFile({
        "1.2.3": { status: "yanked", reason: "Cannot be verified without history" },
      }),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--source-commit",
      SOURCE_COMMIT,
      "--published-at",
      PUBLISHED_AT,
    ]);

    assert.equal(result.code, 0, `unexpected validation output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);

    const [entry] = output.publicationIndex.packages[0].versions;
    assert.equal(entry.version, "1.2.3");
    assert.equal(entry.status, "published", "without history the state cannot be applied");
    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.2.3" },
    ]);
  });
});

test("a docs-only rebuild of a yanked version keeps it yanked and plans no artifact write", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.0.0" }),
      ["process"],
    );
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const artifact = await baselineArtifact(root);

    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry("1.0.0", artifact, {
          status: "yanked",
          reason: "Broken on Windows",
        }),
      ]),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 0, `unexpected validation output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.packages[0].change.kind, "docs-only");
    assert.match(output.packages[0].change.reason, /stays yanked/);

    assert.deepEqual(output.publicationPlan.artifactWrites, []);
    const [entry] = output.publicationIndex.packages[0].versions;
    assert.equal(entry.status, "yanked", "the yanked status is not reset by the rebuild");
    assert.equal(entry.reason, "Broken on Windows");
    assert.equal(entry.artifact.checksum, artifact.checksum);
  });
});

test("a changed rebuild of a yanked version is rejected without overwriting the published artifact", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest(),
      ["process"],
    );
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const baseline = JSON.parse(
      (
        await runCli([
          "validate",
          "--root",
          root,
          "--json",
          "--source-commit",
          SOURCE_COMMIT,
          "--published-at",
          PUBLISHED_AT,
        ])
      ).stdout,
    );
    const artifact = baseline.packages[0].build.artifact;

    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry("1.2.3", artifact, {
          status: "yanked",
          reason: "Broken on Windows",
        }),
      ]),
    );
    await writeSourceFiles(root, "example.plugin", [
      "process/main.js",
      "process/extra.js",
    ]);

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(
      output.validation.errors.map((error) => error.code),
      ["DUPLICATE_PUBLICATION"],
    );
    assert.match(output.validation.errors[0].message, /stays yanked/);
    assert.match(output.validation.errors[0].message, /new manifest\.version/);
    assert.match(output.packages[0].change.reason, /must be bumped/);

    assert.deepEqual(output.publicationPlan.artifactWrites, []);
    const [entry] = output.publicationIndex.packages[0].versions;
    assert.equal(entry.status, "yanked", "the yanked artifact is not deleted or replaced");
    assert.equal(entry.artifact.checksum, artifact.checksum);
    assert.equal(entry.reason, "Broken on Windows");
  });
});

test("a maintainer can re-list a yanked version by setting its status back to published", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.0.0" }),
      ["process"],
    );
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const artifact = await baselineArtifact(root);

    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry("1.0.0", artifact, {
          status: "yanked",
          reason: "Fixed in 1.1.0, restored after patch",
        }),
        indexVersion("1.1.0", { status: "yanked" }),
      ]),
    );
    await writePublicationState(
      root,
      "example.plugin",
      stateFile({
        "1.0.0": { status: "published", reason: "Restored after the fix" },
      }),
    );

    const result = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 0, `unexpected validation output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    const versions = output.publicationIndex.packages[0].versions;

    assert.equal(versions[0].status, "published", "the state entry un-yanks the version");
    assert.equal(versions[0].reason, "Restored after the fix");
    assert.equal(versions[1].status, "yanked", "the still-yanked version is unaffected");
    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.0.0" },
    ]);
  });
});
