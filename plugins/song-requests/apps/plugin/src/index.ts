import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  isEditorMessage,
  isRegion,
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
  type PluginMessage,
  type PluginStatus,
  type RuleDefaults,
} from "song-requests-protocol";

import { RequestSongAction } from "./actions/request-song";
import { SkipAction } from "./actions/skip";
import { PlaybackAction } from "./actions/playback";
import { VolumeAction } from "./actions/volume";
import { RemoveSongAction } from "./actions/remove-song";
import { ClearQueueAction } from "./actions/clear-queue";
import { BlockSongAction } from "./actions/block-song";
import { RequestsAction } from "./actions/requests";
import { GetSongAction } from "./actions/get-song";
import { createRequestsSource } from "./sources/requests";
import { createPlaybackSources } from "./sources/playback";
import {
  SONG_DROPPED_EVENT,
  SONG_ENDED_EVENT,
  SONG_STARTED_EVENT,
  toSongDroppedPayload,
  toSongEndedPayload,
  toSongStartedPayload,
} from "./events";
import { PagePlayer } from "./player-page/page-player";
import { ensurePlayerKey, newPlayerKey } from "./player-page/player-key";
import {
  startPlayerPageServer,
  type PlayerPageServer,
} from "./player-page/server";
import { plugin } from "./plugin";
import type { PluginSettings } from "./settings";
import { SongQueue } from "./songs/song-queue";
import { StateFile } from "./state-file";
import { DataApi } from "./youtube/data-api";
import { playlistIdOf } from "./youtube/link";
import { fallbackPlaylistTracks } from "./youtube/playlist";
import { createYouTubeProvider } from "./youtube/provider";
import { systemRegion } from "./youtube/region";
import { SearchCache } from "./youtube/search-cache";

/**
 * The port the Player Page serves on when the Settings hold none. It stays
 * fixed by default, so the address in OBS stays the same; the Plugin Editor
 * changes it.
 */
const DEFAULT_PLAYER_PORT = 29362;

/** The Player Page's build, beside this bundle in the Built Plugin Folder. */
const PAGE_DIR = fileURLToPath(new URL("./player/", import.meta.url));

/** The computer's own Region, until the streamer picks another. */
const SYSTEM_REGION = await systemRegion();

// The sidecar is the only writer of Plugin settings, so this copy is what
// they hold. It is unset until they have been read: a change made before
// then would be written over them.
let settings: PluginSettings | undefined = undefined;

const chosenRegion = () =>
  isRegion(settings?.region) ? settings.region : null;

const pagePlayer = new PagePlayer();
const dataApi = new DataApi({ fetch });

// The Song Queue and search cache share the State file (ADR-0002).
const stateFile = new StateFile();
const restored = await stateFile.load();
const searchCache = new SearchCache({
  initial: restored.snapshot?.searchCache,
  onChange: saveState,
});
const youtube = createYouTubeProvider({
  fetch,
  player: pagePlayer,
  dataApi,
  region: () => chosenRegion() ?? SYSTEM_REGION,
  searchCache,
});

const queue = new SongQueue({
  providers: [youtube],
  newId: randomUUID,
  initial: restored.snapshot,
  // The Rules' Defaults and the Blocklist are Plugin settings: read live, so
  // a change in the Plugin Editor applies to the next Request.
  rules: {
    defaults: () => ({
      ...FALLBACK_RULE_DEFAULTS,
      ...settings?.ruleDefaults,
    }),
    blocklist: () => settings?.blocklist ?? [],
  },
  onChange: () => {
    saveState();
    publish();
  },
  onBlock: (entry) => {
    if (!settings) return false;
    const blocklist = settings.blocklist ?? [];
    if (
      !blocklist.some(
        (existing) => JSON.stringify(existing) === JSON.stringify(entry),
      )
    ) {
      saveSettings({ blocklist: [...blocklist, entry] });
    }
    publish();
    return true;
  },
  onStarted: (song) =>
    plugin.emitEvent(SONG_STARTED_EVENT, toSongStartedPayload(song)),
  onEnded: (song, how) =>
    plugin.emitEvent(SONG_ENDED_EVENT, toSongEndedPayload(song, how)),
  onDropped: (song, why) =>
    plugin.emitEvent(SONG_DROPPED_EVENT, toSongDroppedPayload(song, why)),
});

