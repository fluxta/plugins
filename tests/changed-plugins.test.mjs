import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { decideChangeScope } from "../scripts/changed-plugins.mjs";
import {
  runChangedPlugins,
  simpleBuildScript,
  validManifest,
  withTempDir,
  writeBuildContract,
  writeCodeowners,
  writeManifest,
} from "./helpers.mjs";

function git(dir, ...args) {
  execFileSync("git", args, { cwd: dir });
}

const GIT_IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];

function commit(root, message) {
  git(root, ...GIT_IDENTITY, "add", "-A");
  git(root, ...GIT_IDENTITY, "commit", "-m", message);
}

function head(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
}

async function scaffoldPlugin(root, id) {
  await writeManifest(root, id, validManifest({ name: id }));
  await writeBuildContract(root, id, { buildScript: simpleBuildScript(id) });
}

test("decideChangeScope: no changed paths means mode 'none'", () => {
  assert.deepEqual(decideChangeScope([], ["obs"]), {
    mode: "none",
    only: [],
    reason: "no files changed",
  });
});

test("decideChangeScope: a change under an existing plugin reports just that plugin", () => {
  const scope = decideChangeScope(["plugins/obs/apps/plugin/src/index.ts"], ["obs", "other"]);
  assert.equal(scope.mode, "only");
  assert.deepEqual(scope.only, ["obs"]);
});

test("decideChangeScope: changes under several existing plugins report all of them, sorted", () => {
  const scope = decideChangeScope(
    ["plugins/zeta/manifest.json", "plugins/alpha/manifest.json"],
    ["alpha", "zeta"],
  );
  assert.equal(scope.mode, "only");
  assert.deepEqual(scope.only, ["alpha", "zeta"]);
});

test("decideChangeScope: a path for a plugin that no longer exists is dropped, not reported", () => {
  const scope = decideChangeScope(["plugins/deleted/manifest.json"], ["obs"]);
  assert.deepEqual(scope, {
    mode: "none",
    only: [],
    reason: "changed files do not touch any existing plugin or shared build tooling",
  });
});

test("decideChangeScope: a bare file directly under plugins/ is not treated as a plugin ID", () => {
  const scope = decideChangeScope(["plugins/README.md"], ["obs"]);
  assert.equal(scope.mode, "none");
});

test("decideChangeScope: a change to this repository's own scripts forces a full rebuild", () => {
  const scope = decideChangeScope(
    ["plugins/obs/manifest.json", "scripts/lib/validate.mjs"],
    ["obs"],
  );
  assert.equal(scope.mode, "full");
  assert.deepEqual(scope.only, []);
});

test("decideChangeScope: a lockfile or workflow change also forces a full rebuild", () => {
  assert.equal(decideChangeScope(["pnpm-lock.yaml"], ["obs"]).mode, "full");
  assert.equal(decideChangeScope([".github/workflows/publish.yml"], ["obs"]).mode, "full");
  assert.equal(decideChangeScope(["package.json"], ["obs"]).mode, "full");
});

test("decideChangeScope: unrelated root files (docs, ADRs) neither force nor block a plugin change", () => {
  const scope = decideChangeScope(["README.md", "plugins/obs/manifest.json"], ["obs"]);
  assert.equal(scope.mode, "only");
  assert.deepEqual(scope.only, ["obs"]);
});

test("changed-plugins CLI: a push touching only docs reports mode 'none'", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-b", "main");
    await scaffoldPlugin(root, "obs");
    await writeCodeowners(root, "/plugins/obs/ @inferst\n");
    await writeFile(path.join(root, "README.md"), "# repo\n");
    commit(root, "initial");
    const before = head(root);

    await writeFile(path.join(root, "README.md"), "# repo\n\nmore docs\n");
    commit(root, "docs only");
    const after = head(root);

    const result = await runChangedPlugins(["--root", root, "--before", before, "--after", after]);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "none");
    assert.equal(output.run, false);
  });
});

test("changed-plugins CLI: a push touching one of several plugins reports only that plugin", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-b", "main");
    await scaffoldPlugin(root, "obs");
    await scaffoldPlugin(root, "other");
    await writeCodeowners(root, "/plugins/obs/ @inferst\n/plugins/other/ @inferst\n");
    commit(root, "initial");
    const before = head(root);

    await writeFile(path.join(root, "plugins", "obs", "manifest.json"), (
      await readFile(path.join(root, "plugins", "obs", "manifest.json"), "utf8")
    ).replace("1.2.3", "1.2.4"));
    commit(root, "bump obs");
    const after = head(root);

    const result = await runChangedPlugins(["--root", root, "--before", before, "--after", after]);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "only");
    assert.deepEqual(output.only, ["obs"]);
    assert.equal(output.run, true);
  });
});

test("changed-plugins CLI: an unresolvable --before (first push) reports mode 'full'", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-b", "main");
    await scaffoldPlugin(root, "obs");
    await writeCodeowners(root, "/plugins/obs/ @inferst\n");
    commit(root, "initial");
    const after = head(root);

    const result = await runChangedPlugins([
      "--root",
      root,
      "--before",
      "0000000000000000000000000000000000000000",
      "--after",
      after,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "full");
    assert.equal(output.run, true);
  });
});

test("changed-plugins CLI: --github-output appends run/mode/only in $GITHUB_OUTPUT format", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-b", "main");
    await scaffoldPlugin(root, "obs");
    await writeCodeowners(root, "/plugins/obs/ @inferst\n");
    commit(root, "initial");
    const before = head(root);

    await writeFile(path.join(root, "plugins", "obs", "manifest.json"), (
      await readFile(path.join(root, "plugins", "obs", "manifest.json"), "utf8")
    ).replace("1.2.3", "1.2.4"));
    commit(root, "bump obs");
    const after = head(root);

    const outputPath = path.join(root, "github-output.txt");
    await writeFile(outputPath, "");

    const result = await runChangedPlugins([
      "--root",
      root,
      "--before",
      before,
      "--after",
      after,
      "--github-output",
      outputPath,
    ]);
    assert.equal(result.code, 0, result.stderr);

    const contents = await readFile(outputPath, "utf8");
    assert.match(contents, /^run=true$/m);
    assert.match(contents, /^mode=only$/m);
    assert.match(contents, /^only=obs$/m);
  });
});

test("changed-plugins requires --after and fails with structured invalid arguments", async () => {
  await withTempDir(async (root) => {
    const result = await runChangedPlugins(["--root", root]);
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.errors[0].code, "INVALID_ARGUMENTS");
  });
});
