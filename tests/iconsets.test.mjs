import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { buildIconsetArtifactZip } from "@fluxta/cli/iconset/artifact";

import { decideChangeScope } from "../scripts/changed-plugins.mjs";
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

const SOURCE_COMMIT = "c".repeat(40);
const PUBLISHED_AT = "2026-09-24T12:00:00.000Z";
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /></svg>\n';

function iconsetManifest(overrides = {}) {
  return {
    type: "iconset",
    name: "streamer-icons",
    version: "1.0.0",
    title: "Streamer Icons",
    description: "Icons for streamers.",
    author: "Example Author",
    license: "ISC",
    minAppVersion: "0.7.0",
    maintainers: ["inferst"],
    color: "stroke",
    preview: ["icons/mic.svg", "icons/camera.svg"],
    ...overrides,
  };
}

async function writeIconset(
  root,
  id = "streamer-icons",
  { dir = "iconsets", manifest = iconsetManifest({ name: id }), license = true } = {},
) {
  const packageDir = path.join(root, dir, id);
  await mkdir(path.join(packageDir, "icons"), { recursive: true });
  await writeFile(
    path.join(packageDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  if (license) {
    await writeFile(path.join(packageDir, "LICENSE"), "ISC License\n");
  }
  for (const icon of ["mic.svg", "camera.svg", "star.svg"]) {
    await writeFile(path.join(packageDir, "icons", icon), SVG);
  }
  return packageDir;
}

async function validate(root) {
  const result = await runCli(["validate", "--root", root, "--json"]);
  return JSON.parse(result.stdout);
}

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

test("validate accepts an iconset, packages it without a build, and plans its preview", async () => {
  await withTempDir(async (root) => {
    const packageDir = await writeIconset(root);
    await writeCodeowners(root, "/iconsets/streamer-icons/ @inferst\n");

    const output = await validate(root);

    assert.deepEqual(output.validation.errors, []);
    assert.equal(output.ok, true);

    const [pkg] = output.packages;
    assert.equal(pkg.id, "streamer-icons");
    assert.equal(pkg.type, "iconset");
    assert.equal(pkg.path, path.join("iconsets", "streamer-icons"));
    assert.equal(pkg.status, "valid");
    assert.equal(pkg.manifest.color, "stroke");
    assert.equal("apiVersion" in pkg.manifest, false);
    assert.equal(pkg.build.iconCount, 3);
    assert.equal(pkg.ownership.status, "matched");

    // Byte-identical to what `fluxta package` produces for the same folder.
    const archive = await buildIconsetArtifactZip(packageDir, "streamer-icons");
    assert.equal(
      pkg.build.artifact.checksum,
      createHash("sha256").update(archive).digest("hex"),
    );

    assert.deepEqual(output.publicationPlan.artifactWrites, [
      {
        package: "streamer-icons",
        type: "iconset",
        version: "1.0.0",
        pluginFolder: "streamer-icons",
        artifact: "artifacts/streamer-icons-1.0.0.zip",
        objectKey: "artifacts/streamer-icons-1.0.0.zip",
        size: archive.length,
        checksum: pkg.build.artifact.checksum,
      },
    ]);

    const svgChecksum = createHash("sha256").update(SVG).digest("hex");
    assert.deepEqual(output.publicationPlan.previewWrites, [
      {
        package: "streamer-icons",
        version: "1.0.0",
        icon: "icons/mic.svg",
        objectKey: "artifacts/previews/streamer-icons/1.0.0/mic.svg",
        size: Buffer.byteLength(SVG),
        checksum: svgChecksum,
        contentType: "image/svg+xml",
      },
      {
        package: "streamer-icons",
        version: "1.0.0",
        icon: "icons/camera.svg",
        objectKey: "artifacts/previews/streamer-icons/1.0.0/camera.svg",
        size: Buffer.byteLength(SVG),
        checksum: svgChecksum,
        contentType: "image/svg+xml",
      },
    ]);

    const [entry] = output.publicationIndex.packages;
    assert.equal(entry.name, "streamer-icons");
    assert.equal(entry.type, "iconset");
    const [version] = entry.versions;
    assert.deepEqual(Object.keys(version), [
      "version",
      "manifest",
      "artifact",
      "details",
      "status",
      "reason",
    ]);
    assert.deepEqual(version.details, {
      preview: [
        "artifacts/previews/streamer-icons/1.0.0/mic.svg",
        "artifacts/previews/streamer-icons/1.0.0/camera.svg",
      ],
      iconCount: 3,
    });
    assert.equal(version.manifest.color, "stroke");
    assert.equal(version.manifest.license, "ISC");
    assert.equal("apiVersion" in version.manifest, false);
  });
});

test("the publication index marks plugins with their type and leaves their entries unchanged", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "example-plugin", validManifest());
    await writeBuildContract(root, "example-plugin", {
      buildScript: simpleBuildScript("example-plugin"),
    });
    await writeIconset(root);
    await writeCodeowners(
      root,
      "/plugins/example-plugin/ @inferst\n/iconsets/streamer-icons/ @inferst\n",
    );

    const output = await validate(root);

    assert.deepEqual(output.validation.errors, []);
    const plugin = output.publicationIndex.packages.find(
      (entry) => entry.name === "example-plugin",
    );
    assert.equal(plugin.type, "plugin");
    assert.deepEqual(Object.keys(plugin.versions[0]), [
      "version",
      "manifest",
      "artifact",
      "status",
      "reason",
    ]);
    assert.equal(plugin.versions[0].manifest.apiVersion, 1);
  });
});

