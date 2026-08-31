#!/usr/bin/env node

/**
 * Adapter over the Plugin Package Validation Seam published by @fluxta/cli.
 *
 * The CLI owns everything that is true of a single Plugin Source Package in
 * isolation: manifest shape, package id rules, Package Metadata, SemVer, the
 * build contract, and Built Plugin Folder checks. This repository owns
 * everything only the repository knows: package discovery, CODEOWNERS
 * ownership, running the build, the Publication Index, and the artifact store.
 *
 * Authors run the same rules locally with `pnpm dlx @fluxta/cli validate`,
 * so a package that passes locally passes here.
 */

import { validatePackage } from "@fluxta/cli/validation";

/**
 * Runs the seam against one Plugin Source Package and translates the CLI's
 * ValidationIssue list into this repository's package error shape, keeping the
 * CLI's error codes so both sides report the same failure by the same name.
 *
 * `builtFolder` is "exclusive" once the package has been built, "skip" before.
 */
export async function validateSourcePackageWithCli(sourcePackage, { builtFolder = "skip" } = {}) {
  const result = await validatePackage(sourcePackage.absolutePath, {
    builtFolder,
    mode: "strict",
  });

  return {
    manifest: result.manifest,
    builtFolder: result.built?.folder ?? null,
    errors: result.report.errors.map((issue) => toPackageError(sourcePackage, issue)),
    warnings: result.report.warnings.map((issue) => toPackageError(sourcePackage, issue)),
  };
}

function toPackageError(sourcePackage, issue) {
  return {
    code: issue.code,
    package: sourcePackage.id,
    path: sourcePackage.path,
    // The CLI's issue path is the file or field the issue refers to; issues
    // that are about the package as a whole carry none.
    field: issue.path ?? "package",
    message: issue.message,
  };
}
