import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bumpSemVer } from "@fluxta/cli/semver";
import { pathExists } from "./shared.mjs";

/**
 * A Trusted-Repo Migration's mechanical half: bumping one shared dependency
 * across every Plugin Source Package in the checkout.
 *
 * Every package here is its own pnpm workspace, and the version of a shared
 * dependency lives in exactly one place — the `catalog:` block of
 * `plugins/<name>/pnpm-workspace.yaml` — while each sub-package only ever
 * writes `"catalog:"`. So a dependency bump is a one-line edit to that
 * catalog followed by a lockfile refresh; CI builds each package with
 * `pnpm install --frozen-lockfile`, so a catalog edit without the matching
 * lockfile would fail the build rather than produce a new version.
 *
 * `@fluxta/cli/migration` owns everything after that point — the version
 * bump, the origin marker, one commit per package — so nothing in this module
 * touches git or manifest.json.
 */

export const WORKSPACE_FILE = "pnpm-workspace.yaml";
const PACKAGE_JSON_FILE = "package.json";
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
// Directories that only ever hold installed or generated copies of a
// package's own sources, so a dependency reference found inside one says
// nothing about what the package itself declares.
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", ".turbo", ".git"]);
const CATALOG_KEY = "catalog:";

/** `@fluxta/sdk` -> `fluxta-sdk`, the shape a branch name can carry. */
export function dependencySlug(dependency) {
  return dependency.replace(/^@/, "").replace(/[^a-zA-Z0-9]+/g, "-");
}

/** Default branch for one migration run: `migrate/fluxta-sdk-0.2.0`. */
export function migrationBranchName(dependency, version) {
  return `migrate/${dependencySlug(dependency)}-${version}`;
}

/**
 * Splits a catalog value into its SemVer range operator and the version it
 * applies to, so a bump keeps whatever range policy the package already
 * chose: `^0.1.2` becomes `^0.2.0`, a pinned `0.1.2` stays pinned.
 */
export function splitRange(value) {
  const match = /^([^\d]*)(.*)$/.exec(value.trim());
  return { operator: match[1] ?? "", version: match[2] ?? "" };
}

