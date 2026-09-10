import { readFile } from "node:fs/promises";
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

test("build writes a snapshot with every built package, with no publication credentials required", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin", ["process"]),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    const result = await runCli(["build", "--root", root, "--json", "--out", outPath]);

    assert.equal(result.code, 0, `unexpected build output: ${result.stdout}`);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.mode, "build");
    assert.deepEqual(output.validation.errors, []);

    const [pkg] = output.packages;
    assert.equal(pkg.id, "example.plugin");
    assert.equal(pkg.build.status, "built");
    assert.equal(pkg.build.artifact.path, "artifacts/example.plugin-1.2.3.zip");
    // A package summary at this phase has not been classified against any
    // publication history yet — that only happens once `publish` recombines
    // the snapshot with the real Publication Index.
    assert.equal(pkg.change, undefined);

    const snapshot = JSON.parse(await readFile(outPath, "utf8"));
    assert.equal(snapshot.schemaVersion, 1);
    assert.deepEqual(snapshot.packages, output.packages);
    assert.deepEqual(snapshot.errors, []);
    assert.deepEqual(snapshot.publicationStates, {});
  });
});

test("build --only narrows the snapshot to the named packages, leaving the rest undiscovered", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin", ["process"]),
    });
    await writeSourceFiles(root, "example.plugin", ["process/main.js"]);

    await writeManifest(root, "other.plugin", validManifest({ name: "other.plugin" }));
    await writeBuildContract(root, "other.plugin", {
      buildScript: simpleBuildScript("other.plugin", ["process"]),
    });
    await writeSourceFiles(root, "other.plugin", ["process/main.js"]);

    await writeCodeowners(
      root,
      "/plugins/example.plugin/ @inferst\n/plugins/other.plugin/ @inferst\n",
    );

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    const result = await runCli([
      "build",
      "--root",
      root,
      "--only",
      "example.plugin",
      "--json",
      "--out",
      outPath,
    ]);

    assert.equal(result.code, 0, `unexpected build output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(
      output.packages.map((pkg) => pkg.id),
      ["example.plugin"],
    );
  });
});

test("build --only accepts a comma-separated list of package IDs", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeManifest(root, "other.plugin", validManifest({ name: "other.plugin" }));
    await writeBuildContract(root, "other.plugin", {
      buildScript: simpleBuildScript("other.plugin"),
    });
    await writeManifest(root, "third.plugin", validManifest({ name: "third.plugin" }));
    await writeBuildContract(root, "third.plugin", {
      buildScript: simpleBuildScript("third.plugin"),
    });
    await writeCodeowners(
      root,
      "/plugins/example.plugin/ @inferst\n/plugins/other.plugin/ @inferst\n/plugins/third.plugin/ @inferst\n",
    );

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    const result = await runCli([
      "build",
      "--root",
      root,
      "--only",
      " example.plugin, third.plugin ",
      "--json",
      "--out",
      outPath,
    ]);

    assert.equal(result.code, 0, `unexpected build output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(
      output.packages.map((pkg) => pkg.id).sort(),
      ["example.plugin", "third.plugin"],
    );
  });
});

test("build --only naming an unknown package ID fails with a structured error and writes no snapshot", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    const result = await runCli([
      "build",
      "--root",
      root,
      "--only",
      "does-not-exist",
      "--json",
      "--out",
      outPath,
    ]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "UNKNOWN_ONLY_PACKAGE");
    await assert.rejects(readFile(outPath), { code: "ENOENT" });
  });
});

test("build fails and writes no snapshot when a package is invalid", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "bad-name!", validManifest({ name: "bad-name!" }));
    await writeCodeowners(root, "/plugins/bad-name!/ @inferst\n");

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    const result = await runCli(["build", "--root", root, "--json", "--out", outPath]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "INVALID_PACKAGE_ID");

    await assert.rejects(readFile(outPath), { code: "ENOENT" }, "no snapshot is written on failure");
  });
});

test("build fails when a package's own build script fails", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", { buildScript: "exit 1" });
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    const result = await runCli(["build", "--root", root, "--json", "--out", outPath]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "PACKAGE_BUILD_FAILED");

    await assert.rejects(readFile(outPath), { code: "ENOENT" });
  });
});

test("build requires --out and fails with structured invalid arguments", async () => {
  await withTempDir(async (root) => {
    const result = await runCli(["build", "--root", root, "--json"]);
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "INVALID_ARGUMENTS");
    assert.match(output.validation.errors[0].message, /--out <file>/);
  });
});

test("build never touches a publisher: it succeeds with R2 credentials present and unset in the environment", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");

    const outPath = path.join(root, "build-output", "build-snapshot.json");
    // Nothing in `build` should ever read these — they stand in for what a
    // leaked or misconfigured CI job might otherwise expose.
    const result = await runCli(["build", "--root", root, "--json", "--out", outPath], {
      env: {
        ...process.env,
        R2_ACCOUNT_ID: "leaked-account",
        R2_ACCESS_KEY_ID: "leaked-key-id",
        R2_SECRET_ACCESS_KEY: "leaked-secret",
        R2_BUCKET: "leaked-bucket",
      },
    });

    assert.equal(result.code, 0, `unexpected build output: ${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
  });
});
