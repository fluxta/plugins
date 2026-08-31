import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  writeSourceFiles,
} from "./helpers.mjs";

const SOURCE_COMMIT = "c".repeat(40);
const PUBLISHED_AT = "2026-08-06T12:00:00.000Z";

function publishArgs(root, extraArgs = []) {
  return [
    "publish",
    "--root",
    root,
    "--json",
    "--publisher",
    "fake",
    "--state-dir",
    path.join(root, "store"),
    "--source-commit",
    SOURCE_COMMIT,
    "--published-at",
    PUBLISHED_AT,
    ...extraArgs,
  ];
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

async function storeIndex(root) {
  const contents = await readFile(path.join(root, "store", "publication-index.json"), "utf8");
  return JSON.parse(contents);
}

test("publish writes new Plugin Artifacts and the Publication Index through the same repository seam", async () => {
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

    const validate = JSON.parse(
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

    const result = await runCli(publishArgs(root));
    assert.equal(result.code, 0, `unexpected publish output: ${result.stdout}`);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);

    assert.equal(output.ok, true);
    assert.equal(output.mode, "publish");
    assert.equal(output.dryRun, false);
    assert.equal(output.publisher, "fake");
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(
      output.publicationPlan.artifactWrites,
      validate.publicationPlan.artifactWrites,
      "publish plans the same artifact writes as the validate dry-run",
    );

    const artifact = output.packages[0].build.artifact;
    assert.deepEqual(output.publication.artifactWrites, [
      {
        package: "example.plugin",
        version: "1.2.3",
        pluginFolder: "example.plugin",
        artifact: "artifacts/example.plugin-1.2.3.zip",
        objectKey: "artifacts/example.plugin-1.2.3.zip",
        size: artifact.size,
        checksum: artifact.checksum,
        sourceCommit: SOURCE_COMMIT,
        publishedAt: PUBLISHED_AT,
      },
    ]);
    assert.deepEqual(output.publication.refusals, []);
    assert.deepEqual(output.publication.alreadyPublished, []);
    assert.equal(output.publication.indexWrite.skipped, false);
    assert.deepEqual(output.publicationPlan.networkWrites, [
      { objectKey: "artifacts/example.plugin-1.2.3.zip", size: artifact.size, checksum: artifact.checksum },
      {
        objectKey: "publication-index.json",
        size: output.publication.indexWrite.size,
        checksum: output.publication.indexWrite.checksum,
      },
    ]);

    const storedArtifact = await readFile(
      path.join(root, "store", "artifacts", "example.plugin-1.2.3.zip"),
    );
    assert.deepEqual(
      storedArtifact,
      await readFile(path.join(root, artifact.path)),
      "the published object holds the locally built artifact bytes",
    );

    const index = await storeIndex(root);
    assert.deepEqual(index, output.publicationIndex, "the stored index matches the generated index");
    assert.equal(index.schemaVersion, 1);
    const [entry] = index.packages[0].versions;
    assert.deepEqual(entry.artifact, {
      objectKey: "artifacts/example.plugin-1.2.3.zip",
      checksum: artifact.checksum,
      size: artifact.size,
      sourceCommit: SOURCE_COMMIT,
      publishedAt: PUBLISHED_AT,
    });
    assert.equal(entry.status, "published");
  });
});

