import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import assert from "node:assert/strict";
import test from "node:test";

import {
  errorCodes,
  runCli,
  simpleBuildScript,
  validManifest,
  withTempDir,
  writeBuildContract,
  writeCodeowners,
  writeManifest,
  writeSourceFiles,
} from "./helpers.mjs";

function buildableManifest(overrides = {}) {
  return validManifest({
    icon: "icons/app.svg",
    main: "process/main.js",
    editor: "editor/config.js",
    actions: [
      { name: "Run", type: "run", icon: "icons/run.svg", editor: "editor/run.js" },
    ],
    ...overrides,
  });
}

async function writeOwnedPackage(root, packageId, manifest, buildScript) {
  await writeManifest(root, packageId, manifest);
  await writeBuildContract(root, packageId, { buildScript });
  await writeCodeowners(root, `plugins/${packageId} @inferst\n`);
}

function readZipEntries(archive) {
  const eocdOffset = archive.length - 22;
  assert.equal(archive.readUInt32LE(eocdOffset), 0x06054b50, "zip ends with EOCD");
  const count = archive.readUInt16LE(eocdOffset + 10);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, "central directory entry");
    const method = archive.readUInt16LE(offset + 10);
    const dataLength = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength);

    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;

    let data = archive.subarray(dataStart, dataStart + dataLength);
    if (method === 8 && dataLength > 0) {
      data = inflateRawSync(data);
    }

    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("a successful package build produces a valid zip Plugin Artifact with checksum and size", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "example.plugin",
      buildableManifest(),
      simpleBuildScript("example.plugin", ["icons", "editor", "process"]),
    );
    await writeSourceFiles(root, "example.plugin", [
      "icons/app.svg",
      "icons/run.svg",
      "editor/config.js",
      "editor/run.js",
      "process/main.js",
    ]);

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(output.publicationPlan.networkWrites, []);

    const indexWrites = output.publicationPlan.indexWrites;
    assert.equal(indexWrites.length, 1);
    assert.equal(indexWrites[0].objectKey, "publication-index.json");
    assert.equal(
      indexWrites[0].checksum,
      createHash("sha256")
        .update(`${JSON.stringify(output.publicationIndex, null, 2)}\n`, "utf8")
        .digest("hex"),
    );

    const build = output.packages[0].build;
    assert.equal(build.status, "built");
    assert.equal(build.outputDir, "plugins/example.plugin/dist");
    assert.equal(build.pluginFolder, "example.plugin");

    const artifactPath = path.join(root, build.artifact.path);
    const archive = await readFile(artifactPath);
    assert.equal(build.artifact.size, archive.length);
    assert.equal(build.artifact.checksum, createHash("sha256").update(archive).digest("hex"));

    assert.deepEqual(output.publicationPlan.artifactWrites, [
      {
        package: "example.plugin",
        version: "1.2.3",
        pluginFolder: "example.plugin",
        artifact: "artifacts/example.plugin-1.2.3.zip",
        objectKey: "artifacts/example.plugin-1.2.3.zip",
        size: build.artifact.size,
        checksum: build.artifact.checksum,
      },
    ]);

    const entries = readZipEntries(archive);
    assert.deepEqual(
      [...new Set(entries.map((entry) => entry.name.split("/")[0]))],
      ["example.plugin"],
      "archive contains exactly one top-level plugin folder",
    );

    for (const relativePath of [
      "manifest.json",
      "icons/app.svg",
      "icons/run.svg",
      "editor/config.js",
      "editor/run.js",
      "process/main.js",
    ]) {
      const entry = entries.find((candidate) => candidate.name === `example.plugin/${relativePath}`);
      assert.ok(entry, `archive contains ${relativePath}`);
      const onDisk = await readFile(
        path.join(root, "plugins", "example.plugin", "dist", "example.plugin", relativePath),
      );
      assert.equal(Buffer.compare(entry.data, onDisk), 0, `${relativePath} content matches`);
    }

    assert.equal(
      JSON.parse(
        entries.find((entry) => entry.name === "example.plugin/manifest.json").data.toString("utf8"),
      ).name,
      "example.plugin",
    );
  });
});

test("a package without package.json or a pnpm lockfile fails with actionable errors", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "no-contract", validManifest({ name: "no-contract" }));
    await writeCodeowners(root, "plugins/no-contract @inferst\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MISSING_PACKAGE_JSON",
        package: "no-contract",
        field: "package.json",
      },
      {
        code: "MISSING_LOCKFILE",
        package: "no-contract",
        field: "pnpm-lock.yaml",
      },
    ]);
    assert.match(output.validation.errors[0].message, /no package\.json found in the package root/);
    assert.deepEqual(output.publicationPlan.artifactWrites, []);
  });
});

test("a package without a standard build script fails with an actionable error", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(root, "no-script", validManifest({ name: "no-script" }), null);

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MISSING_BUILD_SCRIPT",
        package: "no-script",
        field: "package.json 'scripts.build'",
      },
    ]);
    assert.match(output.validation.errors[0].message, /missing the 'scripts\.build' build contract field/);
    assert.equal(output.packages[0].build, null);
  });
});

test("a package without a pnpm lockfile fails even when a build script exists", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "no-lockfile", validManifest({ name: "no-lockfile" }));
    await writeBuildContract(
      root,
      "no-lockfile",
      { buildScript: simpleBuildScript("no-lockfile"), writeLockfile: false },
    );
    await writeCodeowners(root, "plugins/no-lockfile @inferst\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MISSING_LOCKFILE",
        package: "no-lockfile",
        field: "pnpm-lock.yaml",
      },
    ]);
    assert.match(output.validation.errors[0].message, /no pnpm-lock\.yaml found in the package root/);
  });
});

