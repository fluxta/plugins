import { createHash } from "node:crypto";
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
  // Callers pass a build artifact record, which carries the local `path` the
  // Publication Index does not store.
  const { path: _localPath, ...published } = artifact ?? {};
  return {
    ...indexVersion(version),
    artifact: { ...indexVersion(version).artifact, ...published },
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

test("validate generates a dry-run Publication Index with schema version, identity, manifest fields, Package Metadata, and artifact metadata", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), [
      "icons",
      "editor",
      "process",
    ]);
    await writeSourceFiles(root, "example.plugin", [
      "icons/app.svg",
      "icons/run.svg",
      "editor/config.js",
      "editor/run.js",
      "process/main.js",
    ]);

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

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(output.publicationPlan.networkWrites, []);

    const index = output.publicationIndex;
    assert.equal(index.schemaVersion, 1);
    assert.equal(index.packages.length, 1);
    assert.equal(index.packages[0].name, "example.plugin");

    const [entry] = index.packages[0].versions;
    assert.deepEqual(entry.manifest, {
      name: "example.plugin",
      version: "1.2.3",
      apiVersion: 1,
      title: "Example Plugin",
      description: "An example trusted package.",
    });
    assert.deepEqual(entry.packageMetadata, {
      author: "Example Author",
      license: "MIT",
      minAppVersion: "0.1.0",
      maintainers: ["inferst"],
    });
    assert.deepEqual(entry.artifact, {
      objectKey: "artifacts/example.plugin-1.2.3.zip",
      checksum: output.packages[0].build.artifact.checksum,
      size: output.packages[0].build.artifact.size,
      sourceCommit: SOURCE_COMMIT,
      publishedAt: PUBLISHED_AT,
    });
    assert.equal(entry.status, "published");
    assert.equal(entry.reason, null);

    assert.deepEqual(output.publicationPlan.artifactWrites, [
      {
        package: "example.plugin",
        version: "1.2.3",
        pluginFolder: "example.plugin",
        artifact: "artifacts/example.plugin-1.2.3.zip",
        objectKey: "artifacts/example.plugin-1.2.3.zip",
        size: output.packages[0].build.artifact.size,
        checksum: output.packages[0].build.artifact.checksum,
      },
    ]);
    assert.deepEqual(output.publicationPlan.indexWrites, [
      {
        objectKey: "publication-index.json",
        size: Buffer.byteLength(`${JSON.stringify(index, null, 2)}\n`, "utf8"),
        checksum: createHash("sha256")
          .update(`${JSON.stringify(index, null, 2)}\n`, "utf8")
          .digest("hex"),
      },
    ]);
    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.2.3" },
    ]);
  });
});

test("the Publication Index includes all supplied published versions and appends the planned version", async () => {
  await withTempDir(async (root) => {
    await writePreviousIndex(
      root,
      previousIndex([
        indexVersion("1.0.0"),
        indexVersion("1.1.0"),
        indexVersion("1.2.0", { status: "yanked" }),
      ]),
    );
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.3.0" }),
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

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);

    const versions = output.publicationIndex.packages[0].versions;
    assert.deepEqual(
      versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0", "1.2.0", "1.3.0"],
      "all-version history keeps semver order with the new version appended",
    );

    assert.deepEqual(versions[0], indexVersion("1.0.0"));
    assert.equal(
      versions[2].status,
      "yanked",
      "yanked status is preserved from supplied history",
    );
    assert.equal(versions[2].reason, null);
    assert.deepEqual(versions[2].artifact, indexVersion("1.2.0", { status: "yanked" }).artifact);

    assert.deepEqual(versions[3].artifact, {
      objectKey: "artifacts/example.plugin-1.3.0.zip",
      checksum: output.packages[0].build.artifact.checksum,
      size: output.packages[0].build.artifact.size,
      sourceCommit: SOURCE_COMMIT,
      publishedAt: PUBLISHED_AT,
    });
    assert.equal(versions[3].status, "published");

    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.3.0" },
    ]);
  });
});

test("the latest recommended version falls back to the latest non-yanked supplied version", async () => {
  await withTempDir(async (root) => {
    await writePreviousIndex(
      root,
      previousIndex([
        indexVersion("1.0.0"),
        indexVersion("1.1.0"),
        indexVersion("1.2.0", { status: "yanked" }),
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

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);

    const versions = output.publicationIndex.packages[0].versions;
    assert.deepEqual(
      versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0", "1.2.0"],
    );
    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.1.0" },
    ]);
    assert.equal(output.publicationPlan.indexWrites.length, 1);
  });
});