test("publish preserves all-version history and yanked state from the publisher's existing index", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest({ version: "1.0.0" }), [
      "process",
    ]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const first = await runCli(publishArgs(root));
    assert.equal(first.code, 0, `unexpected publish output: ${first.stdout}`);

    await writeSourceFiles(root, "example.plugin", [
      "process/main.js",
      "process/extra.js",
    ]);
    await writeManifest(root, "example.plugin", validManifest({ version: "1.1.0" }));
    await writeFile(
      path.join(root, "plugins", "example.plugin", "publication-state.json"),
      `${JSON.stringify(
        {
          package: "example.plugin",
          versions: {
            "1.0.0": { status: "yanked", reason: "Causes a crash on startup" },
          },
        },
        null,
        2,
      )}\n`,
    );

    const second = await runCli(publishArgs(root));
    assert.equal(second.code, 0, `unexpected publish output: ${second.stdout}`);
    const output = JSON.parse(second.stdout);
    assert.equal(output.ok, true);

    assert.deepEqual(
      output.publication.artifactWrites.map((write) => write.version),
      ["1.1.0"],
      "only the new version is published",
    );

    const index = await storeIndex(root);
    const versions = index.packages[0].versions;
    assert.deepEqual(
      versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0"],
      "all-version history is preserved",
    );
    assert.equal(versions[0].status, "yanked");
    assert.equal(versions[0].reason, "Causes a crash on startup");
    assert.equal(versions[0].artifact.objectKey, "artifacts/example.plugin-1.0.0.zip");
    assert.equal(versions[0].artifact.sourceCommit, SOURCE_COMMIT);
    assert.equal(versions[0].artifact.publishedAt, PUBLISHED_AT);
    assert.equal(versions[1].status, "published");
    assert.deepEqual(output.publicationPlan.recommendations, [
      { package: "example.plugin", latestVersion: "1.1.0" },
    ]);
  });
});

test("publish refuses to overwrite an existing artifact object with different content", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), ["process"]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const driftedBytes = Buffer.from("existing artifact bytes from a lost index\n");
    const storeDir = path.join(root, "store", "artifacts");
    await mkdir(storeDir, { recursive: true });
    await writeFile(path.join(storeDir, "example.plugin-1.2.3.zip"), driftedBytes);

    const result = await runCli(publishArgs(root));
    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.equal(output.publication.indexWrite, null);
    assert.deepEqual(output.publication.refusals, [
      {
        package: "example.plugin",
        version: "1.2.3",
        objectKey: "artifacts/example.plugin-1.2.3.zip",
        reason: output.publication.refusals[0].reason,
      },
    ]);
    assert.match(output.publication.refusals[0].reason, /already exists with different content/);
    assert.match(output.publication.refusals[0].reason, /never overwritten/);
    assert.deepEqual(output.publicationPlan.networkWrites, []);

    assert.deepEqual(
      await readFile(path.join(storeDir, "example.plugin-1.2.3.zip")),
      driftedBytes,
      "the existing object is not overwritten",
    );
  });
});

test("publish writes nothing when validation fails", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "bad-name!", validManifest({ name: "bad-name!" }));
    await writeCodeowners(root, "/plugins/bad-name!/ @inferst\n");

    const result = await runCli(publishArgs(root));
    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.mode, "publish");
    assert.equal(output.publication.artifactWrites.length, 0);
    assert.equal(output.publication.indexWrite, null);
    assert.deepEqual(output.publicationPlan.networkWrites, []);
    assert.match(output.publication.notes[0], /No objects were written/);

    await assert.rejects(
      readdir(path.join(root, "store")),
      { code: "ENOENT" },
      "no store directory is created when validation fails",
    );
  });
});

test("a refusal on any artifact aborts before uploading any other object", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "aaa.example.plugin", validManifest({ name: "aaa.example.plugin" }), ["process"]);
    await writeSourceFiles(root, "aaa.example.plugin", ["process/main.js"]);
    await writeBuildablePackage(root, "bbb.example.plugin", validManifest({ name: "bbb.example.plugin" }), ["process"]);
    await writeSourceFiles(root, "bbb.example.plugin", ["process/main.js"]);
    await writeCodeowners(
      root,
      "plugins/aaa.example.plugin @inferst\nplugins/bbb.example.plugin @inferst\n",
    );

    const driftedBytes = Buffer.from("drifted artifact bytes\n");
    const artifactsDir = path.join(root, "store", "artifacts");
    await mkdir(artifactsDir, { recursive: true });
    await writeFile(path.join(artifactsDir, "bbb.example.plugin-1.2.3.zip"), driftedBytes);

    const result = await runCli(publishArgs(root));
    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.publication.refusals.length, 1);
    assert.equal(output.publication.refusals[0].package, "bbb.example.plugin");
    assert.equal(output.publication.indexWrite, null);
    assert.deepEqual(output.publicationPlan.networkWrites, []);

    assert.deepEqual(
      await readdir(path.join(root, "store", "artifacts")),
      ["bbb.example.plugin-1.2.3.zip"],
      "the non-refusing artifact is not uploaded",
    );
    await assert.rejects(
      readFile(path.join(root, "store", "publication-index.json")),
      { code: "ENOENT" },
      "the Publication Index is not written",
    );
  });
});

