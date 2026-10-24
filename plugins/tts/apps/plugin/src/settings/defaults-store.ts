import { INITIAL_DEFAULTS, type Defaults } from "tts-protocol";

import { readDefaults } from "./defaults";

/** Plugin Settings as this plugin persists them. */
export type StoredSettings = { defaults: Defaults };

interface SettingsWriter {
  setPluginSettings(data: StoredSettings): Promise<void>;
}

/**
 * The defaults in Plugin Settings. The sidecar is their only writer: the
 * Plugin Editor asks it for a change, and it reads them warily first.
 *
 * Read once, at startup. Fluxta echoes every write back to the plugin, and
 * the echo of one change can arrive after a newer one was made here — taking
 * it in would bring the older defaults back for a moment. Nothing else
 * writes these settings, so after the load the copy in memory is the truth.
 */
export class DefaultsStore {
  readonly #writer: SettingsWriter;
  readonly #onChange: () => void;
  #defaults: Defaults = INITIAL_DEFAULTS;
  #markLoaded!: () => void;

  /**
   * Settles once {@link load} has run. A Speak can arrive before the
   * settings have, and speaking it with the initial defaults would ignore
   * what the user chose — so a Speak waits for this first.
   */
  readonly loaded = new Promise<void>((resolve) => {
    this.#markLoaded = resolve;
  });

  constructor(
    writer: SettingsWriter,
    /** Called after every change, to tell the open editors. */
    onChange: () => void = () => {},
  ) {
    this.#writer = writer;
    this.#onChange = onChange;
  }

  get current(): Defaults {
    return this.#defaults;
  }

  /** Takes in the settings as persisted — or nothing, on a fresh install. */
  load(raw: unknown): void {
    const record =
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>)
        : {};
    this.#defaults = readDefaults(record.defaults);
    this.#markLoaded();
  }

  /**
   * Takes new defaults in memory at once — the next Speak uses them even
   * while they are being saved — then persists them. A failed save is
   * logged, not thrown: the change holds until the plugin restarts.
   */
  async set(raw: unknown): Promise<void> {
    this.#defaults = readDefaults(raw);
    this.#onChange();
    try {
      await this.#writer.setPluginSettings({ defaults: this.#defaults });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Could not save the plugin's settings: ${reason}`);
    }
  }
}
