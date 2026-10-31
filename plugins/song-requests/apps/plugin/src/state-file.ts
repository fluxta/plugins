import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { SongQueueSnapshot } from "./songs/song-queue";
import type { SearchCacheEntry } from "./youtube/search-cache";

type StateSnapshot = SongQueueSnapshot & { searchCache?: SearchCacheEntry[] };

/**
 * The plugin's State file (ADR-0002): the Song Queue — with Requesters and
 * References — and the Current Song with how far it has played, in one JSON
 * file of the plugin's own. It lives in the OS's per-user application data
 * folder, never in the package folder, which Fluxta replaces on update
 * (Fluxta ADR-0033). It is written atomically — a temporary file renamed over
 * it — so an interrupted write never leaves a broken file; a file that cannot
 * be read is moved aside and the plugin starts empty.
 */

/** The file's format; `version` moves when the shape does. */
const STATE_VERSION = 1;

const SongSchema = z.object({
  provider: z.string(),
  trackId: z.string(),
  title: z.string(),
  channel: z.string(),
  channelId: z.string().optional(),
  channelUrl: z.string(),
  url: z.string(),
  duration: z.number().optional(),
  music: z.boolean().optional(),
  requesterPlatform: z.string(),
  requesterId: z.string(),
  requesterName: z.string(),
  reference: z.string(),
  id: z.string(),
  requestOrder: z.number().int().nonnegative().optional(),
  durationBounds: z
    .object({
      maxSeconds: z.number().optional(),
      minSeconds: z.number().optional(),
    })
    .optional(),
});

const HistoryEntrySchema = z.object({
  song: SongSchema,
  how: z.enum(["finished", "failed", "skipped"]),
  at: z.number(),
});

const StateFileSchema = z.object({
  version: z.literal(STATE_VERSION),
  requestsOpen: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  volume: z.number().int().min(0).max(100).optional(),
  waiting: z.array(SongSchema),
  current: z
    .object({
      song: SongSchema,
      atStartCheck: z.boolean(),
      started: z.boolean(),
      position: z.number(),
    })
    .optional(),
  /**
   * Kept since the Rules and the History; a file written before them has
   * none, and reads as empty — the shape change is the addition, so the
   * version stays 1.
   */
  history: z.array(HistoryEntrySchema).optional(),
  /** Additive: older State files keep their queue and read with no search cache. */
  searchCache: z
    .array(
      z.object({
        words: z.string(),
        videoId: z.string(),
        foundAt: z.number().nonnegative(),
      }),
    )
    .optional(),
});

/**
 * Where the State file lives by default: Fluxta's own per-user application
 * data folder — the host is a Tauri app whose identifier is Fluxta — beside
 * what Fluxta keeps there, in a folder of the plugin's own. Fluxta leaves a
 * removed plugin's settings behind (ADR-0033); the State file stays with them.
 */
export function stateFilePath(): string {
  const home = os.homedir();
  const folder =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Fluxta")
      : process.platform === "win32"
        ? path.join(
            process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
            "Fluxta",
          )
        : path.join(
            process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
            "Fluxta",
          );
  return path.join(folder, "song-requests", "state.json");
}

/** What `load` found: the saved queue, unless the file was missing or broken. */
export type LoadedState = {
  snapshot?: StateSnapshot;
  /** The file could not be read and was moved aside; the plugin starts empty. */
  recovered: boolean;
};

export class StateFile {
  readonly #path: string;
  /** Writes run one at a time: two saves must not interleave their renames. */
  #pending: Promise<void> = Promise.resolve();

  constructor(path = stateFilePath()) {
    this.#path = path;
  }

  async load(): Promise<LoadedState> {
    let text: string;
    try {
      text = await fs.readFile(this.#path, "utf8");
    } catch (error) {
      // No file yet — a first run, or one after the plugin was removed.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { recovered: false };
      }
      return this.#moveAside();
    }

    try {
      const { version, history, ...snapshot } = StateFileSchema.parse(
        JSON.parse(text),
      );
      void version;
      return {
        snapshot: { ...snapshot, history: history ?? [] },
        recovered: false,
      };
    } catch {
      return this.#moveAside();
    }
  }

  save(snapshot: StateSnapshot): Promise<void> {
    const write = this.#pending.then(() => this.#write(snapshot));
    this.#pending = write.catch(() => {});
    return write;
  }

  async #write(snapshot: StateSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(this.#path), { recursive: true });
    const text = JSON.stringify({ version: STATE_VERSION, ...snapshot });
    // Atomic: a temporary file in the same folder renamed over the old one —
    // a reader sees either the whole old file or the whole new one, whatever
    // an interrupted write or a crash leaves behind (ADR-0002).
    const tmp = `${this.#path}.tmp-${process.pid}`;
    await fs.writeFile(tmp, text, "utf8");
    await fs.rename(tmp, this.#path);
  }

  /** The file cannot be used: move it aside, start empty, and say so. */
  async #moveAside(): Promise<LoadedState> {
    console.error(
      `The Song Queue's State file could not be read, and was moved aside: ${this.#path}`,
    );
    await fs
      .rename(this.#path, `${this.#path}.broken-${Date.now()}`)
      .catch(() => {});
    return { recovered: true };
  }
}
