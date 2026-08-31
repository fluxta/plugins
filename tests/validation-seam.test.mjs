import { mkdir } from "node:fs/promises";
import path from "node:path";
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
} from "./helpers.mjs";

test("validate succeeds for an empty repository checkout", async () => {
  await withTempDir(async (root) => {
    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");

    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.ok, true);
    assert.equal(output.mode, "validate");
    assert.equal(output.dryRun, true);
    assert.deepEqual(output.packages, []);
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(output.publicationIndex, { schemaVersion: 1, packages: [] });
    assert.deepEqual(output.publicationPlan.networkWrites, []);
    assert.deepEqual(output.publicationPlan.artifactWrites, []);
    assert.deepEqual(output.publicationPlan.indexWrites, []);
    assert.deepEqual(output.publicationPlan.recommendations, []);
  });
});

test("validate accepts a Plugin Source Package with identity, Package Metadata, and ownership", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(
      root,
      "/plugins/example.plugin/ @inferst\n",
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);

    const [pkg] = output.packages;
    const { build, ...rest } = pkg;
    assert.deepEqual(rest, {
      id: "example.plugin",
      path: "plugins/example.plugin",
      status: "valid",
      manifest: {
        name: "example.plugin",
        version: "1.2.3",
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
      ownership: {
        status: "matched",
        maintainers: ["inferst"],
        codeowners: {
          path: ".github/CODEOWNERS",
          pattern: "/plugins/example.plugin/",
          owners: ["@inferst"],
        },
      },
      change: {
        kind: "new-version",
        reason:
          "Version '1.2.3' of 'example.plugin' has no published history; the built " +
          "Plugin Artifact is planned as the first publication.",
      },
    });
    assert.equal(build.status, "built");
    assert.equal(build.outputDir, "plugins/example.plugin/dist");
    assert.equal(build.pluginFolder, "example.plugin");
    assert.equal(build.artifact.path, "artifacts/example.plugin-1.2.3.zip");
    assert.equal(typeof build.artifact.size, "number");
    assert.match(build.artifact.checksum, /^[0-9a-f]{64}$/);
  });
});

test("validate reports package-scoped identity and Package Metadata failures", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "bad-name!", validManifest({ name: "bad-name!" }));
    await writeManifest(root, "mismatch", validManifest({ name: "other" }));
    await writeManifest(root, "system", validManifest({ name: "system" }));
    await writeManifest(
      root,
      "unsupported-api",
      validManifest({ name: "unsupported-api", apiVersion: 2 }),
    );
    await writeManifest(
      root,
      "bad-version",
      validManifest({ name: "bad-version", version: "next" }),
    );
    await writeManifest(
      root,
      "missing-metadata",
      validManifest({
        name: "missing-metadata",
        author: "",
        license: "",
        repository: undefined,
        homepage: undefined,
        minAppVersion: "",
        maintainers: [],
      }),
    );

    // Give every package a valid build contract and matching ownership so the
    // report isolates the identity and Package Metadata rules under test.
    const packageIds = [
      "bad-name!",
      "mismatch",
      "system",
      "unsupported-api",
      "bad-version",
      "missing-metadata",
    ];
    for (const packageId of packageIds) {
      await writeBuildContract(root, packageId, { buildScript: "true" });
    }
    await writeCodeowners(
      root,
      packageIds.map((packageId) => `/plugins/${packageId}/ @inferst`).join("\n"),
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");

    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.publicationPlan.networkWrites, []);

    assert.deepEqual(errorCodes(output), [
      {
        code: "INVALID_PACKAGE_ID",
        package: "bad-name!",
        field: "manifest.json.name",
      },
      {
        code: "INVALID_SEMVER",
        package: "bad-version",
        field: "manifest.json.version",
      },
      {
        code: "PACKAGE_ID_MISMATCH",
        package: "mismatch",
        field: "manifest.json.name",
      },
      {
        code: "MISSING_PACKAGE_METADATA",
        package: "missing-metadata",
        field: "manifest.json.author",
      },
      {
        code: "MISSING_PACKAGE_METADATA",
        package: "missing-metadata",
        field: "manifest.json.license",
      },
      {
        code: "MISSING_PACKAGE_METADATA",
        package: "missing-metadata",
        field: "manifest.json.repository|homepage",
      },
      {
        code: "MISSING_PACKAGE_METADATA",
        package: "missing-metadata",
        field: "manifest.json.minAppVersion",
      },
      {
        code: "MISSING_PACKAGE_METADATA",
        package: "missing-metadata",
        field: "manifest.json.maintainers",
      },
      {
        code: "BUILT_IN_PACKAGE_ID",
        package: "system",
        field: "manifest.json.name",
      },
      {
        code: "UNSUPPORTED_API_VERSION",
        package: "unsupported-api",
        field: "manifest.json.apiVersion",
      },
    ]);
  });
});

test("validate rejects a package directory without a manifest", async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, "plugins", "missing-manifest"), {
      recursive: true,
    });

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);

    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.packages, [
      {
        id: "missing-manifest",
        path: "plugins/missing-manifest",
        status: "invalid",
        change: null,
      },
    ]);
    assert.equal(output.validation.errors[0].code, "MISSING_MANIFEST");
    assert.equal(output.validation.errors[0].package, "missing-manifest");
    assert.equal(output.validation.errors[0].path, "plugins/missing-manifest");
  });
});

test("validate reports a machine-readable failure for a missing root", async () => {
  await withTempDir(async (root) => {
    const missingRoot = path.join(root, "missing");
    const result = await runCli(["validate", "--root", missingRoot, "--json"]);

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");

    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "ROOT_NOT_FOUND");
    assert.equal(output.dryRun, true);
    assert.deepEqual(output.publicationPlan.networkWrites, []);
  });
});

test("invalid commands fail with structured output", async () => {
  const result = await runCli(["ship", "--json"]);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");

  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.validation.errors[0].code, "UNKNOWN_COMMAND");
});
