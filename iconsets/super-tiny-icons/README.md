# Super Tiny Icons

A Fluxta iconset with the logos from
[SuperTinyIcons](https://github.com/edent/SuperTinyIcons) by Terence Eden.

Icons were copied from `images/svg` of the upstream repository with two changes:

- file names converted to kebab-case (`amazon_alexa` → `amazon-alexa`,
  `tailwindCss` → `tailwind-css`, `mcdonald_s` → `mcdonalds`)
- the `<script>` that renders the current date was removed from `calendar.svg`,
  so it shows a static date

## Adding icons

Put icons straight into `icons/` — no subfolders:

- SVG, PNG, WebP, JPEG, or GIF, at most 512 KB each and 5000 in total
- file names in kebab-case with a lowercase extension (`volume-up.svg`);
  the name without its extension is what the Icon Picker shows and searches
- one format per name: `mic.svg` and `mic.png` cannot both exist
- SVG must be plain drawing: no scripts, event handlers, `foreignObject`, or
  references to anything outside the file itself

`color` in `manifest.json` tells Fluxta how a button's icon color applies:
`stroke` recolors outlines (line icons), `fill` recolors shapes (solid
icons), and `original` keeps the icons' own colors.

`preview` lists one to six icons shown on the iconset's Marketplace card.

## Commands

- `fluxta validate` — check the iconset against the publication rules
- `fluxta package --out super-tiny-icons.zip` — build the artifact locally
- `fluxta publish` — open a pull request against the plugins repository

An iconset has no build and no dependencies: what is in this folder is what
Fluxta installs.

## Licence

`LICENSE.md` must carry the licence of every icon in `icons/`. If the icons
come from another set, keep its licence and attribution there and set
`license` in `manifest.json` to match.
