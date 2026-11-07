# Wave Link for Fluxta

Control one local Elgato Wave Link 3 instance from Fluxta on Windows or macOS.
Created with `fluxta create`; uses the public Fluxta SDK and UI Kit.

Development build: see [compatibility evidence](docs/compatibility.md).
Real write checks and the Windows manual matrix remain pending.

## Actions

| Action        | Settings                                      |
| ------------- | --------------------------------------------- |
| Set Volume    | Target, Channel/Mix, percent (0–100)          |
| Adjust Volume | Target, Channel/Mix, signed percentage points |
| Set Mute      | Target, Channel/Mix, Mute / Unmute / Toggle   |

Targets are Channel overall, Channel in Mix, and Mix overall. Each setting is
independent. Unmuting a Channel in Mix does not unmute the overall Channel or
Mix. Volume inputs accept Run Variables; resulting volume is clamped to 0–100%.

Every Action returns `success` and `error` (empty on success). Check `success`
before dependent steps: Fluxta continues a Run after plugin-step failures.
Disconnected commands fail immediately and are never replayed.

## Values and Events

Sources provide current volume and mute at each level, `connected` and
`connectionStatus`. Offline, deleted or unsupported Target values are absent.
Mute is the selected flag, not effective silence. Volume is a fader setting,
not a signal meter.

Volume Changed and Mute Changed include the Target kind, Channel/Mix ids and
names, and old/new values. Connection Status Changed reports status and reason.
The plugin's own changes also emit Events. Identical values, startup and
reconnection hydration emit no volume/mute Events. Use conditions or idempotent
setters when an Event-driven scenario writes back to its own Target.

Live pickers save ids. Renames keep bindings. Deleted objects require explicit
reselection, even if a replacement has the same name. Plugin settings show the
connection, live settings and latest Action error.

## Develop

Node >=22.18 and the pnpm version pinned in package.json:

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm exec fluxta validate --warnings-as-errors
```

With Fluxta running:

```sh
pnpm exec fluxta link dist/wave-link
pnpm dev
```

Builds produce `dist/wave-link/`. Both `pnpm build` and sidecar rebuilds during
`pnpm dev` automatically run `fluxta restart`. With Fluxta running, this creates
or refreshes the Development Link and restarts the Wave Link plugin using the
built output. A failed restart does not fail the build, so Fluxta can be closed
while building. Reopen an editor after an editor-only rebuild. Fluxta captures
sidecar logs in the built folder. `pnpm exec fluxta unlink` removes the
Development Link.

`pnpm probe` verifies local discovery and reads Channels/Mixes without changing
audio. It prints counts and capabilities, not the user's Channel names or ids.

## Extend

`apps/plugin/src/wave-link/` owns RPC, discovery and state independently of
Fluxta. `actions/`, `sources/`, `options/` and `events/` expose it to Fluxta.
`packages/protocol/` shares types/messages with `apps/editor/`.

See [scope](docs/spec.md), [domain language](CONTEXT.md) and
[protocol notes](docs/protocol.md). Preserve public ids and saved settings as
features are added. Hardware gain, effects, routing, fades, meters and remote
connections are deferred. Release workflow is manually dispatched; publication
is a separate user decision.