/**
 * The State file keeps the Song Queue across restarts: on every change, and
 * every few seconds while a Song plays, so a restart loses only those few
 * seconds of how far the Current Song has played.
 */
function saveState(): void {
  stateFile
    .save({ ...queue.snapshot(), searchCache: searchCache.snapshot() })
    .catch(() =>
      console.error("The Song Queue's State file could not be written"),
    );
}

// Nothing of the Current Song plays while its Player is away, so the few
// seconds matter only while one is connected.
const stateSaveTimer = setInterval(() => {
  if (queue.snapshot().current) saveState();
}, 5_000);
stateSaveTimer.unref();

plugin.registerAction(new RequestSongAction(queue));
plugin.registerAction(new SkipAction(queue));
plugin.registerAction(new PlaybackAction(queue));
plugin.registerAction(new VolumeAction(queue));
plugin.registerAction(new RemoveSongAction(queue));
plugin.registerAction(new ClearQueueAction(queue));
plugin.registerAction(new BlockSongAction(queue));
plugin.registerAction(new RequestsAction(queue));
plugin.registerAction(new GetSongAction(queue));
plugin.registerSource(createRequestsSource(queue));
for (const source of createPlaybackSources(queue))
  plugin.registerSource(source);

// Read by `status()` from the start — an editor may ask before the settings
// have been read — so it starts out unknown.
let playerKey: string | undefined = undefined;

/** The Player Page's server, once it could listen; swapped on a port change. */
let pageServer: PlayerPageServer | undefined;

/** The port the Player Page answers on: the served one, else the configured. */
function servedPort(): number {
  return pageServer?.port ?? settings?.playerPort ?? DEFAULT_PLAYER_PORT;
}

/**
 * Serves the Player Page on `port`; the server it replaces, if any, closes
 * once the new one answers, so a port another program holds leaves the page
 * where it was. Whether it worked, every editor is told again — the status
 * names the port that answers, or the configured one when none does.
 */
async function swapPlayerPageServer(port: number): Promise<boolean> {
  try {
    const next = await startPlayerPageServer({
      port,
      pageDir: PAGE_DIR,
      playerKey: () => playerKey ?? "",
      onPage: (page) => pagePlayer.connect(page),
    });
    const previous = pageServer;
    pageServer = next;
    await previous?.close();
    console.log(`The Player Page is served on localhost:${next.port}`);
    return true;
  } catch (error) {
    // Another program holds the port. With the old server still answering
    // nothing changes; with no old server, Request Song still queues, and
    // nothing plays until a free port is set.
    const code = (error as NodeJS.ErrnoException).code ?? String(error);
    console.error(`The Player Page cannot listen on port ${port}: ${code}`);
    return false;
  } finally {
    publish();
  }
}

// One port change at a time, in the order they arrived: each swap binds its
// new server before the last closes, so two must not overlap.
let serving: Promise<void> = Promise.resolve();
function servePlayerPageOn(port: number): void {
  serving = serving.then(async () => {
    // The setting is written only once the new port answers; a taken port
    // leaves the page where it was.
    if (await swapPlayerPageServer(port)) {
      saveSettings({ playerPort: port });
    }
  });
}

function status(): PluginStatus {
  return {
    // Always `localhost`, never an IP: YouTube refuses to play on a page
    // addressed by one (spike #3).
    playerUrl: playerKey
      ? `http://localhost:${servedPort()}/player?key=${playerKey}`
      : "",
    playerPort: servedPort(),
    playerConnected: pagePlayer.connected,
    apiKey: dataApi.status(),
    region: { chosen: chosenRegion(), system: SYSTEM_REGION },
    stateFile: { recovered: restored.recovered },
    defaults: {
      ...FALLBACK_RULE_DEFAULTS,
      ...settings?.ruleDefaults,
      requestsOpen: queue.requestsOpen,
    } satisfies RuleDefaults,
    blocklist: (settings?.blocklist ?? []) as BlocklistEntry[],
    fallbackPlaylist: settings?.fallbackPlaylist ?? "",
    history: queue.editorHistory(),
    playback: queue.editorPlayback(),
  };
}

