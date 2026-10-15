import {
  elapsedMs,
  IDLE,
  pauseTiming,
  snapshotOf,
  startTiming,
  type ElapsedSnapshot,
  type Stopwatch,
  type StopwatchState,
} from "timers-protocol";

import type { Clock } from "../clock";
import type { SettingsStore } from "../store";

/**
 * What the Actions and the Source do to a named Stopwatch, by its id. Every
 * method answers `undefined` for an id that names no Stopwatch — unset, or
 * deleted since the step was saved — and the caller decides what to log.
 *
 * Each one waits for the settings to load, so a step Fluxta runs the moment
 * the plugin starts acts on the persisted state, not an empty one.
 */
export class Stopwatches {
  constructor(
    private readonly store: SettingsStore,
    private readonly now: Clock = Date.now,
  ) {}

  /** Starts or resumes it. `true` once it is running, whether or not it was already. */
  async start(id: string | undefined): Promise<true | undefined> {
    const stopwatch = await this.find(id);

    if (!stopwatch) {
      return undefined;
    }

    const timing = startTiming(stopwatch.timing, this.now());

    if (timing !== stopwatch.timing) {
      await this.store.setTiming(stopwatch.id, timing);
    }

    return true;
  }

  /** Stops it counting, and gives the time it has counted. */
  async pause(id: string | undefined): Promise<ElapsedSnapshot | undefined> {
    const stopwatch = await this.find(id);

    if (!stopwatch) {
      return undefined;
    }

    const now = this.now();
    const timing = pauseTiming(stopwatch.timing, now);

    if (timing !== stopwatch.timing) {
      await this.store.setTiming(stopwatch.id, timing);
    }

    return snapshotOf(elapsedMs(timing, now));
  }

  /**
   * Puts it back to idle, and gives the time it had counted until now — so
   * one step can close a session and hand on how long it lasted.
   */
  async reset(id: string | undefined): Promise<ElapsedSnapshot | undefined> {
    const stopwatch = await this.find(id);

    if (!stopwatch) {
      return undefined;
    }

    const before = elapsedMs(stopwatch.timing, this.now());

    if (stopwatch.timing.state !== "idle") {
      await this.store.setTiming(stopwatch.id, IDLE);
    }

    return snapshotOf(before);
  }

  /** The time it has counted, changing nothing. */
  async read(id: string | undefined): Promise<ElapsedSnapshot | undefined> {
    const stopwatch = await this.find(id);
    return stopwatch
      ? snapshotOf(elapsedMs(stopwatch.timing, this.now()))
      : undefined;
  }

  async state(id: string | undefined): Promise<StopwatchState | undefined> {
    return (await this.find(id))?.timing.state;
  }

  private async find(id: string | undefined): Promise<Stopwatch | undefined> {
    await this.store.loaded;
    return id ? this.store.stopwatch(id) : undefined;
  }
}
