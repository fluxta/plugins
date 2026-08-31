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

test("ownership matches when CODEOWNERS names exactly the declared Package Maintainers", async () => {
  await withTempDir(async (root) => {
    await writeManifest(
      root,
      "example.plugin",
      validManifest({ maintainers: ["inferst", "fluxta/maintainers"] }),
    );
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(
      root,
      [
        "# Repository-level default owners",
        "* @inferst",
        "",
        "/plugins/example.plugin/ @inferst @fluxta/maintainers",
      ].join("\n"),
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(output.packages[0].ownership, {
      status: "matched",
      maintainers: ["inferst", "fluxta/maintainers"],
      codeowners: {
        path: ".github/CODEOWNERS",
        pattern: "/plugins/example.plugin/",
        owners: ["@inferst", "@fluxta/maintainers"],
      },
    });
  });
});

test("ownership matches case-insensitively and with @ prefixes and slash forms", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest({ maintainers: ["@Inferst"] }));
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "plugins/example.plugin @INFERST\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.validation.errors, []);
    assert.deepEqual(output.packages[0].ownership.status, "matched");
  });
});

test("ownership is missing when the repository has no CODEOWNERS file", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MISSING_PACKAGE_OWNERSHIP",
        package: "example.plugin",
        field: "maintainers",
      },
    ]);
    assert.equal(
      output.validation.errors[0].message,
      "Plugin Source Package 'example.plugin' declares Package Maintainers " +
        "(@inferst) but no CODEOWNERS entry covers plugins/example.plugin/. " +
        "Add an explicit entry such as '/plugins/example.plugin/ @inferst'.",
    );
    assert.deepEqual(output.packages[0].ownership, {
      status: "missing",
      maintainers: ["inferst"],
      codeowners: null,
    });
  });
});

test("ownership is missing when only a repository-default or wildcard entry exists", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "* @inferst\nplugins/* @inferst\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MISSING_PACKAGE_OWNERSHIP",
        package: "example.plugin",
        field: "maintainers",
      },
    ]);
  });
});

test("ownership mismatches when CODEOWNERS routes the package to other identities", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @someone-else\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "PACKAGE_OWNERSHIP_MISMATCH",
        package: "example.plugin",
        field: "maintainers",
      },
    ]);
    assert.match(
      output.validation.errors[0].message,
      /declares Package Maintainers \(@inferst\)/,
    );
    assert.match(
      output.validation.errors[0].message,
      /routes ownership to \(@someone-else\)/,
    );
    assert.deepEqual(output.packages[0].ownership, {
      status: "mismatch",
      maintainers: ["inferst"],
      codeowners: {
        path: ".github/CODEOWNERS",
        pattern: "/plugins/example.plugin/",
        owners: ["@someone-else"],
      },
    });
  });
});

test("ownership mismatches when CODEOWNERS names extra or partial maintainers", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest({ maintainers: ["a-user", "b-user"] }));
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @a-user @c-user\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "PACKAGE_OWNERSHIP_MISMATCH",
        package: "example.plugin",
        field: "maintainers",
      },
    ]);
  });
});

test("the last matching CODEOWNERS entry wins like GitHub semantics", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(
      root,
      "/plugins/example.plugin/ @stale\n/plugins/example.plugin/ @inferst\n",
    );

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.packages[0].ownership.status, "matched");
  });
});

test("author-only metadata never grants ownership authorization", async () => {
  await withTempDir(async (root) => {
    await writeManifest(
      root,
      "author-only",
      validManifest({
        name: "author-only",
        author: "inferst",
        maintainers: [],
      }),
    );
    await writeBuildContract(root, "author-only", {
      buildScript: simpleBuildScript("author-only"),
    });
    await writeCodeowners(root, "/plugins/author-only/ @inferst\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "MISSING_PACKAGE_METADATA",
        package: "author-only",
        field: "manifest.json.maintainers",
      },
    ]);
    assert.equal(output.packages[0].ownership, null);
  });
});

test("invalid maintainer identities are rejected before ownership routing", async () => {
  await withTempDir(async (root) => {
    await writeManifest(
      root,
      "example.plugin",
      validManifest({ maintainers: ["John Doe", "@", "user name"] }),
    );
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @someone-else\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      {
        code: "INVALID_MAINTAINER_IDENTITY",
        package: "example.plugin",
        field: "maintainers",
      },
      {
        code: "INVALID_MAINTAINER_IDENTITY",
        package: "example.plugin",
        field: "maintainers",
      },
      {
        code: "INVALID_MAINTAINER_IDENTITY",
        package: "example.plugin",
        field: "maintainers",
      },
    ]);
    assert.equal(output.packages[0].ownership, null);
  });
});

test("a malformed CODEOWNERS file fails validation", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(root, "example.plugin", {
      buildScript: simpleBuildScript("example.plugin"),
    });
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\nbroken line without owners\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.validation.errors[0].code, "INVALID_CODEOWNERS_ENTRY");
    assert.equal(output.validation.errors[0].file, ".github/CODEOWNERS");
    assert.equal(output.validation.errors[0].line, 2);
  });
});

test("the first CODEOWNERS file found in GitHub priority order is used", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example.plugin", validManifest());
    await writeBuildContract(
      root,
      "example.plugin",
      { buildScript: simpleBuildScript("example.plugin") },
    );
    await writeCodeowners(root, "/plugins/example.plugin/ @inferst\n", "CODEOWNERS");
    await writeCodeowners(root, "/plugins/example.plugin/ @stale\n");

    const result = await runCli(["validate", "--root", root, "--json"]);

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.packages[0].ownership.codeowners, {
      path: "CODEOWNERS",
      pattern: "/plugins/example.plugin/",
      owners: ["@inferst"],
    });
  });
});
