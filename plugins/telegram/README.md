# Fluxta Telegram

A [Fluxta](https://fluxta.app) plugin that posts to Telegram channels, groups
and chats through your own bots, and edits what it posted — for example, to
announce a stream when it goes live and mark the announcement when it ends.

## Setting up a Chat

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Add the bot to the channel as an admin with **Post messages** (to a group,
   as a member is enough).
3. In Fluxta, open the Telegram plugin's settings and **Add Chat**: a name,
   the channel as `@username` or its `t.me` link (a private channel's numeric
   id, such as `-1001234567890`, works too), and the bot token.

Each Chat is checked right away: the badge says **Ready** once the bot can
post there, or what to fix if it cannot. **Check** asks Telegram again. The
token is stored in the plugin's settings and never shown again — leave the
field blank when editing to keep it.

## Actions

| Action           | What it does                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Send Message** | Posts plain text to a Chat. Produces the message's **Message ID** and its **Message Text**, so a later step can use them — or keep the id in a Global Variable to edit the message from another run.                                           |
| **Edit Message** | Replaces the whole text of a Message the Chat's bot posted, given its **Message ID** — from Send Message in the same run, or from the Global Variable it was kept in. An edit that changes nothing counts as done; a missing id edits nothing. |

The text and the Message ID can contain Run Variables (`{{…}}`) from earlier
steps, the Event that fired and Global Variables. The text is sent as plain
text, so whatever they hold arrives as written. Telegram cannot tell the
plugin what a Message says now, so Edit Message cannot append to it: to keep
part of the old text, keep Send Message's **Message Text** in a Global
Variable and repeat it.

## Development

```bash
pnpm install
pnpm build        # builds dist/telegram/ and restarts the plugin in a running Fluxta
pnpm dev          # rebuild on change
pnpm test
pnpm lint && pnpm format:check
```

See [`AGENTS.md`](./AGENTS.md) for how the package is put together, and
Fluxta's [plugin docs](https://fluxta.app/docs/plugins) for the Plugin API.

## Releasing

`.github/workflows/release.yml` watches `manifest.json` on `main`. Push a
commit that bumps its `version`, and — once the `v<version>` tag doesn't
already exist — the workflow builds the plugin, packages it with
`fluxta package`, tags the commit, and opens a **draft** GitHub Release with
the zip attached. Publishing to Fluxta's catalog is `pnpm exec fluxta publish`.
