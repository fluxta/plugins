import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  INITIAL_DEFAULTS,
  type SpeakSettings,
  type StopSpeechSettings,
} from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { SpeechQueue } from "../speech/speech-queue";
import { SpeakAction } from "./speak";
import { StopSpeechAction } from "./stop-speech";

function setup() {
  const queue = {
    stopCurrent: vi.fn(),
    stopEverything: vi.fn(),
    stopTagged: vi.fn(),
  };
  const stop = new StopSpeechAction(queue as unknown as SpeechQueue);
  const trigger = (settings: unknown) =>
    stop.onTrigger(
      new StandaloneTriggerContext<StopSpeechSettings>(
        "action-1",
        settings as StopSpeechSettings,
      ),
    );
  return { queue, trigger };
}

describe("Stop Speech", () => {
  it("skips the current Phrase by default, producing nothing", () => {
    const { queue, trigger } = setup();

    expect(trigger({})).toBeUndefined();
    trigger(null);
    trigger({ what: "current", tag: "user-1" });
    trigger({ what: "something else" });

    expect(queue.stopCurrent).toHaveBeenCalledTimes(4);
    expect(queue.stopEverything).not.toHaveBeenCalled();
    expect(queue.stopTagged).not.toHaveBeenCalled();
  });

  it("stops everything only when asked to", () => {
    const { queue, trigger } = setup();

    trigger({ what: "everything" });

    expect(queue.stopEverything).toHaveBeenCalledOnce();
    expect(queue.stopCurrent).not.toHaveBeenCalled();
  });

  it("stops a Tag as Speak attaches it: trimmed, a number as its string", () => {
    const { queue, trigger } = setup();

    trigger({ what: "tag", tag: " user-1 " });
    trigger({ what: "tag", tag: 123 });

    expect(queue.stopTagged.mock.calls).toEqual([["user-1"], ["123"]]);
  });

  it("stops nothing for a Tag that comes out empty", () => {
    const { queue, trigger } = setup();

    trigger({ what: "tag", tag: "" });
    trigger({ what: "tag", tag: "  " });
    trigger({ what: "tag" });
    trigger({ what: "tag", tag: { id: 1 } });

    expect(queue.stopTagged).not.toHaveBeenCalled();
    expect(queue.stopCurrent).not.toHaveBeenCalled();
    expect(queue.stopEverything).not.toHaveBeenCalled();
  });
});

describe("Speak and Stop Speech together", () => {
  it("stop a viewer's Phrases by the Tag a Speak attached", async () => {
    // A synthesis that never ends unless it is stopped: whatever is not
    // stopped stays where it is.
    const synthesized: string[] = [];
    const queue = new SpeechQueue({
      player: { devices: async () => [], play: async () => {} },
      synthesisFor: async () => (text, signal) => {
        synthesized.push(text);
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason)),
        );
      },
      onDropped: () => {},
      onStarted: () => {},
      onFinished: () => {},
    });
    const speak = new SpeakAction(queue, {
      loaded: Promise.resolve(),
      defaults: INITIAL_DEFAULTS,
    });
    const stop = new StopSpeechAction(queue);
    const say = (text: string, tags: unknown[]) =>
      speak.onTrigger(
        new StandaloneTriggerContext<SpeakSettings>("speak", {
          text,
          tags: tags as string[],
        }),
      );
    await say("first", [42]);
    await say("second", [42, "msg-2"]);
    await say("someone else", [7]);
    await say("third", ["42 "]);
    await settle();

    // A User Banned whose `userId` arrived as a string.
    stop.onTrigger(
      new StandaloneTriggerContext<StopSpeechSettings>("stop", {
        what: "tag",
        tag: "42",
      }),
    );

    await settle();

    expect(synthesized).toEqual(["first", "someone else"]);
    expect(queue.waiting).toBe(0);
  });
});

/** Lets the queue's awaited steps run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