test("iconset rules come from the CLI seam", async () => {
  await withTempDir(async (root) => {
    await writeIconset(root, "streamer-icons", { license: false });
    await writeCodeowners(root, "/iconsets/streamer-icons/ @inferst\n");

    const output = await validate(root);

    assert.equal(output.ok, false);
    assert.deepEqual(errorCodes(output), [
      { code: "MISSING_LICENSE_FILE", package: "streamer-icons", field: "LICENSE" },
    ]);
    assert.equal(output.packages[0].build, null);
  });
});

test("a package's directory must match the type its manifest declares", async () => {
  await withTempDir(async (root) => {
    await writeIconset(root, "misplaced-icons", { dir: "plugins" });
    await writeManifest(root, "example-plugin", validManifest());
    const pluginUnderIconsets = path.join(root, "iconsets", "stray-plugin");
    await mkdir(pluginUnderIconsets, { recursive: true });
    await writeFile(
      path.join(pluginUnderIconsets, "manifest.json"),
      JSON.stringify(validManifest({ name: "stray-plugin" })),
    );

    const output = await validate(root);

    const mismatches = output.validation.errors
      .filter((error) => error.code === "PACKAGE_TYPE_MISMATCH")
      .map((error) => error.package)
      .sort();
    assert.deepEqual(mismatches, ["misplaced-icons", "stray-plugin"]);
  });
});

test("plugins and iconsets share one set of names", async () => {
  await withTempDir(async (root) => {
    await writeManifest(root, "shared-name", validManifest({ name: "shared-name" }));
    await writeIconset(root, "shared-name");

    const output = await validate(root);

    const collisions = output.validation.errors.filter(
      (error) => error.code === "PACKAGE_ID_COLLISION",
    );
    assert.deepEqual(
      collisions.map((error) => error.path).sort(),
      [path.join("iconsets", "shared-name"), path.join("plugins", "shared-name")],
    );
  });
});

test("an iconset's CODEOWNERS entry must cover iconsets/<id>/, not plugins/<id>/", async () => {
  await withTempDir(async (root) => {
    await writeIconset(root);
    await writeCodeowners(root, "/plugins/streamer-icons/ @inferst\n");

    const output = await validate(root);

    const [error] = output.validation.errors;
    assert.equal(error.code, "MISSING_PACKAGE_OWNERSHIP");
    assert.match(error.message, /^Iconset 'streamer-icons'/);
    assert.match(error.message, /'\/iconsets\/streamer-icons\/ @inferst'/);
  });
});

test("publish uploads the iconset artifact and each preview icon, then indexes it", async () => {
  await withTempDir(async (root) => {
    await writeIconset(root);
    await writeCodeowners(root, "/iconsets/streamer-icons/ @inferst\n");

    const result = await runCli(publishArgs(root));
    const output = JSON.parse(result.stdout);

    assert.equal(output.ok, true, JSON.stringify(output.validation.errors));
    assert.deepEqual(
      output.publication.previewWrites.map((write) => write.objectKey),
      [
        "artifacts/previews/streamer-icons/1.0.0/mic.svg",
        "artifacts/previews/streamer-icons/1.0.0/camera.svg",
      ],
    );
    assert.equal(output.publication.artifactWrites.length, 1);
    assert.equal(
      await readFile(
        path.join(root, "store", "artifacts/previews/streamer-icons/1.0.0/mic.svg"),
        "utf8",
      ),
      SVG,
    );
    assert.ok(
      output.publication.notes.includes(
        `Published Iconset Preview icon 'artifacts/previews/streamer-icons/1.0.0/mic.svg' (${createHash("sha256").update(SVG).digest("hex")}).`,
      ),
    );

    const index = JSON.parse(
      await readFile(path.join(root, "store", "publication-index.json"), "utf8"),
    );
    assert.equal(index.packages[0].type, "iconset");

    // Republishing the same version finds every object already in place.
    const rerun = JSON.parse((await runCli(publishArgs(root))).stdout);
    assert.equal(rerun.ok, true);
    assert.deepEqual(rerun.publication.previewWrites, []);
    assert.deepEqual(rerun.publication.artifactWrites, []);
    // The index read back from the store — details included — normalizes to
    // the same bytes, so it is not rewritten.
    assert.equal(rerun.publication.indexWrite.skipped, true);
  });
});

test("publish refuses to overwrite a published preview icon with different content", async () => {
  await withTempDir(async (root) => {
    await writeIconset(root);
    await writeCodeowners(root, "/iconsets/streamer-icons/ @inferst\n");
    const existing = path.join(root, "store", "artifacts/previews/streamer-icons/1.0.0/mic.svg");
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, "<svg>something else</svg>");

    const output = JSON.parse((await runCli(publishArgs(root))).stdout);

    assert.equal(output.ok, false);
    assert.deepEqual(
      output.publication.refusals.map((refusal) => refusal.objectKey),
      ["artifacts/previews/streamer-icons/1.0.0/mic.svg"],
    );
    assert.deepEqual(output.publication.artifactWrites, []);
    assert.equal(output.publication.indexWrite, null);
  });
});

test("decideChangeScope: a changed iconset is built on its own", () => {
  assert.deepEqual(
    decideChangeScope(["iconsets/streamer-icons/icons/mic.svg"], ["obs", "streamer-icons"]),
    { mode: "only", only: ["streamer-icons"], reason: "package(s) changed: streamer-icons" },
  );
});
