import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
} from "./helpers.mjs";

// A plugin's own `icon` is published beside its artifact for its Marketplace
// card, per version, under the same immutability rules (ADR-0047).

const SOURCE_COMMIT = "c".repeat(40);
const PUBLISHED_AT = "2026-08-06T12:00:00.000Z";
const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" stroke="white"/></svg>\n`;
const ICON_KEY = "artifacts/icons/example-plugin/1.2.3/app.svg";

function publishArgs(root) {
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
  ];
}

async function writePlugin(root, manifestOverrides = {}) {
  const packageDir = path.join(root, "plugins", "example-plugin");
  await writeManifest(root, "example-plugin", validManifest(manifestOverrides));
  await writeBuildContract(root, "example-plugin", {
    buildScript: simpleBuildScript("example-plugin", ["icons"]),
  });
  await writeCodeowners(root, "plugins/example-plugin @inferst\n");
  await mkdir(path.join(packageDir, "icons"), { recursive: true });
  await writeFile(path.join(packageDir, "icons", "app.svg"), GLYPH);
}

async function storedIndex(root) {
  return JSON.parse(await readFile(path.join(root, "store", "publication-index.json"), "utf8"));
}

test("validate plans a plugin's icon beside its artifact and indexes its object key", async () => {
  await withTempDir(async (root) => {
    await writePlugin(root, { icon: "icons/app.svg" });

    const output = JSON.parse(
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

    assert.equal(output.ok, true, JSON.stringify(output.validation.errors));
    assert.deepEqual(output.publicationPlan.iconWrites, [
      {
        package: "example-plugin",
        version: "1.2.3",
        icon: "icons/app.svg",
        objectKey: ICON_KEY,
        size: Buffer.byteLength(GLYPH),
        checksum: createHash("sha256").update(GLYPH).digest("hex"),
        contentType: "image/svg+xml",
      },
    ]);
    assert.equal(await readFile(path.join(root, ICON_KEY), "utf8"), GLYPH);
    const [entry] = output.publicationIndex.packages[0].versions;
    assert.deepEqual(entry.details, { icon: ICON_KEY });
  });
});

test("a plugin without an icon plans no icon and indexes no details", async () => {
  await withTempDir(async (root) => {
    await writePlugin(root);

    const output = JSON.parse((await runCli(["validate", "--root", root, "--json"])).stdout);

    assert.equal(output.ok, true, JSON.stringify(output.validation.errors));
    assert.deepEqual(output.publicationPlan.iconWrites, []);
    const [entry] = output.publicationIndex.packages[0].versions;
    assert.equal("details" in entry, false, "the entry is byte-identical to before plugin icons");
  });
});

test("publish uploads a plugin's icon, then finds it in place on a rerun", async () => {
  await withTempDir(async (root) => {
    await writePlugin(root, { icon: "icons/app.svg" });

    const output = JSON.parse((await runCli(publishArgs(root))).stdout);

    assert.equal(output.ok, true, JSON.stringify(output.validation.errors));
    assert.deepEqual(
      output.publication.iconWrites.map((write) => write.objectKey),
      [ICON_KEY],
    );
    assert.equal(await readFile(path.join(root, "store", ICON_KEY), "utf8"), GLYPH);
    assert.ok(
      output.publication.notes.includes(
        `Published plugin icon '${ICON_KEY}' (${createHash("sha256").update(GLYPH).digest("hex")}).`,
      ),
    );
    assert.deepEqual((await storedIndex(root)).packages[0].versions[0].details, {
      icon: ICON_KEY,
    });

    const rerun = JSON.parse((await runCli(publishArgs(root))).stdout);
    assert.equal(rerun.ok, true);
    assert.deepEqual(rerun.publication.iconWrites, []);
    // The index read back from the store — details included — normalizes to
    // the same bytes, so it is not rewritten.
    assert.equal(rerun.publication.indexWrite.skipped, true);
  });
});

test("publish refuses to overwrite a published plugin icon with different content", async () => {
  await withTempDir(async (root) => {
    await writePlugin(root, { icon: "icons/app.svg" });
    const existing = path.join(root, "store", ICON_KEY);
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, "<svg>an older icon</svg>\n");

    const result = await runCli(publishArgs(root));
    const output = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.deepEqual(
      output.publication.refusals.map((refusal) => refusal.objectKey),
      [ICON_KEY],
    );
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.equal(await readFile(existing, "utf8"), "<svg>an older icon</svg>\n");
  });
});

test("a published version's icon survives in the index when a new version is added", async () => {
  await withTempDir(async (root) => {
    await writePlugin(root, { icon: "icons/app.svg" });
    const olderIcon = "artifacts/icons/example-plugin/1.0.0/app.svg";
    await writePreviousIndex(root, {
      schemaVersion: 1,
      packages: [
        {
          name: "example-plugin",
          versions: [
            {
              version: "1.0.0",
              manifest: { name: "example-plugin", version: "1.0.0" },
              artifact: {
                objectKey: "artifacts/example-plugin-1.0.0.zip",
                checksum: "a".repeat(64),
                size: 1,
                sourceCommit: "p".repeat(40),
                publishedAt: "2026-01-01T00:00:00.000Z",
              },
              details: { icon: olderIcon },
              status: "published",
              reason: null,
            },
          ],
        },
      ],
    });

    const output = JSON.parse(
      (
        await runCli([
          "validate",
          "--root",
          root,
          "--json",
          "--previous-index",
          path.join(root, "previous-index.json"),
        ])
      ).stdout,
    );

    assert.equal(output.ok, true, JSON.stringify(output.validation.errors));
    assert.deepEqual(
      output.publicationIndex.packages[0].versions.map((entry) => [
        entry.version,
        entry.details,
      ]),
      [
        ["1.0.0", { icon: olderIcon }],
        ["1.2.3", { icon: ICON_KEY }],
      ],
    );
  });
});
