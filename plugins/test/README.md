# Test

A Fluxta plugin scaffolded with `fluxta create`.

## Commands

- `pnpm install` — install dependencies
- `pnpm typecheck` — type-check the Plugin sidecar and Action Editor
- `pnpm lint` — lint both apps with ESLint
- `pnpm format` / `pnpm format:check` — format (or check formatting of) the whole package with Prettier
- `pnpm build` — build the plugin into `dist/test/`
- `pnpm dev` — watch both apps; successful Plugin sidecar builds run `fluxta restart`
- `fluxta validate` — validate the existing build output

`fluxta restart` refreshes the Development Link and asks Fluxta to restart
the Plugin process; it does not build the package.

## Before publishing

`fluxta publish` fills in `maintainers` and `repository` on its own, from
your GitHub login and the package's `origin` remote. `author` (and
`homepage`, if you'd rather set it by hand instead of relying on
`repository`) still need a real value in `manifest.json` before `fluxta
validate` passes in strict publishable mode.

`fluxta publish` also runs `lint` and `format:check` itself before it
authenticates or touches GitHub, and stops if either fails — fix them (or
run `pnpm lint`/`pnpm format` yourself first) and retry.

## Releasing on GitHub

`.github/workflows/release.yml` watches `manifest.json` on `main`. Push a
commit that bumps its `version` field, and — once the `v<version>` tag it
computes doesn't already exist — the workflow builds the plugin, packages it
with `fluxta package` (the same publishable validation as running it
locally), tags the commit, and opens a **draft** GitHub Release with the
packaged zip attached. Review the generated release notes and publish the
release by hand from the repository's Releases page.
