import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  runPrValidate,
  simpleBuildScript,
  validManifest,
  withTempDir,
  writeBuildContract,
  writeCodeowners,
  writeManifest,
  writePreviousIndex,
} from "./helpers.mjs";

function git(dir, ...args) {
  execFileSync("git", args, { cwd: dir });
}

const GIT_IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];

test("pr-validate resolves the previous publication index from the base git ref", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-b", "main");
    await writePreviousIndex(root, {
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
    }, "publication-index.json");
    git(root, ...GIT_IDENTITY, "add", "-A");
    git(root, ...GIT_IDENTITY, "commit", "-m", "base publication state");

    git(root, "checkout", "-b", "feature");
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");
    git(root, ...GIT_IDENTITY, "add", "-A");
    git(root, ...GIT_IDENTITY, "commit", "-m", "new version");

    const result = await runPrValidate(["--root", root, "--base-ref", "main"]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /publication state: git ref 'main' \(publication-index.json\)/);
    assert.match(result.stdout, /\[ok\] example\.plugin 1\.2\.3 change: new-version/);
    assert.match(result.stdout, /RESULT: PASSED/);
  });
});

test("pr-validate fails with a package-scoped error report for an invalid package", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "bad-name!", validManifest({ name: "bad-name!" }));
    await writeCodeowners(root, "/plugins/bad-name!/ @inferst\n");

    const result = await runPrValidate(["--root", root]);

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /RESULT: FAILED/);
    assert.match(result.stdout, /\[invalid\] bad-name!/);
    assert.match(result.stdout, /bad-name! \[INVALID_PACKAGE_ID\]/);
    assert.match(
      result.stdout,
      /is not a valid package id; use lowercase letters, digits, '-', '_', and '\.'/,
    );
  });
});

test("pr-validate rejects a duplicate publication against the previous index with an actionable error", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");
    await writePreviousIndex(root, {
      schemaVersion: 1,
      packages: [
        {
          name: "example.plugin",
          versions: [
            {
              version: "1.2.3",
              manifest: { name: "example.plugin", version: "1.2.3" },
              packageMetadata: {
                author: "Example Author",
                license: "MIT",
                repository: "https://github.com/example/example.plugin",
                homepage: null,
                minAppVersion: "0.1.0",
                maintainers: ["inferst"],
              },
              artifact: {
                objectKey: "artifacts/example.plugin-1.2.3.zip",
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
    });

    const result = await runPrValidate(["--root", root, "--previous-index", "previous-index.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /publication state: file previous-index\.json/);
    assert.match(result.stdout, /example\.plugin \[DUPLICATE_PUBLICATION\]/);
    assert.match(result.stdout, /require a new manifest\.version/);
    assert.match(result.stdout, /RESULT: FAILED/);
  });
});

test("pr-validate fails when Cloudflare R2 credentials are present in the environment", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");

    const result = await runPrValidate(["--root", root], {
      env: { ...process.env, CLOUDFLARE_API_TOKEN: "secret" },
    });

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /no Cloudflare R2 credentials present: FAIL \(CLOUDFLARE_API_TOKEN\)/);
    assert.match(result.stdout, /RESULT: FAILED \(guard failures: credentials present\)/);
  });
});

test("pr-validate records the supplied source commit in the report", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");

    const sourceCommit = "0123456789abcdef0123456789abcdef01234567";
    const result = await runPrValidate(["--root", root, "--source-commit", sourceCommit]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, new RegExp(`source commit: ${sourceCommit}`));
  });
});

test("pr-validate fails when the base ref does not resolve", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-b", "main");
    await writeFile(path.join(root, "README.md"), "# repo\n");
    git(root, ...GIT_IDENTITY, "add", "-A");
    git(root, ...GIT_IDENTITY, "commit", "-m", "base");

    const result = await runPrValidate(["--root", root, "--base-ref", "missing-branch"]);

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /RESULT: FAILED \(guard failures: base ref 'missing-branch' does not resolve to a commit\)/);
  });
});

test("pr-validate notes when the base ref has no publication index and still passes", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");
    git(root, "init", "-b", "main");
    git(root, ...GIT_IDENTITY, "add", "-A");
    git(root, ...GIT_IDENTITY, "commit", "-m", "package without publication index");

    const result = await runPrValidate(["--root", root, "--base-ref", "main"]);

    assert.equal(result.code, 0);
    assert.match(
      result.stdout,
      /publication state: git ref 'main' has no publication-index\.json/,
    );
    assert.match(result.stdout, /RESULT: PASSED/);
  });
});

test("pr-validate passes a valid package and reports a package-scoped summary with no network writes", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n");

    const result = await runPrValidate(["--root", root]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /RESULT: PASSED/);
    assert.match(result.stdout, /\[ok\] example\.plugin/);
    assert.match(
      result.stdout,
      /example\.plugin 1\.2\.3 -> artifacts\/example\.plugin-1\.2\.3\.zip \([0-9a-f]{64}\)/,
    );
    assert.match(result.stdout, /no network writes planned \(validate-only\): PASS/);
    assert.match(result.stdout, /no Cloudflare R2 credentials present: PASS/);
  });
});
