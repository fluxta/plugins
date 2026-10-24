import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { Defaults, SpeakSettings } from "tts-protocol";

import { effectiveSettings } from "../settings/defaults";
import type { Position, SpeechQueue } from "../speech/speech-queue";
import { truncate } from "../speech/truncate";
import { tagsOf, textOf } from "./values";

/** The defaults in Plugin Settings, as Speak reads them. */
export interface DefaultsSource {
  /** Settles once the saved defaults have been read. */
  readonly loaded: Promise<void>;
  readonly current: Defaults;
}

/**
 * Speak: puts its Phrase into the Speech Queue where its Position says, and
 * returns at once. It never waits for the Phrase to be spoken — the run that
 * triggered it moves on.
 */
export class SpeakAction extends StandaloneAction<SpeakSettings> {
  readonly type = "speak";
  readonly #queue: SpeechQueue;
  readonly #defaults: DefaultsSource;

  constructor(queue: SpeechQueue, defaults: DefaultsSource) {
    super();
    this.#queue = queue;
    this.#defaults = defaults;
  }

  async onTrigger({
    settings,
  }: StandaloneTriggerContext<SpeakSettings>): Promise<void> {
    await this.#defaults.loaded;
    // Read now, not when the Phrase's turn comes: the Phrase is spoken as
    // the defaults stood when the Speak ran.
    const { voice, rate, volume, device, lengthLimit } = effectiveSettings(
      this.#defaults.current,
      settings,
    );
    this.#queue.enqueue(
      {
        text: truncate(textOf(settings?.text), lengthLimit),
        tags: tagsOf(settings?.tags),
        ...(voice !== undefined && { voice }),
        rate,
        volume: volume / 100,
        device,
      },
      positionOf(settings?.position),
    );
  }
}

/** In turn unless the Speak asks for more: urgency is never assumed. */
function positionOf(value: unknown): Position {
  return value === "next" || value === "now" ? value : "in-turn";
}