/**
 * Learns the Fallback Playlist's tracks and hands them to the Song Queue.
 * Read when the playlist is set and when the plugin starts: through the
 * Data API with a usable key — `playlistItems.list` and `videos.list` at a
 * unit per 50 tracks each — or, without one, from the Player Page, which
 * lists a playlist it is cued with (ADR-0003).
 */
async function learnFallbackPlaylist(): Promise<void> {
  const link = settings?.fallbackPlaylist?.trim() ?? "";
  const playlistId = link ? playlistIdOf(link) : undefined;
  if (!playlistId) {
    queue.setFallbackTracks(undefined);
    return;
  }
  queue.setFallbackTracks(
    await fallbackPlaylistTracks(
      dataApi,
      playlistId,
      chosenRegion() ?? SYSTEM_REGION,
      (id) => pagePlayer.listPlaylist(id),
    ),
  );
}

// Readings overlap easily — a page connecting as the answer arrives, a key
// saved mid-read — and each spends units; they run one after another.
let learningFallback: Promise<void> = Promise.resolve();
function scheduleFallbackLearning(): void {
  learningFallback = learningFallback
    .then(learnFallbackPlaylist)
    .catch(() => {});
}

/** Tells every open editor how the plugin stands. */
function publish(): void {
  plugin.sendToEditor({
    event: "status",
    status: status(),
  } satisfies PluginMessage);
}

/**
 * The streamer's own Request from the Plugin Editor's add field: checked as
 * Request Song with the Defaults — no Requester, so the per-Requester Rules
 * do not count it — and answered to the editor, accepted or refused.
 */
async function requestFromEditor(request: string): Promise<void> {
  const answer = await queue.request(request, {
    requesterPlatform: "",
    requesterId: "",
    requesterName: "",
    reference: "",
  });
  plugin.sendToEditor({
    event: "request-answer",
    answer:
      answer.kind === "accepted"
        ? {
            kind: "accepted",
            position: answer.position,
            eta: answer.eta ?? null,
          }
        : { kind: "refused", reason: answer.reason },
  } satisfies PluginMessage);
}

/**
 * Queue again from the History (#14): the Song's link requested as the
 * streamer's own — checked with the Defaults, no Requester, so the
 * per-Requester Rules do not count it — and answered to the editor, its
 * place in the Song Queue or the Refusal's reason.
 */
async function queueAgainFromEditor(songId: string): Promise<void> {
  const answer = await queue.queueAgain(songId);
  if (answer === undefined) return;
  plugin.sendToEditor({
    event: "queue-again-answer",
    songId,
    answer:
      answer.kind === "accepted"
        ? {
            kind: "accepted",
            position: answer.position,
            eta: answer.eta ?? null,
          }
        : { kind: "refused", reason: answer.reason },
  } satisfies PluginMessage);
}

/** `setPluginSettings` replaces the whole object, so a change goes in with the rest. */
function saveSettings(change: Partial<PluginSettings>): void {
  if (!settings) return;
  settings = { ...settings, ...change };
  plugin
    .setPluginSettings(
      settings as Parameters<typeof plugin.setPluginSettings>[0],
    )
    // Never the settings themselves: the API Key is among them.
    .catch(() => console.error("The Plugin settings could not be saved"));
}

