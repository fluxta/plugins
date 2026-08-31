import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  formatGitHubIdentities,
  formatGitHubIdentity,
  isGitHubIdentity,
  normalizeGitHubIdentity,
} from "./github-identity.mjs";
import { isNonEmptyString, packageError, pathExists } from "./shared.mjs";

const CODEOWNERS_CANDIDATE_PATHS = ["CODEOWNERS", "docs/CODEOWNERS", ".github/CODEOWNERS"];

export async function loadCodeowners(rootDir) {
  for (const relativePath of CODEOWNERS_CANDIDATE_PATHS) {
    const fullPath = path.join(rootDir, relativePath);
    if (!(await pathExists(fullPath))) {
      continue;
    }

    let contents;
    try {
      contents = await readFile(fullPath, "utf8");
    } catch (error) {
      return {
        path: relativePath,
        entries: [],
        errors: [{ line: null, message: `Could not read ${relativePath}: ${error.message}` }],
      };
    }

    return { path: relativePath, ...parseCodeowners(contents) };
  }

  return null;
}

function parseCodeowners(contents) {
  const entries = [];
  const errors = [];

  contents.split(/\r?\n/).forEach((rawLine, index) => {
    const line = stripCodeownersComment(rawLine).trim();
    if (line.length === 0) {
      return;
    }

    const tokens = line.split(/\s+/);
    const pattern = tokens[0];
    const owners = tokens.slice(1);

    if (owners.length === 0 || owners.some((owner) => !owner.startsWith("@"))) {
      errors.push({
        line: index + 1,
        message: `CODEOWNERS line ${index + 1} has no valid owner entries: ${line}`,
      });
      return;
    }

    const normalizedOwners = owners.map((owner) => normalizeGitHubIdentity(owner));
    if (normalizedOwners.some((owner) => !isGitHubIdentity(owner))) {
      errors.push({
        line: index + 1,
        message: `CODEOWNERS line ${index + 1} declares an invalid GitHub identity: ${line}`,
      });
      return;
    }

    entries.push({ pattern, owners: normalizedOwners });
  });

  return { entries, errors };
}

function stripCodeownersComment(line) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

/**
 * Checks that a package's declared Package Maintainers are exactly the owners
 * its CODEOWNERS entry routes. Returns the ownership summary plus any
 * repository-policy errors, so callers keep one ordered error stream.
 */
export function validatePackageOwnership(sourcePackage, manifest, codeowners) {
  const errors = [];
  const declaredMaintainers = manifest.maintainers
    .filter(isNonEmptyString)
    .map(normalizeGitHubIdentity);

  const invalidIdentities = declaredMaintainers.filter(
    (identity) => !isGitHubIdentity(identity),
  );
  if (invalidIdentities.length > 0) {
    invalidIdentities.forEach((identity) => {
      errors.push(
        packageError(
          sourcePackage,
          "INVALID_MAINTAINER_IDENTITY",
          "maintainers",
          `Package Maintainer '${identity}' is not a valid GitHub identity string. ` +
            "Use a GitHub username or org/team identity such as 'inferst' or 'fluxta/maintainers'.",
        ),
      );
    });
    return { ownership: null, errors };
  }

  const codeownersPath = codeowners?.path ?? null;
  const matchingEntry =
    codeowners?.entries
      .filter((entry) => codeownersPatternsForPackage(sourcePackage.id).has(entry.pattern))
      .at(-1) ?? null;

  if (!matchingEntry) {
    errors.push(
      packageError(
        sourcePackage,
        "MISSING_PACKAGE_OWNERSHIP",
        "maintainers",
        `Plugin Source Package '${sourcePackage.id}' declares Package Maintainers ` +
          `(${formatGitHubIdentities(declaredMaintainers)}) but no CODEOWNERS entry covers ` +
          `${sourcePackage.path}/. Add an explicit entry such as ` +
          `'/${sourcePackage.path}/ ${formatGitHubIdentities(declaredMaintainers)}'.`,
      ),
    );
    return {
      ownership: {
        status: "missing",
        maintainers: [...manifest.maintainers],
        codeowners: null,
      },
      errors,
    };
  }

  const expected = new Set(declaredMaintainers);
  const actual = new Set(matchingEntry.owners);
  const isMatched =
    expected.size === actual.size && [...expected].every((identity) => actual.has(identity));

  if (!isMatched) {
    errors.push(
      packageError(
        sourcePackage,
        "PACKAGE_OWNERSHIP_MISMATCH",
        "maintainers",
        `Plugin Source Package '${sourcePackage.id}' declares Package Maintainers ` +
          `(${formatGitHubIdentities(declaredMaintainers)}) but the CODEOWNERS entry ` +
          `'${matchingEntry.pattern}' in ${codeownersPath} routes ownership to ` +
          `(${formatGitHubIdentities(matchingEntry.owners)}). Ownership entries must name ` +
          "exactly the declared Package Maintainers.",
      ),
    );
    return {
      ownership: {
        status: "mismatch",
        maintainers: [...manifest.maintainers],
        codeowners: {
          path: codeownersPath,
          pattern: matchingEntry.pattern,
          owners: matchingEntry.owners.map(formatGitHubIdentity),
        },
      },
      errors,
    };
  }

  return {
    ownership: {
      status: "matched",
      maintainers: [...manifest.maintainers],
      codeowners: {
        path: codeownersPath,
        pattern: matchingEntry.pattern,
        owners: matchingEntry.owners.map(formatGitHubIdentity),
      },
    },
    errors,
  };
}

function codeownersPatternsForPackage(packageId) {
  const packagePath = `plugins/${packageId}`;
  return new Set([
    packagePath,
    `/${packagePath}`,
    `${packagePath}/`,
    `/${packagePath}/`,
  ]);
}
