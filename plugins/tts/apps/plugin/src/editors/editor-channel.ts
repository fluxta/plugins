import {
  PROVIDER_LABELS,
  type EditorMessage,
  type PluginMessage,
  type PluginStatus,
  type ProviderName,
  type ProviderOption,
} from "tts-protocol";

import type { ElevenLabsAccount } from "../elevenlabs/account";
import type { Model } from "../elevenlabs/client";
import type { SettingsStore } from "../settings/settings-store";
import type { ProviderVoices } from "../settings/synthesis";
import type { Listing, Settled } from "../speech/listing";
import type { Device } from "../speech/player";
import type { Voice } from "../speech/provider";
import type { SpeechQueue } from "../speech/speech-queue";
import { listenPhrase, type ListenRequest } from "./listen";
import type { RecentProblems } from "./recent-problems";
import { voiceOptions } from "./voice-options";

interface EditorSender {
  sendToEditor(message: PluginMessage): void;
}

export type EditorChannelOptions = {
  sender: EditorSender;
  settings: SettingsStore;
  voices: ProviderVoices;
  devices: Listing<Device>;
  queue: Pick<SpeechQueue, "enqueue">;
  problems: Pick<RecentProblems, "list">;
  elevenLabs: Pick<ElevenLabsAccount, "status" | "keyChanged">;
  /** ElevenLabs' Models that speak text. */
  models: Listing<Model>;
};

/**
 * The sidecar's side of the editors: the Plugin Editor and every Action
 * Editor see one status — the defaults, the Presets, each Provider's voices,
 * the ElevenLabs account, the output devices and Recent problems — the
 * Plugin Editor changes the settings through it, and either one Listens.
 */
export class EditorChannel {
  readonly #sender: EditorSender;
  readonly #settings: SettingsStore;
  readonly #voices: ProviderVoices;
  readonly #devices: Listing<Device>;
  readonly #queue: Pick<SpeechQueue, "enqueue">;
  readonly #problems: Pick<RecentProblems, "list">;
  readonly #elevenLabs: Pick<ElevenLabsAccount, "status" | "keyChanged">;
  readonly #models: Listing<Model>;

  constructor({
    sender,
    settings,
    voices,
    devices,
    queue,
    problems,
    elevenLabs,
    models,
  }: EditorChannelOptions) {
    this.#sender = sender;
    this.#settings = settings;
    this.#voices = voices;
    this.#devices = devices;
    this.#queue = queue;
    this.#problems = problems;
    this.#elevenLabs = elevenLabs;
    this.#models = models;
  }

  async handle(message: EditorMessage): Promise<void> {
    await this.#settings.loaded;
    switch (message.event) {
      case "get-status":
        // An editor opening is when a newly installed voice or a device
        // plugged in since should appear.
        await this.publish({ afresh: true });
        return;
      // The store announces each change, and every editor hears it.
      case "set-defaults":
        await this.#settings.setDefaults(message.defaults);
        return;
      case "save-preset":
        await this.#settings.savePreset(message.preset);
        return;
      case "delete-preset":
        await this.#settings.deletePreset(message.id);
        return;
      case "set-elevenlabs-key":
        await this.#settings.setElevenLabsKey(message.key);
        await this.#checkElevenLabs();
        return;
      case "remove-elevenlabs-key":
        await this.#settings.removeElevenLabsKey();
        await this.#checkElevenLabs();
        return;
      case "listen":
        await this.#listen(message);
        return;
    }
  }

  /**
   * Tells the editor that asked for Listen `id` why it could not be heard:
   * a Preset, a Voice or a device that is not here, the Provider or the
   * Player out of order. A Listen that was heard, or stopped, is not answered.
   */
  listenFailed(id: string, error: unknown): void {
    this.#sender.sendToEditor({
      event: "listen-failed",
      id,
      problem: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * As Next: never over a viewer's Phrase, never cutting one off. The
   * Defaults are read now, so a Plugin Editor change saved a moment before —
   * a number field saves as the click on Listen leaves it — is heard.
   */
  async #listen({ id, text, settings }: ListenRequest): Promise<void> {
    try {
      const phrase = await listenPhrase(
        {
          id,
          text: typeof text === "string" ? text : "",
          settings: isRecord(settings) ? settings : {},
        },
        this.#settings.defaults,
        { presets: () => this.#settings.presets, voices: this.#voices },
      );
      this.#queue.enqueue(phrase, "next");
    } catch (error) {
      this.listenFailed(id, error);
    }
  }

  /**
   * The key was stored or removed: the account is checked afresh by looking
   * its voices up — or, without a key, is told it has none.
   */
  async #checkElevenLabs(): Promise<void> {
    this.#elevenLabs.keyChanged();
    await this.publish({ afresh: true });
  }

  /**
   * Tells every open editor how things stand. Afresh, it looks every list
   * up again — which checks the ElevenLabs account too.
   *
   * ElevenLabs may take up to its timeout to answer, and the editors must
   * not wait for it — the Plugin Editor would take a silent ElevenLabs for
   * a silent plugin. So its voices go out as they last settled, and the
   * status goes out again once its look-up does; a failed look-up is asked
   * for afresh only when an editor opens or the key changes.
   */
  async publish({ afresh = false } = {}): Promise<void> {
    const elevenlabs = this.#voices.elevenlabs;
    const models = this.#models;
    const look = <T>(listing: Listing<T>) =>
      settled(afresh ? listing.refresh() : listing.list());
    const looking = [elevenlabs, models]
      .filter((listing) => afresh || listing.settled === undefined)
      .map(look);
    const [system, devices] = await Promise.all([
      look(this.#voices.system),
      look(this.#devices),
    ]);
    this.#sender.sendToEditor({
      event: "status",
      status: {
        defaults: this.#settings.defaults,
        presets: [...this.#settings.presets],
        providers: [
          providerOption("system", system),
          {
            ...providerOption("elevenlabs", elevenlabs.settled),
            models: models.settled?.list ?? [],
          },
        ],
        elevenLabs: this.#elevenLabs.status,
        ...deviceStatus(devices),
        problems: this.#problems.list,
      },
    });
    if (looking.length > 0) {
      await Promise.all(looking);
      await this.publish();
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The list, or why there is none. */
async function settled<T>(list: Promise<T[]>): Promise<Settled<T>> {
  try {
    return { list: await list };
  } catch (error) {
    return {
      list: [],
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

/** A Provider with its voices — still being looked up while `undefined`. */
function providerOption(
  name: ProviderName,
  voices: Settled<Voice> | undefined,
): ProviderOption {
  return {
    name,
    label: PROVIDER_LABELS[name],
    voices: voiceOptions(voices?.list ?? []),
    ...(voices === undefined && { loading: true }),
    ...(voices?.problem !== undefined && { problem: voices.problem }),
  };
}

function deviceStatus(devices: {
  list: Device[];
  problem?: string;
}): Pick<PluginStatus, "devices" | "devicesProblem"> {
  return {
    devices: devices.list.map(({ id, name, isDefault }) => ({
      id,
      name,
      ...(isDefault && { isDefault }),
    })),
    ...(devices.problem !== undefined && { devicesProblem: devices.problem }),
  };
}
