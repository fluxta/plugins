import { randomUUID } from "node:crypto";

import { INITIAL_DEFAULTS, type Defaults, type Preset } from "tts-protocol";

import { readDefaults } from "./defaults";
import { readPresetDraft, readPresets } from "./presets";
import { isRecord } from "./values";

/**
 * Plugin Settings as this plugin persists them. The ElevenLabs API key is
 * among them and nowhere else: the editors are told only whether there is
 * one.
 */
export type StoredSettings = {
  defaults: Defaults;
  presets: Preset[];
  elevenLabs?: { key: string };
};

/** What the store holds in memory. */
type Settings = {
  defaults: Defaults;
  presets: Preset[];
  elevenLabsKey?: string;
};

interface SettingsWriter {
  setPluginSettings(data: StoredSettings): Promise<void>;
}

/**
 * The Defaults, the Presets and the ElevenLabs API key in Plugin Settings.
 * The sidecar is their only writer: the Plugin Editor asks it for a change,
 * and it reads them warily first.
 *
 * Read once, at startup. Fluxta echoes every write back to the plugin, and
 * the echo of one change can arrive after a newer one was made here — taking
 * it in would bring the older settings back for a moment. Nothing else
 * writes these settings, so after the load the copy in memory is the truth.
 */
export class SettingsStore {
  readonly #writer: SettingsWriter;
  readonly #onChange: () => void;
  readonly #newId: () => string;
  #settings: Settings = { defaults: INITIAL_DEFAULTS, presets: [] };
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
    /** A new Preset's id. */
    newId: () => string = randomUUID,
  ) {
    this.#writer = writer;
    this.#onChange = onChange;
    this.#newId = newId;
  }

  get defaults(): Defaults {
    return this.#settings.defaults;
  }

  /** In the order they were made. */
  get presets(): readonly Preset[] {
    return this.#settings.presets;
  }

  /** For the requests to ElevenLabs alone: never for an editor, nor a log. */
  get elevenLabsKey(): string | undefined {
    return this.#settings.elevenLabsKey;
  }

  /** Takes in the settings as persisted — or nothing, on a fresh install. */
  load(raw: unknown): void {
    const record = isRecord(raw) ? raw : {};
    const key = keyOf(
      isRecord(record.elevenLabs) ? record.elevenLabs.key : undefined,
    );
    this.#settings = {
      // A Default Preset that did not load stays: its Phrases are dropped,
      // never spoken with something else.
      defaults: readDefaults(record.defaults),
      presets: readPresets(record.presets),
      ...(key !== undefined && { elevenLabsKey: key }),
    };
    this.#markLoaded();
  }

  /**
   * Takes the Plugin Editor's defaults. A Default Preset that is not among
   * the Presets — one deleted while the editor still offered it — leaves the
   * Default Preset as it was.
   */
  async setDefaults(raw: unknown): Promise<void> {
    const { preset, ...rest } = readDefaults(raw);
    const known = this.presets.find(({ id }) => id === preset?.id);
    const kept = known
      ? { id: known.id, name: known.name }
      : this.defaults.preset;
    await this.#change({ defaults: kept ? { ...rest, preset: kept } : rest });
  }

  /**
   * Saves a Preset from its dialog: a new one — without an id, or with one
   * no Preset has any more — is added at the end under an id of the
   * sidecar's; another replaces the Preset with its id, keeping its place.
   * The Default Preset keeps its name in step. A draft without a name or a
   * Voice is ignored, and so is one named as another Preset is: two of one
   * name could not be told apart.
   */
  async savePreset(raw: unknown): Promise<void> {
    const draft = readPresetDraft(raw);
    if (
      !draft ||
      this.presets.some(
        ({ id, name }) => id !== draft.id && name === draft.name,
      )
    ) {
      console.warn("Ignored a Preset the Plugin Editor could not have sent");
      return;
    }
    const existing = this.presets.findIndex(({ id }) => id === draft.id);
    const preset: Preset = {
      ...draft,
      id: existing === -1 ? this.#newId() : this.presets[existing].id,
    };
    const presets =
      existing === -1
        ? [...this.presets, preset]
        : this.presets.map((other, index) =>
            index === existing ? preset : other,
          );
    const { defaults } = this;
    await this.#change({
      defaults:
        defaults.preset?.id === preset.id
          ? { ...defaults, preset: { id: preset.id, name: preset.name } }
          : defaults,
      presets,
    });
  }

  /**
   * Deletes a Preset. Never the Default Preset: there would be no way back
   * to what the plugin spoke with before one was picked.
   */
  async deletePreset(id: unknown): Promise<void> {
    if (
      this.defaults.preset?.id === id ||
      !this.presets.some((preset) => preset.id === id)
    ) {
      return;
    }
    await this.#change({
      presets: this.presets.filter((preset) => preset.id !== id),
    });
  }

  /**
   * Stores the ElevenLabs API key in place of the one stored. A blank one is
   * ignored: the field left blank keeps the key it never shows.
   */
  async setElevenLabsKey(raw: unknown): Promise<void> {
    const key = keyOf(raw);
    if (key !== undefined && key !== this.elevenLabsKey) {
      await this.#change({ elevenLabsKey: key });
    }
  }

  async removeElevenLabsKey(): Promise<void> {
    if (this.elevenLabsKey !== undefined) {
      await this.#change({ elevenLabsKey: undefined });
    }
  }

  /**
   * Takes a change in memory at once — the next Speak uses it even while
   * it is being saved — then persists it. A failed save is logged, not
   * thrown: the change holds until the plugin restarts.
   */
  async #change(changes: Partial<Settings>): Promise<void> {
    const { defaults, presets, elevenLabsKey } = {
      ...this.#settings,
      ...changes,
    };
    this.#settings = {
      defaults,
      presets,
      ...(elevenLabsKey !== undefined && { elevenLabsKey }),
    };
    this.#onChange();
    try {
      await this.#writer.setPluginSettings({
        defaults,
        presets,
        ...(elevenLabsKey !== undefined && {
          elevenLabs: { key: elevenLabsKey },
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Could not save the plugin's settings: ${reason}`);
    }
  }
}

/** An API key as pasted, without the whitespace around it; never empty. */
function keyOf(value: unknown): string | undefined {
  const key = typeof value === "string" ? value.trim() : "";
  return key === "" ? undefined : key;
}
