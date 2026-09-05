import { mkdir, writeFile } from "node:fs/promises";
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

const PREVIOUS_SOURCE_COMMIT = "p".repeat(40);

function previousIndex(versions, packageName = "example.plugin") {
  return {
    schemaVersion: 1,
    packages: [{ name: packageName, versions }],
  };
}

function publishedEntry(manifest, artifact, overrides = {}) {
  return {
    version: manifest.version,
    manifest: {
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      title: manifest.title,
      description: manifest.description,
    },
    packageMetadata: {
      author: manifest.author,
      license: manifest.license,
      minAppVersion: manifest.minAppVersion,
      maintainers: manifest.maintainers,
    },
    artifact: {
      objectKey: `artifacts/${manifest.name}-${manifest.version}.zip`,
      checksum: artifact.checksum,
      size: artifact.size,
      sourceCommit: PREVIOUS_SOURCE_COMMIT,
      publishedAt: "2026-01-01T00:00:00.000Z",
    },
    status: "published",
    reason: null,
    ...overrides,
  };
}

async function runValidate(root, extraArgs = []) {
  const result = await runCli(["validate", "--root", root, "--json", ...extraArgs]);
  return { result, output: JSON.parse(result.stdout) };
}

async function writePackageFile(root, packageId, relativePath, contents) {
  const fullPath = path.join(root, "plugins", packageId, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}

async function writeBuildablePackage(root, packageId, manifest, buildScript, sourceFiles) {
  await writeManifest(root, packageId, manifest);
  await writeBuildContract(root, packageId, { buildScript });
  await writeCodeowners(root, `plugins/${packageId} @inferst\n`);
  await writeSourceFiles(root, packageId, sourceFiles);
}

test("a duplicate publication attempt for an existing version is rejected before upload", async () => {
  await withTempDir(async (root) => {
    const manifest = validManifest();
    await writeBuildablePackage(
      root,
      "example.plugin",
      manifest,
      simpleBuildScript("example.plugin", ["process"]),
      ["process/main.js"],
    );

    const { output: baseline } = await runValidate(root);
    assert.equal(baseline.ok, true);
    assert.equal(baseline.packages[0].change.kind, "new-version");
    assert.match(baseline.packages[0].change.reason, /no published history/);
    const artifact = baseline.packages[0].build.artifact;
    await writePreviousIndex(root, previousIndex([publishedEntry(manifest, artifact)]));

    await writeSourceFiles(root, "example.plugin", [
      "process/main.js",
      "process/extra.js",
    ]);

    const { result, output } = await runValidate(root, [
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 1);
    assert.equal(output.ok, false);
    assert.deepEqual(
      output.validation.errors.map((error) => error.code),
      ["DUPLICATE_PUBLICATION"],
    );
    assert.equal(output.validation.errors[0].package, "example.plugin");
    assert.equal(output.validation.errors[0].field, "version");
    assert.match(output.validation.errors[0].message, /already published/);
    assert.match(output.validation.errors[0].message, /rejected before upload/);
    assert.match(output.validation.errors[0].message, /requires? a new manifest\.version/);

    assert.equal(output.packages[0].change.kind, "duplicate");
    assert.match(output.packages[0].change.reason, /differs from the published artifact/);
    assert.match(output.packages[0].change.reason, /manifest\.version must be bumped/);

    assert.deepEqual(
      output.publicationPlan.artifactWrites,
      [],
      "the rejected duplicate is not planned for upload",
    );

    const versions = output.publicationIndex.packages[0].versions;
    assert.equal(versions.length, 1);
    assert.equal(versions[0].artifact.checksum, artifact.checksum);
    assert.equal(versions[0].artifact.sourceCommit, PREVIOUS_SOURCE_COMMIT);
    assert.equal(
      versions[0].artifact.objectKey,
      "artifacts/example.plugin-1.2.3.zip",
      "the published entry is kept, not replaced by the rejected rebuild",
    );
  });
});

test("trusted Package Metadata changes are artifact-affecting and require a version bump", async () => {
  await withTempDir(async (root) => {
    const manifest = validManifest();
    const staticBuildScript =
      "mkdir -p dist/example.plugin && cp built-manifest.json dist/example.plugin/manifest.json";
    await writeBuildablePackage(root, "example.plugin", manifest, staticBuildScript, []);
    await writePackageFile(
      root,
      "example.plugin",
      "built-manifest.json",
      `${JSON.stringify(
        {
          name: "example.plugin",
          apiVersion: 1,
          version: "1.2.3",
          title: "Example Plugin",
          description: "An example trusted package.",
          actions: [],
        },
        null,
        2,
      )}\n`,
    );

    const { output: baseline } = await runValidate(root);
    assert.equal(baseline.ok, true);
    const artifact = baseline.packages[0].build.artifact;
    await writePreviousIndex(root, previousIndex([publishedEntry(manifest, artifact)]));

    await writeManifest(root, "example.plugin", validManifest({ license: "Apache-2.0" }));

    const { result, output } = await runValidate(root, [
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 1);
    assert.equal(output.ok, false);
    assert.deepEqual(
      output.validation.errors.map((error) => error.code),
      ["DUPLICATE_PUBLICATION"],
    );
    assert.match(
      output.validation.errors[0].message,
      /trusted Package Metadata changed, which is artifact-affecting/,
    );
    assert.equal(
      output.packages[0].build.artifact.checksum,
      artifact.checksum,
      "the rebuilt artifact is unchanged; the Package Metadata rule rejects the change",
    );
    assert.equal(output.packages[0].change.kind, "duplicate");
    assert.match(
      output.packages[0].change.reason,
      /Package Metadata changed, which is artifact-affecting/,
    );
  });
});

test("source changes without a version bump require a new manifest.version", async () => {
  await withTempDir(async (root) => {
    const manifest = validManifest();
    await writeBuildablePackage(
      root,
      "example.plugin",
      manifest,
      simpleBuildScript("example.plugin", ["process"]),
      ["process/main.js"],
    );

    const { output: baseline } = await runValidate(root);
    const artifact = baseline.packages[0].build.artifact;
    await writePreviousIndex(root, previousIndex([publishedEntry(manifest, artifact)]));

    await writePackageFile(root, "example.plugin", "process/main.js", "changed source code\n");

    const { result, output } = await runValidate(root, [
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 1);
    assert.equal(output.ok, false);
    assert.notEqual(
      output.packages[0].build.artifact.checksum,
      artifact.checksum,
      "the source change alters the built artifact",
    );
    assert.equal(output.packages[0].change.kind, "duplicate");
    assert.match(
      output.packages[0].change.reason,
      /the rebuilt Plugin Artifact differs from the published artifact/,
    );
    assert.match(
      output.validation.errors[0].message,
      /Artifact-affecting changes require a new manifest\.version/,
    );
    assert.deepEqual(output.publicationPlan.artifactWrites, []);
  });
});

test("a version bump with changed artifacts plans a new publication and preserves history", async () => {
  await withTempDir(async (root) => {
    const manifest = validManifest();
    await writeBuildablePackage(
      root,
      "example.plugin",
      manifest,
      simpleBuildScript("example.plugin", ["process"]),
      ["process/main.js"],
    );

    const { output: baseline } = await runValidate(root);
    const artifact = baseline.packages[0].build.artifact;
    await writePreviousIndex(root, previousIndex([publishedEntry(manifest, artifact)]));

    await writeSourceFiles(root, "example.plugin", [
      "process/main.js",
      "process/extra.js",
    ]);
    await writeManifest(root, "example.plugin", validManifest({ version: "1.2.4" }));

    const { result, output } = await runValidate(root, [
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 0);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);

    assert.equal(output.packages[0].change.kind, "new-version");
    assert.match(
      output.packages[0].change.reason,
      /Version '1\.2\.4' .* has not been published before/,
    );

    assert.deepEqual(output.publicationPlan.artifactWrites, [
      {
        package: "example.plugin",
        version: "1.2.4",
        pluginFolder: "example.plugin",
        artifact: "artifacts/example.plugin-1.2.4.zip",
        objectKey: "artifacts/example.plugin-1.2.4.zip",
        size: output.packages[0].build.artifact.size,
        checksum: output.packages[0].build.artifact.checksum,
      },
    ]);

    const versions = output.publicationIndex.packages[0].versions;
    assert.deepEqual(
      versions.map((entry) => entry.version),
      ["1.2.3", "1.2.4"],
    );
    assert.deepEqual(
      versions[0],
      publishedEntry(manifest, artifact),
      "the previously published version is preserved untouched",
    );
    assert.equal(versions[1].artifact.sourceCommit, "unknown");
    assert.equal(versions[1].status, "published");

    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.2.4" },
    ]);
  });
});

test("a version lower than the highest published version is rejected before upload", async () => {
  await withTempDir(async (root) => {
    const manifest = validManifest();
    await writeBuildablePackage(
      root,
      "example.plugin",
      manifest,
      simpleBuildScript("example.plugin", ["process"]),
      ["process/main.js"],
    );

    const { output: baseline } = await runValidate(root);
    const artifact = baseline.packages[0].build.artifact;
    await writePreviousIndex(
      root,
      previousIndex([
        publishedEntry(manifest, artifact),
        publishedEntry(validManifest({ version: "1.3.0" }), artifact),
      ]),
    );

    await writeManifest(root, "example.plugin", validManifest({ version: "1.2.4" }));

    const { result, output } = await runValidate(root, [
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 1);
    assert.equal(output.ok, false);
    assert.deepEqual(
      output.validation.errors.map((error) => error.code),
      ["NON_MONOTONIC_VERSION"],
    );
    assert.equal(output.validation.errors[0].package, "example.plugin");
    assert.equal(output.validation.errors[0].field, "version");
    assert.match(
      output.validation.errors[0].message,
      /lower than the highest published version '1\.3\.0'/,
    );
    assert.match(
      output.validation.errors[0].message,
      /rejected before upload/,
    );

    assert.equal(output.packages[0].change.kind, "non-monotonic-version");
    assert.match(
      output.packages[0].change.reason,
      /must be greater than every version already published/,
    );

    assert.deepEqual(
      output.publicationPlan.artifactWrites,
      [],
      "a non-monotonic version is not planned for upload",
    );
  });
});

test("docs-only changes pass without a new publication when the built artifact is unchanged", async () => {
  await withTempDir(async (root) => {
    const manifest = validManifest();
    await writeBuildablePackage(
      root,
      "example.plugin",
      manifest,
      simpleBuildScript("example.plugin", ["process"]),
      ["process/main.js"],
    );

    const { output: baseline } = await runValidate(root);
    const artifact = baseline.packages[0].build.artifact;
    await writePreviousIndex(root, previousIndex([publishedEntry(manifest, artifact)]));

    await writeSourceFiles(root, "example.plugin", ["README.md"]);

    const { result, output } = await runValidate(root, [
      "--previous-index",
      path.join(root, "previous-index.json"),
    ]);

    assert.equal(result.code, 0);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);

    assert.equal(output.packages[0].change.kind, "docs-only");
    assert.match(
      output.packages[0].change.reason,
      /identical Plugin Artifact and Package Metadata/,
    );
    assert.match(output.packages[0].change.reason, /requires no new publication/);

    assert.deepEqual(
      output.publicationPlan.artifactWrites,
      [],
      "docs-only changes plan no artifact write",
    );

    const versions = output.publicationIndex.packages[0].versions;
    assert.equal(versions.length, 1);
    assert.deepEqual(versions[0], publishedEntry(manifest, artifact));
  });
});