function unquote(value) {
  const match = /^(["'])(.*)\1$/.exec(value);
  return match ? { quote: match[1], text: match[2] } : { quote: "", text: value };
}

function requote(quote, text) {
  return `${quote}${text}${quote}`;
}

/**
 * Locates the `catalog:` block's entry for one dependency.
 *
 * Deliberately line-based rather than a YAML round-trip: the edit is a single
 * value on a single line, and rewriting the file through a parser would mean
 * either adding a YAML dependency to this repository or losing the comments
 * and key order that make these catalogs readable. Anything the line scan
 * cannot account for — two entries for the same dependency — is reported as
 * `ambiguous` rather than guessed at.
 */
export function findCatalogEntry(contents, dependency) {
  const lines = contents.split("\n");
  const matches = [];
  let inCatalog = false;

  for (const [index, line] of lines.entries()) {
    if (line.trimEnd() === CATALOG_KEY) {
      inCatalog = true;
      continue;
    }
    if (!inCatalog) continue;
    // A block ends at the next line that starts its own top-level key;
    // blank lines inside it are ordinary formatting.
    if (line.trim() !== "" && !/^\s/.test(line)) {
      inCatalog = false;
      continue;
    }

    const entry = /^(\s+)(.+?)\s*:\s*(\S.*?)(\s+#.*)?$/.exec(line);
    if (!entry) continue;

    const [, indent, rawKey, rawValue, comment] = entry;
    const key = unquote(rawKey);
    if (key.text !== dependency) continue;

    matches.push({ index, indent, rawKey, value: unquote(rawValue), comment: comment ?? "" });
  }

  if (matches.length === 0) return { status: "absent" };
  if (matches.length > 1) return { status: "ambiguous", count: matches.length };
  return { status: "found", entry: matches[0] };
}

/**
 * Rewrites one catalog entry to `version`, preserving the line's indentation,
 * quoting, range operator, and trailing comment. Reports `unchanged` when the
 * entry already names that version, so an already-migrated package is skipped
 * instead of being handed a pointless new version.
 */
export function replaceCatalogEntry(contents, dependency, version) {
  const found = findCatalogEntry(contents, dependency);
  if (found.status !== "found") return found;

  const { entry } = found;
  const { operator, version: fromVersion } = splitRange(entry.value.text);
  const toValue = `${operator}${version}`;
  if (entry.value.text === toValue) {
    return { status: "unchanged", fromVersion: entry.value.text };
  }

  const lines = contents.split("\n");
  lines[entry.index] =
    `${entry.indent}${entry.rawKey}: ${requote(entry.value.quote, toValue)}${entry.comment}`;

  return {
    status: "replaced",
    contents: lines.join("\n"),
    fromVersion: `${operator}${fromVersion}`,
    toVersion: toValue,
  };
}

/**
 * Every package.json inside one Plugin Source Package that names the
 * dependency, and how: through the catalog, or with a range of its own.
 *
 * A package that declares a shared dependency directly is the case this
 * migration cannot mechanically update, and no
 * package may be silently skipped — so knowing the difference between "does
 * not use this dependency" and "uses it in a shape we do not handle" is what
 * keeps a package from quietly falling behind the rest of the repository.
 */
export async function collectDependencyReferences(packageDir, dependency) {
  const references = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        await walk(target);
        continue;
      }
      if (entry.name !== PACKAGE_JSON_FILE) continue;

      let metadata;
      try {
        metadata = JSON.parse(await readFile(target, "utf8"));
      } catch {
        continue;
      }
      for (const field of DEPENDENCY_FIELDS) {
        const declared = metadata?.[field]?.[dependency];
        if (typeof declared !== "string") continue;
        references.push({
          file: path.relative(packageDir, target),
          field,
          value: declared,
          kind: declared.startsWith("catalog:") ? "catalog" : "direct",
        });
      }
    }
  }

  await walk(packageDir);
  return references.sort((left, right) => left.file.localeCompare(right.file));
}

/**
 * Decides what one migration run would do to one package, reading only.
 * `--dry-run` reports exactly this; the real run writes the `contents` it
 * hands back and then refreshes the lockfile.
 */
export async function inspectPackage(packageDir, { dependency, version, only }) {
  const name = path.basename(packageDir);

  if (only && !only.includes(name)) {
    return { name, action: "skip", reason: "not selected by --only" };
  }

  const workspacePath = path.join(packageDir, WORKSPACE_FILE);
  if (!(await pathExists(workspacePath))) {
    return describeWithoutCatalog(packageDir, name, dependency, `has no ${WORKSPACE_FILE}`);
  }

  const contents = await readFile(workspacePath, "utf8");
  const replaced = replaceCatalogEntry(contents, dependency, version);

  if (replaced.status === "ambiguous") {
    return {
      name,
      action: "fail",
      reason:
        `${WORKSPACE_FILE} declares '${dependency}' ${replaced.count} times in its catalog; ` +
        "resolve the duplicate before migrating",
    };
  }
  if (replaced.status === "unchanged") {
    return {
      name,
      action: "skip",
      reason: `catalog already names '${dependency}' ${replaced.fromVersion}`,
    };
  }
  if (replaced.status === "absent") {
    return describeWithoutCatalog(
      packageDir,
      name,
      dependency,
      `${WORKSPACE_FILE} has no catalog entry for it`,
    );
  }

  return {
    name,
    action: "migrate",
    workspacePath,
    contents: replaced.contents,
    fromVersion: replaced.fromVersion,
    toVersion: replaced.toVersion,
  };
}

/**
 * A package with no catalog entry is only skippable when it does not use the
 * dependency at all; one that reaches it another way is a failure, not a
 * skip.
 */
