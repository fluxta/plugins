import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { StopSpeechSettings } from "tts-protocol";

import type { SpeechQueue } from "../speech/speech-queue";
import { tagOf } from "./values";

/**
 * Stop Speech: ends Phrases early — the current one, every one, or every one
 * carrying a Tag. A stopped Phrase is not a dropped one: nothing is logged,
 * and one that had started fires its Phrase Finished.
 */
export class StopSpeechAction extends StandaloneAction<StopSpeechSettings> {
  readonly type = "stop-speech";
  readonly #queue: SpeechQueue;

  constructor(queue: SpeechQueue) {
    super();
    this.#queue = queue;
  }

  onTrigger({ settings }: StandaloneTriggerContext<StopSpeechSettings>): void {
    switch (settings?.what) {
      case "everything":
        this.#queue.stopEverything();
        return;
      case "tag": {
        // An absent reference resolves to "", and a User Banned without a
        // user id must not wipe the queue: an empty Tag stops nothing.
        const tag = tagOf(settings.tag);
        if (tag !== "") {
          this.#queue.stopTagged(tag);
        }
        return;
      }
      default:
        this.#queue.stopCurrent();
    }
  }
}
