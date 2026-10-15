# Fluxta Timers

A [Fluxta](https://fluxta.app) plugin with named Timers and Stopwatches for
scenario builders. A Timer counts down and fires an Event when it runs out —
for example, to give a dropped stream fifteen minutes to come back before
calling it over. A Stopwatch counts time across pauses and hands it to later
steps — for example, to post how long the stream lasted without the minutes
it was down. Both keep counting while Fluxta is closed.

## Timers

Open the Timers plugin's settings in Fluxta and **Add Timer** with a name, a
duration — seconds (`900`) or a clock time (`15:00`, `1:30:00`) — and what
Start should do when the Timer is already running: count down again from the
start, or keep counting down as it was. Each Timer shows whether it is idle
or running, and how long it has left.

Tick **Repeat** and the Timer fires every duration until it is cancelled —
or, with **At most**, that many times: "4 times every 30:00" is over two
hours after Start. It keeps to its schedule: a firing that came late does
not push the next one back. Edit a running Timer and the current countdown
still ends when it was due; the change applies from the next one — untick
**Repeat** and it stops after the current countdown.

| Action           | What it does                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Start Timer**  | Counts down the Timer's duration, or the one the step gives. Already running, it starts over or carries on, as the Timer is set. |
| **Cancel Timer** | Stops the countdown; the Timer does not fire.                                                                                    |
| **Add Time**     | Moves a running countdown's end later by the amount — a repeating Timer's only this once. An idle Timer is left as it is.        |

A step's duration or amount can be a variable — `{{variables.…}}`, or a
value an earlier step produced, such as a Stopwatch's
`{{timers.read-stopwatch.elapsed}}`.

When a Timer runs out it fires **Timer Elapsed**, with the fields **Timer**
(filter an Event on the one you want), **Count** (1 for the first firing of
a repeating Timer, 2 for the second…), **Seconds Late** and **Missed**. A
Timer that ran out while Fluxta was closed fires once as soon as Fluxta is
back, with **Seconds Late** saying how late and **Missed** how many firings
of a repeating Timer were skipped — filter on them if a late firing should
do nothing. A repeating Timer then goes on at its next time on the
schedule. A Timer that has fired for the last time is idle again by the
time the Event's steps run, so they can start it anew.

An **If/Else** can branch on **Timer State** — idle or running — and on
**Timer Remaining Seconds**. A step pointed at a Timer that was deleted does
nothing, and a deleted Timer never fires.

## Stopwatches

Open the Timers plugin's settings in Fluxta and **Add Stopwatch** with a name.
Each one shows whether it is idle, running or paused, and the time it has
counted.

| Action              | What it does                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **Start Stopwatch** | Starts an idle Stopwatch or resumes a paused one. A running one is left as it is.                   |
| **Pause Stopwatch** | Stops it counting and produces the time it has counted.                                             |
| **Read Stopwatch**  | Produces the time it has counted, changing nothing.                                                 |
| **Reset Stopwatch** | Puts it back to idle and produces the time it had counted _before_ — closing a session in one step. |

Pause, Read and Reset produce the time as **Elapsed** (`2:14:05`), and in
parts — **Hours** (`2`), **Minutes** (`14`, 0–59), **Seconds** (`5`, 0–59)
and **Total Seconds** (`8045`) — so a message can put it in its own words. A
later step reads them as Run Variables:

```
Lasted {{timers.reset-stopwatch.hours}} h {{timers.reset-stopwatch.minutes}} min
```

Every part is rounded down to the second, and a part that is zero reads
`0` — a stream shorter than an hour lasted `0 h 45 min`. To leave it out,
branch on **Hours** with an If/Else.

An **If/Else** can branch on **Stopwatch State** — idle, running or paused —
to tell a session that has not begun from one that is only paused.

A Stopwatch counts wall-clock time: one left running while Fluxta is closed
includes that time when it is read again. A step pointed at a Stopwatch that
was deleted does nothing.

## Development

```bash
pnpm install
pnpm build        # builds dist/timers/ and restarts the plugin in a running Fluxta
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