test("a failing build script produces a package-scoped build failure", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(root, "failing", validManifest({ name: "failing" }), "exit 1");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "PACKAGE_BUILD_FAILED",
        package: "failing",
        field: "build",
      },
    ]);
    assert.match(output.validation.errors[0].message, /step 'pnpm run build'/);
    assert.match(output.validation.errors[0].message, /exit code 1/);
    assert.equal(output.packages[0].build, null);
  });
});

test("build output without a dist directory fails validation", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(root, "no-output", validManifest({ name: "no-output" }), "echo built");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "DIST_MISSING",
        package: "no-output",
        field: "dist",
      },
    ]);
    assert.match(output.validation.errors[0].message, /build output directory 'dist' does not exist/);
  });
});

test("build output without a top-level plugin folder fails validation", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "no-folder",
      validManifest({ name: "no-folder" }),
      "mkdir -p dist && echo note > dist/readme.txt",
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "NO_BUILT_FOLDER",
        package: "no-folder",
        field: "dist",
      },
    ]);
  });
});

test("build output with multiple top-level folders fails validation", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "two-folders",
      validManifest({ name: "two-folders" }),
      "mkdir -p dist/one dist/two",
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MULTIPLE_BUILT_FOLDERS",
        package: "two-folders",
        field: "dist",
      },
    ]);
    assert.match(output.validation.errors[0].message, /contains 2 folders \('one', 'two'\)/);
  });
});

test("a built plugin folder without manifest.json fails validation", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "no-manifest",
      validManifest({ name: "no-manifest" }),
      "mkdir -p dist/no-manifest && echo note > dist/no-manifest/readme.txt",
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "BUILT_MANIFEST_MISSING",
        package: "no-manifest",
        field: "dist/no-manifest/manifest.json",
      },
    ]);
    assert.match(output.validation.errors[0].message, /is missing manifest\.json/);
  });
});

test("a built plugin folder with invalid manifest.json fails validation", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "bad-manifest",
      validManifest({ name: "bad-manifest" }),
      "mkdir -p dist/bad-manifest && echo not-json > dist/bad-manifest/manifest.json",
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "INVALID_MANIFEST_JSON",
        package: "bad-manifest",
        field: "dist/bad-manifest/manifest.json",
      },
    ]);
  });
});

test("a built manifest whose name drifted from the package id fails validation", async () => {
  await withTempDir(async (root) => {
    const driftedManifest = JSON.stringify(validManifest({ name: "other" }));
    await writeOwnedPackage(
      root,
      "drifted",
      validManifest({ name: "drifted" }),
      `mkdir -p dist/drifted && printf '%s' '${driftedManifest}' > dist/drifted/manifest.json`,
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "IDENTITY_MISMATCH",
        package: "drifted",
        field: "dist/drifted/manifest.json",
      },
    ]);
    assert.match(
      output.validation.errors[0].message,
      /name \('other' built vs 'drifted' source\)/,
    );
  });
});

test("referenced background process, editor, and icon assets must exist in the built output", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "missing-assets",
      buildableManifest({ name: "missing-assets" }),
      simpleBuildScript("missing-assets"),
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "ASSET_MISSING",
        package: "missing-assets",
        field: "dist/missing-assets/manifest.json.main",
      },
      {
        code: "ASSET_MISSING",
        package: "missing-assets",
        field: "dist/missing-assets/manifest.json.icon",
      },
      {
        code: "ASSET_MISSING",
        package: "missing-assets",
        field: "dist/missing-assets/manifest.json.editor",
      },
      {
        code: "ASSET_MISSING",
        package: "missing-assets",
        field: "dist/missing-assets/manifest.json.actions[0].editor",
      },
      {
        code: "ASSET_MISSING",
        package: "missing-assets",
        field: "dist/missing-assets/manifest.json.actions[0].icon",
      },
    ]);
    assert.match(output.validation.errors[0].message, /'process\/main\.js' declared by 'main'/);
    assert.equal(output.packages[0].build, null);
    assert.deepEqual(output.publicationPlan.artifactWrites, []);
  });
});

test("absolute and folder-escaping asset paths are rejected", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "unsafe-paths",
      validManifest({
        name: "unsafe-paths",
        main: "index.js",
        actions: [
          { name: "A", type: "a", icon: "/absolute/icon.svg" },
          { name: "B", type: "b", editor: "../escape.js" },
        ],
      }),
      `${simpleBuildScript("unsafe-paths")} && touch dist/unsafe-paths/index.js`,
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "ASSET_ABSOLUTE_PATH",
        package: "unsafe-paths",
        field: "dist/unsafe-paths/manifest.json.actions[0].icon",
      },
      {
        code: "ASSET_OUTSIDE_FOLDER",
        package: "unsafe-paths",
        field: "dist/unsafe-paths/manifest.json.actions[1].editor",
      },
    ]);
    assert.match(output.validation.errors[0].message, /must be a relative path inside the built plugin folder/);
    assert.match(output.validation.errors[1].message, /escapes the built plugin folder/);
  });
});

test("no local artifact is produced for a package whose output is invalid", async () => {
  await withTempDir(async (root) => {
    await writeOwnedPackage(
      root,
      "broken",
      validManifest({ name: "broken", icon: "icons/missing.svg" }),
      simpleBuildScript("broken"),
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);

    const artifactsDir = path.join(root, "artifacts");
    await assert.rejects(() => readdir(artifactsDir), { code: "ENOENT" });
    assert.deepEqual(output.publicationPlan.artifactWrites, []);
  });
});
