import type { Source } from "@fluxta/sdk/api";

import type { SpeechQueue } from "../speech/speech-queue";

export const WAITING_SOURCE = "waiting";

/**
 * Pull Query Source: how many Phrases wait in the Speech Queue, the one being
 * spoken not counted. Pulled, so `Phrases Waiting < 10 → Speak` right after
 * another Speak already counts that Speak's Phrase — a pushed value might not
 * have arrived yet.
 */
export function createWaitingSource(queue: SpeechQueue): Source {
  return { key: WAITING_SOURCE, resolve: () => queue.waiting };
}
