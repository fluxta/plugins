# AGENTS.md

This document provides instructions for agentic coding agents working in this repository.

## Project Overview

This is Fluxta's **Trusted Repository**: the one place a [Fluxta](https://fluxta.app) plugin or Iconset becomes installable. Packages arrive here as pull requests — an author's `fluxta publish` (an Author Publish) or Fluxta's own Trusted-Repo Migration. Pull request CI validates and builds them without credentials; after merge, CI on `main` builds every changed package into a Plugin Artifact, writes it to the artifact store (Cloudflare R2) together with the Publication Index, and syncs that index to the Plugin Registry the desktop reads. Terms are in `CONTEXT.md`.

The repository's own code is plain Node.js ESM scripts with no build step. What makes a single package valid — manifest shape, Package Metadata, SemVer, the build contract, Built Plugin Folder checks, the deterministic zip — is not decided here: it is `@fluxta/cli`'s Package Validation Seam, which these scripts import.

## Commands

### Setup

```bash
pnpm install     # Node ≥ 22, the pnpm version pinned in package.json
```

### Test & validate

```bash
pnpm test                                          # node --test 'tests/**/*.test.mjs'
pnpm validate                                      # validate the checkout: dry-run Publication Index and plan, as JSON
node scripts/pr-validate.mjs --base-ref origin/main  # what pull request CI runs, as a readable report
```

Validation runs each package's own `pnpm install` and `pnpm run build`, so it takes a while.

### Build and publish locally

```bash
node scripts/plugins.mjs build --out <file> [--only <ids>]                       # build artifacts into artifacts/ and write a build snapshot
node scripts/plugins.mjs publish --publisher fake --state-dir <dir> [--out <file>]  # publish into a local directory instead of R2
node scripts/changed-plugins.mjs --root . --before <sha> --after <sha> --json     # which packages a push would rebuild
```

Each script prints its full usage with `--help` — `plugins.mjs` after its command (`node scripts/plugins.mjs build --help`). Keep `--state-dir` and `--out` outside the checkout (a temporary directory); `artifacts/` is gitignored output.

### CI only — never run these yourself

- `node scripts/plugins.mjs publish --publisher r2 …` — writes the real artifact store; needs R2 credentials.
- `node scripts/registry-sync.mjs …` — posts the Publication Index to the production Plugin Registry.

### Trusted-Repo Migration

```bash
node scripts/migrate.mjs --dependency @fluxta/sdk --version <semver> --dry-run   # what it would change
node scripts/migrate.mjs --dependency @fluxta/sdk --version <semver> --verify    # commit per package on a branch, then validate
```

Run a migration only when the user asks for one, and add `--push` / `--open-pr` only when they say so.

## Architecture

```
plugins/<id>/          one Plugin Source Package per directory — its own pnpm workspace, copied here by publish
iconsets/<id>/         one Iconset per directory
scripts/
  plugins.mjs          validate | build | publish: the repository side of the seam
  pr-validate.mjs      pull request CI: validate-only, a package-scoped report, no credentials
  changed-plugins.mjs  push CI: the packages a push changed (every one, when scripts/ or the root config changed)
  registry-sync.mjs    posts the Publication Index to the Plugin Registry; never fails a publication
  migrate.mjs          a Trusted-Repo Migration across plugins/*
  cli-validation.mjs   the adapter over @fluxta/cli's Package Validation Seam
  publisher.mjs        the artifact store: `fake` (a local directory) or `r2`
  process.mjs          child processes that always resolve
  lib/                 the seam itself: validate, build, iconset-build, build-snapshot, publish,
                       publication-index, publication-state, codeowners, migrate, registry-sync, results …
tests/                 node:test suites; helpers.mjs builds throwaway checkouts and runs the scripts as child processes
.github/CODEOWNERS     the package ownership policy
.github/workflows/
  pull-request.yml     validate (pr-validate.mjs) + the test suite
  publish.yml          on main: changed-plugins → build (no credentials) → publish to R2 → registry sync
```

