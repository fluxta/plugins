# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — this repository's own glossary: what happens to a package between a pull request and the Plugin Registry.
- **Fluxta's glossary and ADRs.** Fluxta owns the package model this repository conforms to (Plugin Source Package, Built Plugin Folder, Iconset, Package Type, Package Metadata, Package Validation Seam, Publication Preparation, Plugin Registry, Registry Listing, Recommended Version …) and every decision about it. They live in the private repository `fluxta/fluxta`: [`CONTEXT.md`](https://github.com/fluxta/fluxta/blob/main/CONTEXT.md) and [`docs/adr/`](https://github.com/fluxta/fluxta/tree/main/docs/adr). Read one with `gh api repos/fluxta/fluxta/contents/<path> -H "Accept: application/vnd.github.raw"`; list the ADRs with `gh api repos/fluxta/fluxta/contents/docs/adr --jq '.[].name'`.
- **The installed CLI** — `node_modules/@fluxta/cli/dist/` holds the Package Validation Seam this repository imports, at the version `package.json` pins.

If any of these files don't exist, or you have no access to `fluxta/fluxta`, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates this repo's own docs lazily when terms or decisions actually get resolved.

### Fluxta ADRs that shape this repository

- ADR-0027 — Package Metadata lives in the manifest; the CLI owns trusted tooling
- ADR-0028 — `fluxta publish` opens a pull request via local git
- ADR-0032 — the Marketplace reads a Plugin Registry service
- ADR-0034 — `fluxta publish` forks the trusted repository
- ADR-0035 — `fluxta publish` selects files by a fixed package-structure allowlist
- ADR-0039 — `fluxta publish` merges against the trusted repository; Trusted-Repo Migrations
- ADR-0043 — an Iconset is a Package Type in the plugin pipeline
- ADR-0044 — Iconset Previews are served from the CDN
- ADR-0046 — Package Types share one lifecycle, link and error model
- ADR-0047 — plugin icons are served from the CDN
- ADR-0051 — plugins declare their platforms and categories

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/        ← created with this repository's first decision
└── ...
```

## Where new docs go

- A term this repository owns → `CONTEXT.md` here.
- A decision about how this repository validates, builds or publishes → `docs/adr/` here.
- A term or decision about the package model, `fluxta publish` or the Plugin Registry belongs to Fluxta: open an issue in `fluxta/fluxta` (see `docs/agents/issue-tracker.md`).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`, or in Fluxta's glossary for the host's terms. Don't drift to synonyms the glossaries explicitly avoid.

Key terms from `CONTEXT.md`: **Trusted Repository**, **Author Publish**, **Trusted-Repo Migration**, **Origin Marker**, **Package Maintainers**, **Ownership Entry**, **Plugin Artifact**, **Publication**, **Publication Index**, **Immutable Version**, **Publication State**, **Build Snapshot**, **Build Scope**.

Watch the collisions with Fluxta's glossary: Fluxta's **Plugin Catalog** is the desktop's local on-disk list of packages, not this repository; and **Publication** is what CI does here after merge, while an author's `fluxta publish` is Fluxta's **Publication Preparation**.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR — this repo's or Fluxta's — surface it explicitly rather than silently overriding:

> _Contradicts Fluxta ADR-0039 (publish-merges-against-the-trusted-repository-instead-of-overwriting-it) — but worth reopening because…_