async function describeWithoutCatalog(packageDir, name, dependency, detail) {
  const references = await collectDependencyReferences(packageDir, dependency);
  if (references.length === 0) {
    return { name, action: "skip", reason: `does not depend on '${dependency}'` };
  }

  const files = references.map((reference) => `${reference.file} (${reference.field})`).join(", ");
  return {
    name,
    action: "fail",
    reason: `depends on '${dependency}' but ${detail}; declared in ${files}`,
  };
}

/**
 * Plans a whole run without writing anything, in the same package order
 * `runTrustedRepoMigration` walks, so `--dry-run` and the real run cannot
 * disagree about what would happen. `predictedVersion` mirrors the bump the
 * migration would apply, which only exists for packages it would migrate.
 */
export async function planMigration(repoDir, { dependency, version, only, bump }) {
  const pluginsDir = path.join(repoDir, "plugins");
  if (!(await pathExists(pluginsDir))) return [];

  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const plans = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(pluginsDir, entry.name);
    if (!(await pathExists(path.join(packageDir, "manifest.json")))) continue;

    const inspected = await inspectPackage(packageDir, { dependency, version, only });
    plans.push({
      ...inspected,
      predictedVersion:
        inspected.action === "migrate" ? await predictVersion(packageDir, bump) : undefined,
    });
  }

  return plans;
}

async function predictVersion(packageDir, bump) {
  try {
    const manifest = JSON.parse(await readFile(path.join(packageDir, "manifest.json"), "utf8"));
    return typeof manifest.version === "string" ? bumpSemVer(manifest.version, bump) : null;
  } catch {
    return null;
  }
}

/**
 * Builds the `transform` `runTrustedRepoMigration` drives, plus the side
 * channel it needs to report more than `changed: true | false`.
 *
 * The migration API only asks a transform whether a package changed, so a
 * package it should not have skipped silently — one that uses the dependency
 * in a shape this migration cannot update — has nowhere to go in its return
 * value. `outcomes` is that place: the caller merges it with the migration's
 * own per-package results to build the report.
 *
 * `installLockfile` and `restorePackage` are injected so the pure decision
 * above stays testable without pnpm, a network, or a real lockfile.
 */
export function createCatalogMigration({
  dependency,
  version,
  only,
  installLockfile,
  restorePackage,
}) {
  const outcomes = new Map();

  async function transform(packageDir) {
    const inspected = await inspectPackage(packageDir, { dependency, version, only });
    const { name } = inspected;

    if (inspected.action !== "migrate") {
      outcomes.set(name, { status: inspected.action === "fail" ? "failed" : "skipped", reason: inspected.reason });
      return { changed: false };
    }

    await writeFile(inspected.workspacePath, inspected.contents);

    const install = await installLockfile(packageDir);
    if (!install.ok) {
      // The catalog edit and whatever the failed install left behind are
      // rolled back, so the next package's commit cannot pick up a broken
      // half-migration through its own pathspec.
      await restorePackage(name);
      outcomes.set(name, {
        status: "failed",
        reason: `refreshing ${name}'s lockfile failed: ${install.reason}`,
      });
      return { changed: false };
    }

    outcomes.set(name, {
      status: "migrated",
      fromVersion: inspected.fromVersion,
      toVersion: inspected.toVersion,
    });
    return { changed: true };
  }

  return { transform, outcomes };
}

/**
 * Merges what `runTrustedRepoMigration` reports (the version bump and commit
 * it made) with what the transform recorded (why a package was left alone),
 * into one row per package.
 */
export function mergeOutcomes(migrationResults, transformOutcomes) {
  return migrationResults
    .map((result) => {
      const recorded = transformOutcomes.get(result.name) ?? {};
      // A package the migration itself failed (an unparseable manifest, a
      // non-SemVer version, a failed commit) outranks the transform's view,
      // which only ever saw a successful edit.
      const status = result.status === "failed" ? "failed" : recorded.status ?? result.status;
      return {
        name: result.name,
        status,
        reason: result.status === "failed" ? result.reason : recorded.reason,
        newVersion: result.newVersion,
        fromVersion: recorded.fromVersion,
        toVersion: recorded.toVersion,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