test("publish skips the index write when the index is already current", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), ["process"]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const first = await runCli(publishArgs(root));
    assert.equal(first.code, 0, `unexpected publish output: ${first.stdout}`);

    const second = await runCli(publishArgs(root));
    assert.equal(second.code, 0, `unexpected publish output: ${second.stdout}`);
    const output = JSON.parse(second.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.deepEqual(output.publication.refusals, []);
    assert.equal(output.publication.indexWrite.skipped, true);
    assert.match(output.publication.indexWrite.reason, /already current/);
    assert.deepEqual(output.publicationPlan.networkWrites, []);
  });
});

test("publish --out additionally writes the full JSON result to a file, for a later CI step to read", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), ["process"]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const outPath = path.join(root, "publish-output", "result.json");
    const result = await runCli(publishArgs(root, ["--out", outPath]));

    assert.equal(result.code, 0, `unexpected publish output: ${result.stdout}`);
    const stdoutOutput = JSON.parse(result.stdout);
    const fileOutput = JSON.parse(await readFile(outPath, "utf8"));
    assert.deepEqual(fileOutput, stdoutOutput);
    assert.equal(fileOutput.publicationIndex.packages[0].name, "example.plugin");
  });
});

test("publish requires --publisher and fails with structured invalid arguments", async () => {
  await withTempDir(async (root) => {
    const result = await runCli(["publish", "--root", root, "--json"]);
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "INVALID_ARGUMENTS");
    assert.match(output.validation.errors[0].message, /--publisher <fake\|r2>/);
  });
});

test("publish with the r2 publisher fails without R2 credentials and writes nothing", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest());

    const result = await runCli([
      "publish",
      "--root",
      root,
      "--json",
      "--publisher",
      "r2",
    ]);
    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.publisher, "r2");
    assert.equal(output.validation.errors[0].code, "PUBLISH_CREDENTIALS_MISSING");
    assert.match(output.validation.errors[0].message, /R2_ACCESS_KEY_ID/);
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.deepEqual(output.publicationPlan.networkWrites, []);
  });
});

