# Fluxta Text to Speech

A [Fluxta](https://fluxta.app) plugin that reads text aloud with this
computer's own voices — a viewer's chat message, a Redemption, a deck button.
It needs no account and no internet: the voices are the ones the operating
system ships.

It speaks on macOS and on Windows 10 and 11; see [On Windows](#on-windows)
for what differs there.

## Speak

| Action          | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **Speak**       | Reads its **Text** aloud, in the place its **Position** gives it in the queue. The step does not wait. |
| **Stop Speech** | Ends Phrases early: the one being spoken, every one, or every one carrying a **Tag**.                  |

**Text** can hold variables, so an Event can read what triggered it — for
example the message of the Platforms plugin's **Twitch Chat Message**:

```
{{platforms.twitch-chat-message.message}}
```

Every Speak becomes a **Phrase** in the plugin's single **Speech Queue**.
Phrases are spoken one at a time — a burst of chat messages waits its turn
instead of talking over itself. Speak returns as soon as its Phrase is
queued, so the steps after it run at once, and a long Phrase is never cut
short by Fluxta's step timeout.

A Phrase is spoken as **Settings → Text to Speech** says — see
[Defaults](#defaults) — including the output device it plays on.

A Phrase that cannot be spoken — its text comes out empty, the voice or the
device is missing — is dropped, and the queue moves on; see
[Recent problems](#recent-problems). A restart of the plugin or of Fluxta
drops whatever was still waiting.

Speech plays through the plugin, not through Fluxta's own sounds: **Stop
Sound** does not stop it — **Stop Speech** does.

### Position

| Position    | Where the Phrase goes                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| **In turn** | To the end of the queue. The default.                                                              |
| **Next**    | Ahead of every In turn Phrase, behind other Next ones — a paid Redemption goes before chat.        |
| **Now**     | Cuts off the Phrase being spoken and is spoken at once — a deck "BRB". The queue goes on after it. |

A Phrase a Now cuts off is not repeated. A Now cuts off another Now too.
The cut-in happens inside the one Speak, so nothing else starts in between —
unlike a Stop Speech followed by a Speak.

### Tags and Stop Speech

**Tags** label a Phrase so that **Stop Speech** can find it later — say the
viewer's id and the message's id:

```
{{platforms.twitch-chat-message.userId}}
{{platforms.twitch-chat-message.messageId}}
```

Stop Speech reaches one of:

- **Current Phrase** — cuts off the Phrase being spoken; the queue goes on;
- **Everything** — cuts it off and empties the queue, Next Phrases included;
- **Tag** — takes every waiting Phrase carrying the Tag out of the queue, and
  cuts off the one being spoken if it carries it too.

So moderation reaches the speech as well as the chat:

| Event                      | Stop Speech                                          |
| -------------------------- | ---------------------------------------------------- |
| **Twitch User Banned**     | Tag `{{platforms.twitch-user-banned.userId}}`        |
| **Twitch User Timed Out**  | Tag `{{platforms.twitch-user-timed-out.userId}}`     |
| **Twitch Message Deleted** | Tag `{{platforms.twitch-message-deleted.messageId}}` |
| **Twitch Chat Cleared**    | Everything                                           |

Tags are compared exactly, case included, without the spaces around them; a
number and the same number as text are one Tag. A Tag that comes out empty is
left off the Phrase — and **Stop Speech with an empty Tag stops nothing**, so
an Event that misses its id never wipes the whole queue. Everything happens
only when you choose it.

## Defaults

**Settings → Text to Speech** holds how every Speak speaks unless it says
otherwise:

| Setting           | What it is                                                                                                    | At first                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Default Voice** | Every voice on this computer, by language, then name — with its quality (Enhanced, Premium) where it has one. | The voice macOS speaks with         |
| **Rate**          | 0.5× to 2.0×; 1.0× is the voice's normal pace.                                                                | 1.0×                                |
| **Volume**        | 0–100 %, no boost.                                                                                            | 100 %                               |
| **Output device** | **System default**, then every output device, under the names Play Sound shows.                               | System default                      |
| **Length limit**  | Longer text is cut at the last word within this many characters, and the rest is not spoken. Empty: no limit. | 200 — about 12–15 seconds of speech |

So a fresh install speaks without the settings ever being opened, and a
change there applies to the next Speak — nothing restarts. The length limit
counts characters as a reader sees them: an emoji or an accented letter is
one, and is never split.

A Speak can override any of them under **Override defaults** — a louder voice
for a Redemption, a longer limit for paid TTS, headphones for a Phrase only
you should hear. Each field starts at **Default**, which follows the
settings; on another computer a Speak left at Default speaks with that
computer's Default Voice. A Speak that names a voice or a device this
computer does not have shows it as _not available right now_.

### Listen

**Listen**, under the voice field in the settings and in Speak's Override
defaults, says the text beside it with the rate, volume and output device in
the form — before you save anything. The text starts as an English greeting,
_Hello, chat! This is how I sound._ — type anything instead, and press Enter
or the button; a blank field says the greeting. The text is not saved. In
Speak, whatever is left at Default follows the settings, as the Speak itself
would.

It never talks over a viewer: it waits for the Phrase being spoken, then goes
ahead of the chat still waiting, and is instant when nothing is. Scenarios do
not see it — it fires no Phrase Started or Phrase Finished, and Speaking and
Phrases Waiting leave it out — but Stop Speech stops it like any Phrase. If
it cannot be heard — the voice or the device is not here — the reason shows
under the field.

### Output device

The device decides who hears the speech: chat on a device OBS captures, a
Phrase for you alone in headphones. **System default** is whatever this
computer plays on when the Phrase starts — and if OBS captures Desktop Audio,
the stream hears it too.

A Phrase never moves to another device, so it never reaches an audience it
was not meant for:

- a device that is not connected when the Phrase's turn comes drops it, and
  the queue moves on;
- a device unplugged mid-phrase cuts the Phrase off — nothing more is heard,
  on it or on the speakers — and **Phrase Finished** fires;
- on System default, switching the computer's output mid-phrase cuts the
  Phrase off too; the next one plays on the new output.

A device plugged in while the settings are open shows up once they are
reopened.

## Following the speech

Speak does not wait, so a scenario that has to act with the voice asks the
plugin instead.

| Event               | When it fires                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| **Phrase Started**  | A Phrase's sound starts — show an overlay in step with the voice.             |
| **Phrase Finished** | That Phrase has ended, whether it was spoken to the end or cut off — hide it. |

Every Phrase Started is followed by exactly one Phrase Finished, so an overlay
shown on one is never left on screen — a Phrase cut off by Stop Speech or by
a Now included. A Phrase that was never heard — stopped while it waited, its
text empty, its voice missing — fires neither. Neither Event carries
fields yet: they say that a Phrase started or ended, not which one.

An **If/Else** can branch on:

- **Speaking** — whether a Phrase is being spoken (or prepared) right now;
- **Phrases Waiting** — how many Phrases wait behind it.

Both read the queue as it is when the condition runs. A raid that floods the
chat can be held back with `Phrases Waiting < 10` before Speak: the count
already includes a Phrase a Speak queued a moment before.

## Recent problems

The step that spoke a Phrase has long finished by the time it is dropped, so
nothing fails in the scenario. Instead, **Settings → Text to Speech → Recent
problems** lists the last 20 Phrases dropped since the plugin started, newest
first: the time, the reason, and the beginning of the text, so the viewer's
lost message can be found. The section carries a red dot while the list is
not empty; a restart of the plugin clears it. Each one is written to the
plugin's log too.

| Reason           | What happened                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `voice-missing`  | The voice is not on this computer — the one the Speak names, or the Default Voice.           |
| `device-missing` | The output device is not connected, or was disconnected while speaking.                      |
| `rejected`       | The voice will not say this text — an empty one, for example.                                |
| `transient`      | Something failed that may pass — it failed twice, or while the Phrase was heard.             |
| `unavailable`    | Speech does not work on this computer right now — a locked-down Windows, or a broken engine. |

Nothing is substituted to save a Phrase: with its voice gone, a Speak is
dropped — never spoken in another voice — until another voice is picked.
A failure that may pass, such as the speech engine crashing, is tried once
more before any sound is heard; a Phrase cut off mid-sound is not repeated.
And nothing is remembered: once whatever stopped the speech is fixed, the
next Phrase speaks, with no restart.

A Listen that cannot be heard shows its reason under the voice field, not
here.

## On Windows

The voices are the ones Windows itself has, from both of its voice stores:

- the voices of **Settings → Time & language → Speech**, Pavel and Irina
  among them;
- older **SAPI** voices, including third-party ones such as RHVoice.

A voice in both is listed once. The voice Settings speaks with is the
Default Voice until you pick another. Russian voices appear once Russian is
added under **Language & region** with its text-to-speech feature. Narrator's
natural voices cannot be reached by any app.

The speech runs in Windows PowerShell, which ships with Windows — nothing is
installed. It starts with the first Phrase or the first time the settings
open, so that first Phrase waits a second or two. On a computer locked down
by AppLocker or WDAC, PowerShell runs in ConstrainedLanguage mode and Text to
Speech cannot run: every Phrase is dropped with that reason.

The output devices are named as Windows' sound settings name them —
"Speakers (Realtek(R) Audio)" — where Fluxta's own Play Sound may show a
shorter "Speakers". A device chosen on a Mac is not here on Windows, so a
Speak saved with one drops its Phrases until another device is picked.

## Development

```bash
pnpm install
pnpm build        # builds dist/tts/ and restarts the plugin in a running Fluxta
pnpm dev          # rebuild on change
pnpm test         # on macOS this also drives the real voices — silently
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
