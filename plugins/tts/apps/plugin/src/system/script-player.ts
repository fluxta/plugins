import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isPlayerErrorKind,
  PlayerError,
  type Device,
  type PlayOptions,
  type Player,
} from "../speech/player";
import type { Audio } from "../speech/provider";
import { wavDuration } from "../speech/wav";
import type { Engine, EngineFailure } from "./script-process";

/**
 * How long past its own length a play may go before it counts as lost. On
 * macOS the end arrives ~50 ms after the sound, ~150 ms when the engine
 * starts cold; a play that never reports it — AVFAudio's callbacks rest on
 * undocumented JXA behaviour, MediaPlayer's on polling — must not hold the Speech
 * Queue forever.
 */
const END_GRACE_MS = 5000;

/**
 * A Player over a long-lived script: each Phrase goes to the script as a WAV
 * file in a private temporary folder, deleted once it has played. The script
 * answers `play` with `started`, then `ended` or an error, and is told to
 * `stop` an aborted play.
 */
export class ScriptPlayer implements Player {
  readonly #engine: Engine;
  readonly #folder: () => Promise<string>;
  #created?: Promise<string>;

  constructor(
    engine: Engine,
    folder: () => Promise<string> = () =>
      mkdtemp(join(tmpdir(), "fluxta-tts-")),
  ) {
    this.#engine = engine;
    this.#folder = folder;
  }

  devices(): Promise<Device[]> {
    return new Promise((resolve, reject) => {
      const id = this.#engine.request({ op: "devices" }, (reply) => {
        this.#engine.release(id);
        if (reply.error) {
          reject(playerError(reply.error));
        } else {
          resolve(reply.devices as Device[]);
        }
      });
    });
  }

  async play(
    audio: Audio,
    options: PlayOptions,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    this.#created ??= this.#folder();
    const path = join(await this.#created, `${randomUUID()}.wav`);
    await writeFile(path, audio);
    try {
      signal.throwIfAborted();
      await this.#play(path, wavDuration(audio), options, signal);
    } finally {
      // Windows keeps a file that is open from being removed, and the script
      // may not have let go of a stopped one yet. A file left behind is not
      // worth failing the play over.
      await rm(path, { force: true, maxRetries: 5, retryDelay: 100 }).catch(
        () => {},
      );
    }
  }

  #play(
    path: string,
    seconds: number,
    { volume, device, onStarted }: PlayOptions,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const settle = () => {
        clearTimeout(watchdog);
        this.#engine.release(id);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        this.#engine.notify({ op: "stop", id });
        settle();
        reject(signal.reason);
      };
      // Without a device the script plays on the default output as it
      // stands; the name is only for its reasons.
      const target =
        device === "system-default"
          ? {}
          : { device: device.id, name: device.name };
      const id = this.#engine.request(
        { op: "play", path, volume, ...target },
        (reply) => {
          if (reply.error) {
            settle();
            reject(playerError(reply.error));
          } else if (reply.started) {
            onStarted?.();
            watchdog = setTimeout(
              () => {
                this.#engine.notify({ op: "stop", id });
                settle();
                reject(
                  new PlayerError(
                    "transient",
                    "The sound never reported its end; it was stopped",
                  ),
                );
              },
              seconds * 1000 + END_GRACE_MS,
            );
          } else if (reply.ended) {
            settle();
            resolve();
          }
        },
      );
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

function playerError({ kind, reason }: EngineFailure): PlayerError {
  return new PlayerError(
    isPlayerErrorKind(kind) ? kind : "unavailable",
    reason,
  );
}
