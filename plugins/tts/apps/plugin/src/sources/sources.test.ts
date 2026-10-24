import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { INITIAL_DEFAULTS, type SpeakSettings } from "tts-protocol";
import { describe, expect, it } from "vitest";

import { SpeakAction } from "../actions/speak";
import { SpeechQueue } from "../speech/speech-queue";
import { createSpeakingSource } from "./speaking";
import { createWaitingSource } from "./waiting";

/** A queue whose Phrases never finish synthesizing: they stay where they are. */
function setup() {
  const queue = new SpeechQueue({
    player: { devices: async () => [], play: async () => {} },
    synthesisFor: async () => () => new Promise(() => {}),
    onDropped: () => {},
    onStarted: () => {},
    onFinished: () => {},
  });
  const speak = new SpeakAction(queue, {
    loaded: Promise.resolve(),
    defaults: INITIAL_DEFAULTS,
  });
  const trigger = (text: string) =>
    speak.onTrigger(
      new StandaloneTriggerContext<SpeakSettings>("action-1", { text }),
    );
  const ask = (source: ReturnType<typeof createSpeakingSource>) =>
    source.resolve({ itemId: 0, args: {} });
  return {
    trigger,
    speaking: () => ask(createSpeakingSource(queue)),
    waiting: () => ask(createWaitingSource(queue)),
  };
}

describe("Speaking and Phrases Waiting", () => {
  it("answer under the manifest's keys", () => {
    const queue = {} as SpeechQueue;

    expect(createSpeakingSource(queue).key).toBe("speaking");
    expect(createWaitingSource(queue).key).toBe("waiting");
  });

  it("read the Speech Queue as it is right after a Speak", async () => {
    const { trigger, speaking, waiting } = setup();
    expect([speaking(), waiting()]).toEqual([false, 0]);

    // Fluxta runs the next step once the Speak has settled.
    await trigger("first");
    expect([speaking(), waiting()]).toEqual([true, 0]);

    // The guard `Phrases Waiting < 10 → Speak` already counts this one.
    await trigger("second");
    expect(waiting()).toBe(1);
  });
});