test("no recommendation is derived when every supplied version is yanked", async () => {
  await withTempDir(async (root) => {
    await writePreviousIndex(
      root,
      previousIndex([
        indexVersion("1.0.0", { status: "yanked" }),
        indexVersion("1.1.0", { status: "yanked" }),
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

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.publicationIndex.packages[0].versions.length, 2);
    assert.deepEqual(output.publicationPlan.recommendations, []);
  });
});

test("deterministic object keys sanitize version metadata and are stable across runs", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.2.3+build.5" }),
    );

    const args = [
      "validate",
      "--root",
      root,
      "--json",
      "--source-commit",
      SOURCE_COMMIT,
      "--published-at",
      PUBLISHED_AT,
    ];

    const first = JSON.parse((await runCli(args)).stdout);
    const second = JSON.parse((await runCli(args)).stdout);

    const [entry] = first.publicationIndex.packages[0].versions;
    assert.equal(entry.artifact.objectKey, "artifacts/example.plugin-1.2.3-build.5.zip");
    assert.equal(
      first.publicationPlan.artifactWrites[0].objectKey,
      "artifacts/example.plugin-1.2.3-build.5.zip",
    );
    assert.deepEqual(first.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.2.3+build.5" },
    ]);

    assert.equal(
      second.publicationIndex.packages[0].versions[0].artifact.objectKey,
      first.publicationIndex.packages[0].versions[0].artifact.objectKey,
      "object keys are stable across repeat dry-runs",
    );
  });
});

test("a rebuilt version matching the published artifact is docs-only and is not written again", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), [
      "process",
    ]);
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
    assert.equal(baseline.ok, true);
    const artifact = baseline.packages[0].build.artifact;

    await writePreviousIndex(
      root,
      previousIndex([publishedEntry("1.2.3", artifact)]),
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

    const [pkg] = output.packages;
    assert.equal(pkg.change.kind, "docs-only");
    assert.match(pkg.change.reason, /identical Plugin Artifact and Package Metadata/);
    assert.match(pkg.change.reason, /no new publication/);

    const versions = output.publicationIndex.packages[0].versions;
    assert.equal(versions.length, 1);
    assert.deepEqual(
      versions[0],
      publishedEntry("1.2.3", artifact),
      "the published entry wins over the unchanged rebuild",
    );
    assert.deepEqual(
      output.publicationPlan.artifactWrites,
      [],
      "docs-only changes plan no artifact write",
    );
  });
});

test("an unreadable or malformed previous index fails validation without index writes", async () => {
  await withTempDir(async (root) => {
    const missing = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      "missing.json",
    ]);
    const missingOutput = JSON.parse(missing.stdout);
    assert.equal(missing.code, 1);
    assert.equal(missingOutput.ok, false);
    assert.equal(missingOutput.validation.errors[0].code, "PREVIOUS_INDEX_UNREADABLE");
    assert.match(missingOutput.validation.errors[0].message, /Could not read/);
    assert.deepEqual(missingOutput.publicationIndex, { schemaVersion: 1, packages: [] });
    assert.deepEqual(missingOutput.publicationPlan.indexWrites, []);

    await writePreviousIndex(root, { schemaVersion: 1, packages: "not-an-array" });
    const malformed = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);
    const malformedOutput = JSON.parse(malformed.stdout);
    assert.equal(malformed.code, 1);
    assert.equal(malformedOutput.ok, false);
    assert.equal(malformedOutput.validation.errors[0].code, "INVALID_PREVIOUS_INDEX");
    assert.match(
      malformedOutput.validation.errors[0].message,
      /missing the 'packages' array/,
    );
    assert.deepEqual(malformedOutput.publicationPlan.indexWrites, []);

    await writePreviousIndex(root, { schemaVersion: 2, packages: [] });
    const wrongVersion = await runCli([
      "validate",
      "--root",
      root,
      "--json",
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);
    const wrongVersionOutput = JSON.parse(wrongVersion.stdout);
    assert.equal(wrongVersion.code, 1);
    assert.equal(wrongVersionOutput.validation.errors[0].code, "INVALID_PREVIOUS_INDEX");
    assert.deepEqual(wrongVersionOutput.publicationPlan.indexWrites, []);
  });
});

test("legacy boolean yanked entries in a supplied index are read as their status", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(
      root,
      "example.plugin",
      validManifest({ version: "1.1.0" }),
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
        {
          ...indexVersion("1.0.0"),
          yanked: true,
          ...{ status: undefined, reason: undefined },
        },
        {
          ...indexVersion("1.1.0"),
          artifact,
          yanked: false,
          ...{ status: undefined, reason: undefined },
        },
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
    const versions = output.publicationIndex.packages[0].versions;
    assert.equal(versions[0].status, "yanked", "legacy yanked:true is read as yanked");
    assert.equal(versions[0].yanked, undefined, "the legacy boolean is not carried over");
    assert.equal(versions[1].status, "published", "legacy yanked:false reads as published");
    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.1.0" },
    ]);
  });
});
