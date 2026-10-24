import type { Source } from "@fluxta/sdk/api";

import type { SpeechQueue } from "../speech/speech-queue";

export const SPEAKING_SOURCE = "speaking";

/**
 * Pull Query Source: whether a Phrase is being handled — from the moment it
 * leaves the Speech Queue, its synthesis included, until it ends. Pulled, so
 * a condition reads the queue as it is when the condition runs.
 */
export function createSpeakingSource(queue: SpeechQueue): Source {
  return { key: SPEAKING_SOURCE, resolve: () => queue.speaking };
}
