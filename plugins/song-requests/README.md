# Fluxta Song Requests

A [Fluxta](https://fluxta.app) plugin that lets viewers request songs — by a
chat command, a channel-points reward, a donation or a deck button — and plays
them one at a time from YouTube on its own player page in OBS. Spotify is to
follow.

## Getting started

1. Open the plugin's **Song Requests** tab in Fluxta and copy the Player Page's
   address.
2. In OBS, on the same computer, add a **Browser Source** with that address.
   Keep it in view on stream: YouTube does not allow a player that is not
   shown.
3. Add a **Request Song** step wherever songs come from — a chat command, a
   channel-points reward, a deck button — with a YouTube link as its Request,
   usually what a viewer typed after the command. Later steps can read whether
   it was accepted, the Song's title and its place in the queue.

Songs play one at a time. In turn Songs keep their arrival order; a Request
Song step can choose **Next** to go ahead of them, behind earlier Next Songs.
The Current Song plays on. While no Player Page is open, Songs wait.

## Playback controls

- **Skip** ends the Current Song and moves to the next. Its Run Variable
  `title` names the skipped Song; with nothing on air, it produces no title.
- **Playback** pauses, resumes or toggles playback and returns `isPaused`.
  Requests continue to queue while paused.
- **Volume** sets a percentage or changes it by a signed amount, such as
  `+10` or `-10`, and returns `volume`. The result is rounded to a whole
  percentage within 0–100. Invalid amounts leave it unchanged.

The volume and an explicit pause survive restarts and Player Page reconnects.
A paused Song waits at its saved position until Playback resumes it.

If/Else can read **Is Playing**, **Is Paused**, **Player Connected**,
**Current Title**, **Current Requester**, **Queue Length**, **Queue Duration
(Seconds)** and **Volume**. These are Query Sources: Fluxta asks for current
state when evaluating a condition, including after a reconnect. Queue Length
and Queue Duration count waiting Songs; unknown durations contribute nothing
to the duration total. Is Playing is false until a Song goes on air, while
paused, or with its Player disconnected. Is Paused records the streamer's
explicit pause. An empty Current Title or Current Requester is an empty string.
These sources do not provide automatic live button-title bindings.

## Managing the Song Queue

- **Remove Song** removes a Requester's latest waiting Song (`!wrongsong`),
  all of a Requester's waiting Songs, the Song at a position, or one by
  `songId`. Requesters match by Platform and ID. It returns `removed` and
  the first removed Song's `title`, firing Song Dropped with `removed` for
  each. An empty Requester ID matches nothing.
- **Clear Queue** removes every waiting Song, returns `removed`, and fires
  Song Dropped with `cleared` for each. The Current Song plays on.
- **Block Song** selects the Current Song or one by `songId` and adds its
  track or channel to the Blocklist in Plugin settings. A channel uses its
  Provider ID when known and its address otherwise. Covered waiting Songs
  are dropped with `blocked`; a covered Current Song is skipped. A Song
  still at its Start Check is dropped unheard. It returns the selected `title`.
- **Requests** opens, closes or toggles Requests Open and returns `isOpen`.
  It survives restarts; playback continues while closed. A Request Song step
  can still Override the Requests Open Rule. **Requests Open** is also a
  Query Source for If/Else, read from current state after reconnects.
- **Get Song** answers for the Current Song, a waiting position, or a
  Requester's next waiting Song (`!song`, `!when`). It returns the Song's
  Event fields, `position` and `eta` in seconds. Waiting positions start at
  1; the Current Song has position and `eta` 0. An unknown duration or an
  `eta` that depends on one produces no value. A missing target produces
  no Song fields.
