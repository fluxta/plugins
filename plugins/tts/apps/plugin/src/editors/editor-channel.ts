import type { EditorMessage, PluginMessage, PluginStatus } from "tts-protocol";

import type { DefaultsStore } from "../settings/defaults-store";
import type { Listing } from "../speech/listing";
import type { Device } from "../speech/player";
import type { Voice } from "../speech/provider";
import type { SpeechQueue } from "../speech/speech-queue";
import { osDefaultOf, type Voices } from "../speech/voices";
import { listenPhrase, type ListenRequest } from "./listen";
import type { RecentProblems } from "./recent-problems";
import { voiceName, voiceOptions } from "./voice-options";

interface EditorSender {
  sendToEditor(message: PluginMessage): void;
}

export type EditorChannelOptions = {
  sender: EditorSender;
  defaults: DefaultsStore;
  voices: Voices;
  devices: Listing<Device>;
  queue: Pick<SpeechQueue, "enqueue">;
  problems: Pick<RecentProblems, "list">;
};

/**
 * The sidecar's side of the editors: the Plugin Editor and every Action
 * Editor see one status — the defaults, the voices, the output devices and
 * Recent problems — the Plugin Editor changes the defaults through it, and
 * either one Listens.
 */
export class EditorChannel {
  readonly #sender: EditorSender;
  readonly #defaults: DefaultsStore;
  readonly #voices: Voices;
  readonly #devices: Listing<Device>;
  readonly #queue: Pick<SpeechQueue, "enqueue">;
  readonly #problems: Pick<RecentProblems, "list">;

  constructor({
    sender,
    defaults,
    voices,
    devices,
    queue,
    problems,
  }: EditorChannelOptions) {
    this.#sender = sender;
    this.#defaults = defaults;
    this.#voices = voices;
    this.#devices = devices;
    this.#queue = queue;
    this.#problems = problems;
  }

  async handle(message: EditorMessage): Promise<void> {
    await this.#defaults.loaded;
    switch (message.event) {
      case "get-status":
        // An editor opening is when a newly installed voice or a device
        // plugged in since should appear.
        await this.publish({ afresh: true });
        return;
      case "set-defaults":
        // The store announces the change, and every editor hears it.
        await this.#defaults.set(message.defaults);
        return;
      case "listen":
        await this.#listen(message);
        return;
    }
  }

  /**
   * Tells the editor that asked for Listen `id` why it could not be heard:
   * a Voice or a device that is not here, the Provider or the Player out of
   * order. A Listen that was heard, or stopped, is not answered.
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
        this.#defaults.current,
        this.#voices,
      );
      this.#queue.enqueue(phrase, "next");
    } catch (error) {
      this.listenFailed(id, error);
    }
  }

  /** Tells every open editor how things stand. */
  async publish({ afresh = false } = {}): Promise<void> {
    const voices = afresh ? this.#voices.refresh() : this.#voices.list();
    const devices = afresh ? this.#devices.refresh() : this.#devices.list();
    this.#sender.sendToEditor({
      event: "status",
      status: {
        ...status(
          this.#defaults.current,
          await settled(voices),
          await settled(devices),
        ),
        problems: this.#problems.list,
      },
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The list, or why there is none. */
async function settled<T>(
  list: Promise<T[]>,
): Promise<{ list: T[]; problem?: string }> {
  try {
    return { list: await list };
  } catch (error) {
    return {
      list: [],
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

function status(
  defaults: PluginStatus["defaults"],
  voices: { list: Voice[]; problem?: string },
  devices: { list: Device[]; problem?: string },
): Omit<PluginStatus, "problems"> {
  const id = defaults.voice ?? osDefaultOf(voices.list)?.id;
  const voice = voices.list.find((candidate) => candidate.id === id);
  return {
    defaults,
    ...(id !== undefined && {
      defaultVoice: { id, ...(voice && { name: voiceName(voice) }) },
    }),
    voices: voiceOptions(voices.list),
    ...(voices.problem !== undefined && { voicesProblem: voices.problem }),
    devices: devices.list.map(({ id, name, isDefault }) => ({
      id,
      name,
      ...(isDefault && { isDefault }),
    })),
    ...(devices.problem !== undefined && { devicesProblem: devices.problem }),
  };
}
