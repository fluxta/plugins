# Trusted Repository

Fluxta's trusted repository for plugins and Iconsets: where a package version
is reviewed, built into an artifact, published to the artifact store, and
announced to the Plugin Registry. This glossary covers what happens to a
package between a pull request and the Registry.

Fluxta's own vocabulary — Plugin Source Package, Built Plugin Folder, Iconset,
Iconset Preview, Package Type, Package Metadata, Package Validation Seam,
Publication Preparation, Plugin Registry, Registry Listing, Recommended
Version — is defined in the host's glossary and is not redefined here.

## Language

### The repository

**Trusted Repository**:
This repository. Holds a copy of every published package's sources under
`plugins/<id>/` or `iconsets/<id>/`, and is the only source the artifact store
and the Plugin Registry are fed from.
_Avoid_: Plugin Catalog (Fluxta's name for the desktop's local on-disk list of
packages), marketplace (the in-app surface), registry, store.

**Author Publish**:
A package version arriving as a pull request that `fluxta publish` opened from
its author's own Plugin Source Package (Fluxta ADR-0028, ADR-0034). Before
opening it, `publish` merges the author's files against what this repository
already holds, so a Trusted-Repo Migration made since is kept (ADR-0039).
_Avoid_: upload, submission, release.

**Trusted-Repo Migration**:
A change Fluxta makes to packages directly in this repository rather than
through their authors — most often a shared dependency bump across every
plugin, which `scripts/migrate.mjs` runs through `@fluxta/cli`'s migration.
Every package it touches gets its own version bump, and the change reaches the
store through the same pull request CI and Publication as an Author Publish;
the author's next `fluxta publish` merges it in rather than overwriting it
(ADR-0039).
_Avoid_: hotfix, sync, patch.

**Origin Marker**:
A package's `.origin.json`: `author` when an Author Publish wrote it,
`migration` when the migration tool did. Written by the CLI, never by hand.

### Ownership

**Package Maintainers**:
The GitHub users or teams a package declares in its manifest's `maintainers`
(part of its Package Metadata).
_Avoid_: owners (that is what CODEOWNERS routes), authors.

**Ownership Entry**:
The `.github/CODEOWNERS` line for exactly a package's directory, naming
exactly its Package Maintainers. Every package must have one; a wildcard or the
repository's default entry never counts.
_Avoid_: code owner, reviewer list.

### Publication

**Plugin Artifact**:
The zip of one plugin version's Built Plugin Folder, made by the CLI's
deterministic archiver so `fluxta package` reproduces its checksum. An
Iconset's artifact is zipped straight from its source files, with no build.
Stored under an object key beside the package's own icon and, for an Iconset,
its Iconset Preview icons.
_Avoid_: bundle, package (the source tree), release asset.

**Publication**:
CI on `main` writing a merged package version's artifact and icons to the
artifact store and recording it in the Publication Index. Only CI publishes;
an author's `fluxta publish` is Publication Preparation.
_Avoid_: publish (the author's command), deploy, release.

**Publication Index**:
`publication-index.json` in the artifact store: every package with every
version ever published — its manifest (runtime fields and Package Metadata),
its artifact's object key, checksum, size, source commit and time, and its
Publication State. Built in a canonical key order and compared by checksum, so
an unchanged index is never rewritten. Posted whole to the Plugin Registry
after every Publication; the artifact store stays authoritative if that sync
fails.
_Avoid_: catalog, registry (the Registry mirrors it), manifest.

**Immutable Version**:
The rule that a published version never changes: its artifact and icons are
never overwritten, publication refuses a conflicting object before uploading
anything, and identical bytes are a no-op. A change, a Trusted-Repo Migration
included, ships as a new version.
_Avoid_: republish, overwrite.

**Publication State**:
A published version's status: `published`, `yanked`, or `unlisted`, set in a
package's `publication-state.json`. A yanked or unlisted version stays in the
Publication Index but is never a Recommended Version.
_Avoid_: deleted, deprecated, hidden.

### CI

**Build Snapshot**:
What the credential-free build job hands to the publish job: the built
packages and their artifacts, build-time errors, and each package's
Publication State. The publish job recombines it with the
published history and never runs package code itself, so no package's code
runs where the store's credentials are.
_Avoid_: cache, build output.

**Build Scope**:
The packages one push to `main` rebuilds and publishes: only those whose
directories it changed, or every package when it changed something they all
build with — `scripts/`, the root `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml` or the publish workflow (`scripts/changed-plugins.mjs`).
_Avoid_: affected packages, diff.