### The split with `@fluxta/cli`

The CLI owns everything true of one package in isolation; this repository owns everything only the repository knows — discovering packages, CODEOWNERS ownership, running each build, immutability against what is already published, the Publication Index and the artifact store. A rule about a single package belongs in Fluxta's CLI, not in `scripts/`: open an issue in `fluxta/fluxta`, and adopt the new CLI here once it is released.

### Build, then publish

On `main`, the build job runs package-owned code (each package's `pnpm install` and `build`) with no credentials in scope, and writes a build snapshot. The publish job never runs package code: it recombines that snapshot with the published history (`--from-snapshot`) and writes to R2. Keep it that way — nothing that executes a package's code may run where the R2 or Registry secrets are.

## Key Conventions

- **`plugins/<id>/` and `iconsets/<id>/` are not edited like the rest of the repo.** A package changes through an Author Publish (a `fluxta publish` pull request from its author) or a Trusted-Repo Migration — a change Fluxta itself makes to published packages, in which every touched package bumps its own version (Fluxta ADR-0039). A dependency bump across packages runs through `scripts/migrate.mjs`; any other migration is the user's call. Never touch a package directory as a side effect of other work. Its `.origin.json` (`author` or `migration`) is written by the CLI.
- **A published version is immutable.** Its artifact and icons are never overwritten; publication refuses a conflicting object before uploading anything, and identical bytes are a no-op. A change ships as a new version. To withdraw one, mark it `yanked` or `unlisted` in the package's `publication-state.json` — never delete it from the index.
- **Every package needs an ownership entry.** `.github/CODEOWNERS` must have a line for exactly `/plugins/<id>/` or `/iconsets/<id>/` naming exactly the package's declared `maintainers`. Wildcards and the default `*` entry do not count.
- **The Publication Index's bytes are part of its contract.** It is compared by checksum, so entries are built in a canonical key order (`lib/publication-index.mjs`) and an unchanged index is never rewritten. A version published before a field existed keeps its entry byte-for-byte rather than gaining `null`s.
- **Machine-readable results.** `plugins.mjs`, `changed-plugins.mjs` and `migrate.mjs` report `--json`; a validation failure is a structured error with a `code`, a `package` and a `field` (`packageError` in `lib/shared.mjs`), never a bare throw. Tests assert on those codes (`errorCodes` in `tests/helpers.mjs`).
- **Package Types live where they live.** A package's type is decided by its directory (`plugins/` or `iconsets/`, Fluxta ADR-0043), and its manifest must agree.
- **Tests**: `node:test` with `node:assert/strict`, one suite per behaviour in `tests/`. Build a throwaway checkout with the helpers (`withTempDir`, `writeManifest`, `writeCodeowners`, `writeBuildContract` …), run the real script with `runCli` / `runPrValidate` / `runMigrate`, and assert on its JSON output.
- **Style**: ESM `.mjs`, Node built-ins only beyond `@fluxta/cli` — no new dependencies. Comments say why, and use the capitalized terms of `CONTEXT.md` and Fluxta's glossary.
- **Adopting a new `@fluxta/cli`**: bump it in `package.json`, add the exact version to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` (pnpm refuses a release younger than its minimum age otherwise), `pnpm install`, and commit all three together.

## Commits

- A short imperative sentence, capitalized, no Conventional Commits prefix: `Carry a plugin's platforms and categories into the Publication Index`, `Depend on @fluxta/cli 0.8.0`.
- `Add <id>@<version>` and `Merge <id>@<version> onto the plugins repository` are what `fluxta publish` writes, and `Migrate <id>@<version> to <dependency> <version>` is what `scripts/migrate.mjs` writes — leave those to the tools. A Trusted-Repo Migration made by hand follows the same shape: one commit per package, `Add <id>@<version>`.

## Agent skills

- Issues: GitHub Issues at `fluxta/plugins`. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain: `CONTEXT.md`, plus Fluxta's glossary and ADRs. See `docs/agents/domain.md`.