test("publish reads the previous index from the publisher itself and preserves its history", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest({ version: "1.1.0" }), [
      "process",
    ]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);
    const storeDir = path.join(root, "store");
    await mkdir(storeDir, { recursive: true });
    await writeFile(
      path.join(storeDir, "publication-index.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          packages: [
            {
              name: "example.plugin",
              versions: [
                {
                  version: "1.0.0",
                  manifest: { name: "example.plugin", version: "1.0.0" },
                  packageMetadata: {},
                  artifact: {
                    objectKey: "artifacts/example.plugin-1.0.0.zip",
                    checksum: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
                    size: 1,
                    sourceCommit: "base",
                    publishedAt: "2026-01-01T00:00:00.000Z",
                  },
                  status: "published",
                  reason: null,
                },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = await runCli(publishArgs(root));
    assert.equal(result.code, 0, `unexpected publish output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(
      output.publication.previousIndexSource,
      "publisher 'fake' (publication-index.json)",
    );

    const index = await storeIndex(root);
    assert.deepEqual(
      index.packages[0].versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0"],
      "history from the publisher's previous index is preserved",
    );
  });
});

test("publish rejects --previous-index with structured invalid arguments", async () => {
  await withTempDir(async (root) => {
    const result = await runCli(
      publishArgs(root, ["--previous-index", path.join(root, "previous-index.json")]),
    );
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "INVALID_ARGUMENTS");
    assert.match(output.validation.errors[0].message, /reads the previous Publication Index from the publisher/);
  });
});

test("a failing publisher fails the run instead of reporting success", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), ["process"]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    await writeFile(path.join(root, "store"), "a file, not a directory");

    const result = await runCli(publishArgs(root));
    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.publication.errors.length, 1);
    assert.equal(output.publication.errors[0].code, "PUBLISHER_ERROR");
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.equal(output.publication.indexWrite, null);
    assert.deepEqual(output.publicationPlan.networkWrites, []);
  });
});

test("publish --from-snapshot recombines a build produced by a separate, credential-free step", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), ["process"]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const snapshotPath = path.join(root, "build-output", "build-snapshot.json");
    // Runs with no publisher and no R2 environment variables at all, exactly
    // like the credential-free build job in CI.
    const build = await runCli(["build", "--root", root, "--json", "--out", snapshotPath]);
    assert.equal(build.code, 0, `unexpected build output: ${build.stdout}`);

    // The credentialed step never rebuilds; it only reads the snapshot.
    const result = await runCli(publishArgs(root, ["--from-snapshot", snapshotPath]));
    assert.equal(result.code, 0, `unexpected publish output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);

    assert.equal(output.ok, true);
    assert.equal(output.publication.artifactWrites.length, 1);
    assert.equal(output.publication.artifactWrites[0].package, "example.plugin");
    assert.equal(output.publication.artifactWrites[0].version, "1.2.3");
    assert.equal(output.publication.indexWrite.skipped, false);

    const storedArtifact = await readFile(
      path.join(root, "store", "artifacts", "example.plugin-1.2.3.zip"),
    );
    const builtArtifact = JSON.parse(await readFile(snapshotPath, "utf8")).packages[0].build
      .artifact;
    assert.deepEqual(
      storedArtifact,
      await readFile(path.join(root, builtArtifact.path)),
      "the published bytes are exactly what the build step produced, unmodified",
    );
  });
});

test("publish --from-snapshot classifies against the real previous index, not the build step's view of it", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest({ version: "1.0.0" }), [
      "process",
    ]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const first = await runCli(publishArgs(root));
    assert.equal(first.code, 0, `unexpected publish output: ${first.stdout}`);

    await writeManifest(root, "example.plugin", validManifest({ version: "1.1.0" }));
    await writeSourceFiles(root, "example.plugin", [
      "process/main.js",
      "process/extra.js",
    ]);

    // The build step has no publisher and no previous index — it cannot know
    // '1.0.0' is already published.
    const snapshotPath = path.join(root, "build-output", "build-snapshot.json");
    const build = await runCli(["build", "--root", root, "--json", "--out", snapshotPath]);
    assert.equal(build.code, 0, `unexpected build output: ${build.stdout}`);

    const second = await runCli(publishArgs(root, ["--from-snapshot", snapshotPath]));
    assert.equal(second.code, 0, `unexpected publish output: ${second.stdout}`);
    const output = JSON.parse(second.stdout);
    assert.equal(output.ok, true);

    // The credentialed step still gets this right: it fetched the real
    // previous index from the publisher and only planned the new version.
    assert.deepEqual(
      output.publication.artifactWrites.map((write) => write.version),
      ["1.1.0"],
    );

    const index = await storeIndex(root);
    assert.deepEqual(
      index.packages[0].versions.map((entry) => entry.version),
      ["1.0.0", "1.1.0"],
      "history from before the split build step is preserved",
    );
  });
});

test("publish --from-snapshot fails clearly and writes nothing when the snapshot cannot be read", async () => {
  await withTempDir(async (root) => {
    await writeBuildablePackage(root, "example.plugin", validManifest(), ["process"]);
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const result = await runCli(
      publishArgs(root, ["--from-snapshot", path.join(root, "missing-snapshot.json")]),
    );
    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "BUILD_SNAPSHOT_UNREADABLE");
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.deepEqual(output.publicationPlan.networkWrites, []);

    await assert.rejects(
      readdir(path.join(root, "store")),
      { code: "ENOENT" },
      "no store directory is created when the snapshot cannot be read",
    );
  });
});
