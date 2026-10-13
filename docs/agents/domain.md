# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — this repository's own glossary: what happens to a package between a pull request and the Plugin Registry.
- **Fluxta's plugin docs** at [fluxta.app/docs/plugins](https://fluxta.app/docs/plugins) — what authors are told about the packages that arrive here. Fluxta owns the package format and every rule about a single package.
- **The installed CLI** — `node_modules/@fluxta/cli/dist/` holds the validation this repository imports, at the version `package.json` pins. Where the docs and the CLI disagree, the CLI is what CI actually runs.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates this repo's own docs lazily when terms or decisions actually get resolved.

### Fluxta pages that shape this repository

- [Publishing](https://fluxta.app/docs/plugins/getting-started/publishing) — how a package reaches this repository and what happens after merge
- [Manifest](https://fluxta.app/docs/plugins/reference/manifest) — every field, Package Metadata, and the naming rule for kinds and keys
- [Iconsets](https://fluxta.app/docs/plugins/guides/iconsets) — the Iconset package, its `preview` and `color`
- [CLI](https://fluxta.app/docs/plugins/reference/cli) — `fluxta publish`, `fluxta package` and the other commands authors run
- [Versioning](https://fluxta.app/docs/plugins/reference/versioning) — how package versions and `minAppVersion` are read
- [Terminology](https://fluxta.app/docs/plugins/getting-started/terminology) — Fluxta's words, as authors meet them

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
- Anything about the package format, `fluxta publish` or the Plugin Registry belongs to Fluxta: record it in an issue here, labelled `ready-for-human` (see `docs/agents/issue-tracker.md`).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`, or as Fluxta's docs use it for Fluxta's words. Don't drift to synonyms the glossary explicitly avoids.

Key terms from `CONTEXT.md`: **Trusted Repository**, **Author Publish**, **Trusted-Repo Migration**, **Origin Marker**, **Package Type**, **Package Maintainers**, **Ownership Entry**, **Plugin Artifact**, **Publication**, **Publication Index**, **Immutable Version**, **Publication State**, **Plugin Registry**, **Build Snapshot**, **Build Scope**.

Watch the collision: **Publication** is what CI does here after merge; an author's `fluxta publish` only opens the pull request.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag conflicts

If your output contradicts an ADR of this repo, or a rule in Fluxta's plugin docs, surface it explicitly rather than silently overriding:

> _Contradicts the Immutable Version rule — but worth reopening because…_
