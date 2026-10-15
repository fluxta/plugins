import {
  IDLE_COUNTDOWN,
  StopwatchSchema,
  TimerSchema,
  type Countdown,
  type Stopwatch,
  type StopwatchTiming,
  type Timer,
  type TimerFields,
} from "timers-protocol";

/** Plugin Settings as this plugin persists them. */
export type StoredSettings = {
  timers: Timer[];
  stopwatches: Stopwatch[];
};

interface SettingsWriter {
  setPluginSettings(data: StoredSettings): Promise<void>;
}

/**
 * The plugin's Plugin Settings — the Timers with their countdowns and the
 * Stopwatches with their timings. The sidecar is their only writer: editors ask it for changes, and every
 * Action's state change is written here.
 *
 * Read once, at startup. Fluxta echoes every write back to the plugin, and
 * the echo of one write can arrive after a newer change was made here —
 * taking it in would undo, for a moment, a Start or a Pause that already
 * happened, or bring back a Timer that has just fired, and a step running
 * in that moment would act on the old state.
 * Nothing else writes these settings, so after the load the copy in memory
 * is the truth and the echoes carry nothing new.
 */
export class SettingsStore {
  private settings: StoredSettings = {
    timers: [],
    stopwatches: [],
  };

  private markLoaded!: () => void;

  /**
   * Settles once {@link load} has run. Fluxta may ask for an Action, a
   * Source or an Options Source before the settings have arrived, and an
   * answer from the empty defaults would be wrong — so everything that reads
   * the store waits for this first.
   */
  readonly loaded = new Promise<void>((resolve) => {
    this.markLoaded = resolve;
  });

  constructor(
    private readonly plugin: SettingsWriter,
    /** Called after every change, to tell the open editors. */
    private readonly onChange: () => void = () => {},
  ) {}

  /**
   * Takes in the settings as persisted. Anything this version cannot read —
   * a malformed entry, a key it no longer uses — is dropped rather than failing
   * the whole load.
   */
  load(raw: unknown): void {
    const record =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    this.settings = {
      timers: readList(record["timers"], TimerSchema),
      stopwatches: readList(record["stopwatches"], StopwatchSchema),
    };
    this.markLoaded();
  }

  timers(): readonly Timer[] {
    return this.settings.timers;
  }

  timer(id: string): Timer | undefined {
    return this.settings.timers.find((timer) => timer.id === id);
  }

  stopwatches(): readonly Stopwatch[] {
    return this.settings.stopwatches;
  }

  stopwatch(id: string): Stopwatch | undefined {
    return this.settings.stopwatches.find((stopwatch) => stopwatch.id === id);
  }

  async addTimer(id: string, fields: TimerFields): Promise<void> {
    await this.write({
      ...this.settings,
      timers: [
        ...this.settings.timers,
        { id, ...fields, name: fields.name.trim(), countdown: IDLE_COUNTDOWN },
      ],
    });
  }

  /**
   * Changes what the Plugin Editor sets. A countdown under way keeps the Due
   * Time it was started with — a new duration counts from the next Start.
   */
  async updateTimer(id: string, fields: TimerFields): Promise<void> {
    await this.changeTimer(id, (timer) => ({
      ...timer,
      ...fields,
      name: fields.name.trim(),
    }));
  }

  async removeTimer(id: string): Promise<void> {
    await this.write({
      ...this.settings,
      timers: this.settings.timers.filter((timer) => timer.id !== id),
    });
  }

  async setCountdown(id: string, countdown: Countdown): Promise<void> {
    await this.changeTimer(id, (timer) => ({ ...timer, countdown }));
  }

  async addStopwatch(id: string, name: string): Promise<void> {
    await this.write({
      ...this.settings,
      stopwatches: [
        ...this.settings.stopwatches,
        { id, name: name.trim(), timing: { state: "idle" } },
      ],
    });
  }

  async renameStopwatch(id: string, name: string): Promise<void> {
    await this.changeStopwatch(id, (stopwatch) => ({
      ...stopwatch,
      name: name.trim(),
    }));
  }

  async removeStopwatch(id: string): Promise<void> {
    await this.write({
      ...this.settings,
      stopwatches: this.settings.stopwatches.filter(
        (stopwatch) => stopwatch.id !== id,
      ),
    });
  }

  async setTiming(id: string, timing: StopwatchTiming): Promise<void> {
    await this.changeStopwatch(id, (stopwatch) => ({ ...stopwatch, timing }));
  }

  private async changeTimer(
    id: string,
    change: (timer: Timer) => Timer,
  ): Promise<void> {
    await this.write({
      ...this.settings,
      timers: this.settings.timers.map((timer) =>
        timer.id === id ? change(timer) : timer,
      ),
    });
  }

  private async changeStopwatch(
    id: string,
    change: (stopwatch: Stopwatch) => Stopwatch,
  ): Promise<void> {
    await this.write({
      ...this.settings,
      stopwatches: this.settings.stopwatches.map((stopwatch) =>
        stopwatch.id === id ? change(stopwatch) : stopwatch,
      ),
    });
  }

  /**
   * Takes the change in memory at once — the next step sees it even while
   * it is being saved — then persists the whole settings. A failed save is
   * logged, not thrown: the change still holds until the plugin restarts,
   * and no step should fail because Fluxta could not write a file.
   */
  private async write(next: StoredSettings): Promise<void> {
    this.settings = next;
    this.onChange();

    try {
      await this.plugin.setPluginSettings(next);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Could not save the plugin's settings: ${reason}`);
    }
  }
}

/** The entries of a persisted list this version can read; the rest dropped. */
function readList<T>(
  raw: unknown,
  schema: {
    safeParse(entry: unknown): { success: true; data: T } | { success: false };
  },
): T[] {
  return Array.isArray(raw)
    ? raw.flatMap((entry) => {
        const parsed = schema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
}