pagePlayer.onConnectionChange((connected) => {
  publish();
  // Without the API Key the Fallback Playlist is read from the page.
  if (connected) scheduleFallbackLearning();
});
dataApi.onStatusChange(publish);

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) return;

  switch (message.event) {
    case "get-status":
      publish();
      return;

    case "playback":
      // The Now section's Pause and Resume: what the Playback Action does.
      queue.playback(message.mode);
      publish();
      return;

    case "skip":
      queue.skip();
      publish();
      return;

    case "set-volume":
      queue.setVolume(message.volume);
      publish();
      return;

    case "set-requests-open":
      // What the Requests Action does in its open and close modes.
      queue.requests(message.open ? "open" : "close");
      publish();
      return;

    case "reorder-song":
      queue.reorder(message.songId, message.toPosition);
      publish();
      return;

    case "move-song-next":
      queue.moveToNext(message.songId);
      publish();
      return;

    case "remove-song":
      // What the Remove Song Action does by `songId`: Song Dropped, `removed`.
      queue.remove({ kind: "songId", songId: message.songId });
      publish();
      return;

    case "block-song":
      // What the Block Song Action does by `songId`: the track goes into
      // the Blocklist and the Songs it covers leave the Song Queue.
      queue.blockSong({ kind: "songId", songId: message.songId }, "track");
      publish();
      return;

    case "queue-again":
      // The History's Queue again: the streamer's own Request, checked with
      // the Defaults — the same Song Queue call as the add field's.
      void queueAgainFromEditor(message.songId);
      return;

    case "block-history-song":
      // What Block Song does with a History Song's track or channel (#14):
      // the entry goes into the Blocklist and waiting Songs it cover leave
      // the Song Queue.
      queue.blockHistorySong(message.songId, message.kind);
      publish();
      return;

    case "request-song":
      void requestFromEditor(message.request);
      return;

    case "set-api-key": {
      if (!settings) return;
      const apiKey = message.apiKey.trim();
      saveSettings({ apiKey: apiKey || undefined });
      dataApi.setKey(apiKey);
      // So the Plugin Editor can say whether YouTube accepts it at once.
      void dataApi.check();
      // Which way the Fallback Playlist is read may have changed.
      scheduleFallbackLearning();
      return;
    }

    case "set-fallback-playlist": {
      if (!settings) return;
      saveSettings({ fallbackPlaylist: message.playlist.trim() || undefined });
      scheduleFallbackLearning();
      publish();
      return;
    }

    case "replace-player-key": {
      if (!settings) return;
      playerKey = newPlayerKey();
      saveSettings({ playerKey });
      // Every open page holds an address that no longer works: it stops for
      // good, and the new address is shown to copy into OBS.
      pagePlayer.closeForKeyChange();
      publish();
      return;
    }

    case "set-player-port": {
      if (!settings) return;
      if (message.port === servedPort()) return;
      servePlayerPageOn(message.port);
      return;
    }

    case "set-region":
      if (!settings) return;
      saveSettings({ region: message.region ?? undefined });
      publish();
      return;

    case "set-rule-defaults":
      if (!settings) return;
      if (message.defaults.requestsOpen !== undefined) {
        queue.requests(message.defaults.requestsOpen ? "open" : "close");
      }
      // The editor writes 0 for "no shortest bound"; the setting is the
      // value's absence, so an explicit 0 removes it.
      if (message.defaults.shortestDurationSeconds === 0) {
        const ruleDefaults = {
          ...settings.ruleDefaults,
          ...message.defaults,
        };
        delete ruleDefaults.shortestDurationSeconds;
        saveSettings({ ruleDefaults });
      } else {
        saveSettings({
          ruleDefaults: { ...settings.ruleDefaults, ...message.defaults },
        });
      }
      publish();
      return;

    case "remove-blocklist-entry":
      if (!settings) return;
      saveSettings({
        blocklist: (settings.blocklist ?? []).filter(
          (entry) => JSON.stringify(entry) !== JSON.stringify(message.entry),
        ),
      });
      publish();
      return;
  }
});

await plugin.connect();

// Settings are only readable over the authenticated connection.
const { payload } = await plugin.getPluginSettings();
const stored = (payload ?? {}) as PluginSettings;
playerKey = await ensurePlayerKey(stored, (next) =>
  plugin.setPluginSettings(
    next as Parameters<typeof plugin.setPluginSettings>[0],
  ),
);
settings = { ...stored, playerKey };

dataApi.setKey(typeof settings.apiKey === "string" ? settings.apiKey : "");
void dataApi.check();
scheduleFallbackLearning();

await swapPlayerPageServer(servedPort());
