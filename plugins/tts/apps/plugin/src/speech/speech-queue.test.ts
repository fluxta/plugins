import { describe, expect, it, vi } from "vitest";

import { PlayerError, type Player } from "./player";
import { ProviderError, type Audio } from "./provider";
import {
  describeDrop,
  dropOf,
  SpeechQueue,
  type Phrase,
  type Synthesis,
} from "./speech-queue";

/** A step the test finishes by hand: a synthesis or a play under way. */
type Step = {
  text: string;
  signal: AbortSignal;
  /** A play's sound starts — what the Player reports through `onStarted`. */
  start: () => void;
  finish: () => void;
  fail: (error: unknown) => void;
};

function deferredStep(
  text: string,
  signal: AbortSignal,
  steps: Step[],
  { onStarted = () => {}, settleOnAbort = true } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    steps.push({
      text,
      signal,
      start: onStarted,
      finish: resolve,
      fail: reject,
    });
    // As the real Provider and Player do: an abort rejects with its reason.
    if (settleOnAbort) {
      signal.addEventListener("abort", () => reject(signal.reason));
    }
  });
}

function phrase(text: string, ...tags: string[]): Phrase {
  return { text, tags, volume: 1, device: "system-default" };
}

/**
 * A queue over a synthesis and a Player the test drives by hand. With
 * `settleOnAbort: false` a play goes on after an abort until the test fails
 * it — a Player slow to stop.
 */
function setup({ settleOnAbort = true } = {}) {
  const syntheses: Step[] = [];
  const plays: Step[] = [];
  const synthesize: Synthesis = async (text, signal) => {
    await deferredStep(text, signal, syntheses);
    return new TextEncoder().encode(text);
  };
  const player: Player = {
    devices: async () => [],
    play: (audio: Audio, { onStarted }, signal) =>
      deferredStep(new TextDecoder().decode(audio), signal, plays, {
        onStarted,
        settleOnAbort,
      }),
  };
  const dropped: { phrase: Phrase; error: unknown }[] = [];
  /** Phrase Started and Phrase Finished, in the order they were announced. */
  const events: string[] = [];
  const synthesisFor = vi.fn(async () => synthesize);
  const queue = new SpeechQueue({
    player,
    synthesisFor,
    onDropped: (phrase, error) => dropped.push({ phrase, error }),
    onStarted: (phrase) => events.push(`started ${phrase.text}`),
    onFinished: (phrase) => events.push(`finished ${phrase.text}`),
  });
  return { queue, syntheses, plays, dropped, events, synthesisFor };
}

/** Synthesizes the current Phrase and plays it to its end. */
async function speakCurrent(
  syntheses: Step[],
  plays: Step[],
  index: number,
): Promise<void> {
  syntheses[index].finish();
  await settle();
  plays[index].start();
  plays[index].finish();
  await settle();
}

/** Lets the queue's awaited steps run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SpeechQueue", () => {
  it("speaks Phrases one at a time, in the order they arrived", async () => {
    const { queue, syntheses, plays } = setup();

    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    queue.enqueue(phrase("three"));
    await settle();

    expect(syntheses.map(({ text }) => text)).toEqual(["one"]);
    expect(queue.speaking).toBe(true);
    expect(queue.waiting).toBe(2);

    syntheses[0].finish();
    await settle();
    expect(plays.map(({ text }) => text)).toEqual(["one"]);
    // The next Phrase waits until the current one has been heard to the end.
    expect(syntheses).toHaveLength(1);

    plays[0].finish();
    await settle();
    expect(syntheses.map(({ text }) => text)).toEqual(["one", "two"]);
    expect(queue.waiting).toBe(1);

    syntheses[1].finish();
    await settle();
    plays[1].finish();
    await settle();
    syntheses[2].finish();
    await settle();
    plays[2].finish();
    await settle();

    expect(plays.map(({ text }) => text)).toEqual(["one", "two", "three"]);
    expect(queue.speaking).toBe(false);
    expect(queue.waiting).toBe(0);
  });

  it("returns from enqueue before the Phrase is spoken", () => {
    const { queue } = setup();

    queue.enqueue(phrase("hello"));

    expect(queue.speaking).toBe(true);
  });

  it("drops a Phrase whose synthesis fails and moves on", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue(phrase("unknown voice"));
    queue.enqueue(phrase("next"));
    await settle();

    const error = new ProviderError("voice-missing", "No voice Milena");
    syntheses[0].fail(error);
    await settle();

    expect(dropped).toEqual([{ phrase: phrase("unknown voice"), error }]);
    expect(plays).toHaveLength(0);
    expect(syntheses.map(({ text }) => text)).toEqual([
      "unknown voice",
      "next",
    ]);
  });

  it("drops a Phrase whose playback fails and moves on", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue(phrase("lost"));
    queue.enqueue(phrase("next"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].fail(
      new PlayerError("device-missing", "BlackHole 2ch is not connected"),
    );
    await settle();

    expect(dropped.map(({ phrase }) => phrase.text)).toEqual(["lost"]);
    expect(syntheses.map(({ text }) => text)).toEqual(["lost", "next"]);
  });

  it("drops a Phrase without a Voice or a Preset, and anything unexpected, and moves on", async () => {
    const { queue, syntheses, dropped, synthesisFor } = setup();
    synthesisFor.mockRejectedValueOnce(
      new ProviderError(
        "voice-missing",
        "No Preset Announcer on this computer",
      ),
    );
    synthesisFor.mockRejectedValueOnce(new TypeError("a bug"));

    queue.enqueue(phrase("first"));
    queue.enqueue(phrase("second"));
    queue.enqueue(phrase("third"));
    await settle();

    expect(dropped.map(({ phrase }) => phrase.text)).toEqual([
      "first",
      "second",
    ]);
    expect(syntheses.map(({ text }) => text)).toEqual(["third"]);
  });

  it("speaks with the synthesis its Preset gives, at the Phrase's volume, on its device", async () => {
    const synthesize = vi.fn<Synthesis>(async () => new Uint8Array());
    const synthesisFor = vi.fn(async () => synthesize);
    const play = vi.fn(async () => {});
    const queue = new SpeechQueue({
      player: { devices: async () => [], play },
      synthesisFor,
      onDropped: () => {},
      onStarted: () => {},
      onFinished: () => {},
    });

    const headphones = { id: "headphones-uid", name: "AirPods" };
    const phrase: Phrase = {
      text: "Привет",
      tags: [],
      preset: { id: "preset-1", name: "Chat" },
      volume: 0.4,
      device: headphones,
    };
    queue.enqueue(phrase);
    await settle();

    expect(synthesisFor).toHaveBeenCalledWith(phrase);
    expect(synthesize).toHaveBeenCalledWith("Привет", expect.any(AbortSignal));
    expect(play).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { volume: 0.4, device: headphones, onStarted: expect.any(Function) },
      expect.any(AbortSignal),
    );
  });
});

describe("Phrase Started and Phrase Finished", () => {
  it("announce a Phrase when its sound starts and when it ends, one Phrase after another", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    await settle();

    syntheses[0].finish();
    await settle();
    // Synthesis is not sound: nothing is announced until the Player starts.
    expect(events).toEqual([]);

    plays[0].start();
    expect(events).toEqual(["started one"]);
    plays[0].finish();
    await settle();
    expect(events).toEqual(["started one", "finished one"]);

    await speakCurrent(syntheses, plays, 1);
    expect(events).toEqual([
      "started one",
      "finished one",
      "started two",
      "finished two",
    ]);
  });

  it("finish a Phrase cut off by the Player failing mid-phrase, once", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("cut"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].start();
    plays[0].fail(new PlayerError("transient", "The output device changed"));
    await settle();

    expect(events).toEqual(["started cut", "finished cut"]);
    expect(dropped.map(({ phrase }) => phrase.text)).toEqual(["cut"]);
    // A Phrase cut off mid-sound is not heard twice.
    expect(syntheses).toHaveLength(1);
  });

  it("stay silent for a Phrase that never started", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("no voice"));
    queue.enqueue(phrase("no device"));
    await settle();

    syntheses[0].fail(new ProviderError("voice-missing", "No voice Milena"));
    await settle();
    syntheses[1].finish();
    await settle();
    plays[0].fail(new PlayerError("unavailable", "No output device"));
    await settle();

    expect(dropped).toHaveLength(2);
    expect(events).toEqual([]);
  });

  it("start a Phrase once, whatever the Player reports", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("once"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].start();
    plays[0].start();
    plays[0].finish();
    await settle();
    plays[0].start();

    expect(events).toEqual(["started once", "finished once"]);
  });

  it("never start a Phrase whose play has settled, so no Phrase Started is left without its Finished", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("dropped"));
    queue.enqueue(phrase("retried"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].fail(new PlayerError("unavailable", "No output device"));
    await settle();
    plays[0].start();

    syntheses[1].finish();
    await settle();
    plays[1].fail(new PlayerError("transient", "The output device changed"));
    await settle();
    // The first try reports its sound late, while the second is synthesized.
    plays[1].start();
    expect(events).toEqual([]);

    await speakCurrent(syntheses, plays, 2);
    expect(events).toEqual(["started retried", "finished retried"]);
  });

  it("keep the queue going when a listener throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const syntheses: Step[] = [];
    const queue = new SpeechQueue({
      player: {
        devices: async () => [],
        play: async (_audio, { onStarted }) => onStarted?.(),
      },
      synthesisFor: async () => async (text, signal) => {
        await deferredStep(text, signal, syntheses);
        return new Uint8Array();
      },
      onDropped: () => {},
      onStarted: () => {
        throw new Error("the host went away");
      },
      onFinished: () => {
        throw new Error("the host went away");
      },
    });

    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    await settle();
    syntheses[0].finish();
    await settle();

    expect(syntheses.map(({ text }) => text)).toEqual(["one", "two"]);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

/** What a list of steps said, in order. */
const texts = (steps: Step[]) => steps.map(({ text }) => text);

describe("Position", () => {
  it("speaks Next Phrases after the current one, in their own order, before any In turn Phrase", async () => {
    const { queue, syntheses, plays } = setup();
    queue.enqueue(phrase("chat 1"));
    queue.enqueue(phrase("chat 2"));
    queue.enqueue(phrase("redemption 1"), "next");
    queue.enqueue(phrase("chat 3"));
    queue.enqueue(phrase("redemption 2"), "next");
    await settle();
    expect(queue.waiting).toBe(4);

    for (let index = 0; index < 5; index++) {
      await speakCurrent(syntheses, plays, index);
    }

    expect(texts(plays)).toEqual([
      "chat 1",
      "redemption 1",
      "redemption 2",
      "chat 2",
      "chat 3",
    ]);
    // Next never cuts anything off.
    expect(plays.some(({ signal }) => signal.aborted)).toBe(false);
  });

  it("cuts off the current Phrase for a Now, which is spoken at once, and goes on after it", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("chat 1"));
    queue.enqueue(phrase("chat 2"));
    queue.enqueue(phrase("redemption"), "next");
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(phrase("BRB"), "now");
    // Taken at once: nothing waits in between, and nothing else starts.
    expect([queue.speaking, queue.waiting]).toEqual([true, 2]);
    expect(plays[0].signal.aborted).toBe(true);
    await settle();
    expect(texts(syntheses)).toEqual(["chat 1", "BRB"]);

    await speakCurrent(syntheses, plays, 1);
    await speakCurrent(syntheses, plays, 2);
    await speakCurrent(syntheses, plays, 3);

    // The cut-off Phrase is neither repeated nor dropped.
    expect(texts(syntheses)).toEqual(["chat 1", "BRB", "redemption", "chat 2"]);
    expect(dropped).toEqual([]);
    expect(events).toEqual([
      "started chat 1",
      "finished chat 1",
      "started BRB",
      "finished BRB",
      "started redemption",
      "finished redemption",
      "started chat 2",
      "finished chat 2",
    ]);
  });

  it("speaks a Now at once when nothing is being spoken", async () => {
    const { queue, syntheses } = setup();

    queue.enqueue(phrase("BRB"), "now");
    await settle();

    expect(texts(syntheses)).toEqual(["BRB"]);
  });

  it("speaks a Now only once the Phrase it cut off has ended", async () => {
    const { queue, syntheses, plays, events } = setup({
      settleOnAbort: false,
    });
    queue.enqueue(phrase("chat"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(phrase("BRB"), "now");
    await settle();
    // The Player is still stopping "chat": "BRB" waits, so its Phrase
    // Started cannot come before the other's Phrase Finished.
    expect(texts(syntheses)).toEqual(["chat"]);
    expect(queue.speaking).toBe(true);

    plays[0].fail(plays[0].signal.reason);
    await settle();
    expect(texts(syntheses)).toEqual(["chat", "BRB"]);
    await speakCurrent(syntheses, plays, 1);

    expect(events).toEqual([
      "started chat",
      "finished chat",
      "started BRB",
      "finished BRB",
    ]);
  });

  it("lets a Now cut off another Now", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("chat"));
    queue.enqueue(phrase("after"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(phrase("first now"), "now");
    queue.enqueue(phrase("second now"), "now");
    await settle();
    // The first one was cut off before it was ever synthesized.
    expect(texts(syntheses)).toEqual(["chat", "second now"]);

    syntheses[1].finish();
    await settle();
    plays[1].start();
    queue.enqueue(phrase("third now"), "now");
    await settle();
    expect(plays[1].signal.aborted).toBe(true);

    await speakCurrent(syntheses, plays, 2);
    await speakCurrent(syntheses, plays, 3);

    expect(texts(syntheses)).toEqual([
      "chat",
      "second now",
      "third now",
      "after",
    ]);
    expect(events).toEqual([
      "started chat",
      "finished chat",
      "started second now",
      "finished second now",
      "started third now",
      "finished third now",
      "started after",
      "finished after",
    ]);
  });
});

describe("Stopping", () => {
  it("cuts off the current Phrase and goes on with the next one", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("long"));
    queue.enqueue(phrase("next"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopCurrent();
    await settle();

    expect(plays[0].signal.aborted).toBe(true);
    expect(texts(syntheses)).toEqual(["long", "next"]);
    expect(events).toEqual(["started long", "finished long"]);
    // Someone asked for it: a stopped Phrase is not a dropped one.
    expect(dropped).toEqual([]);
  });

  it("aborts the synthesis of a Phrase stopped before its sound, which fires nothing", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("slow to synthesize"));
    queue.enqueue(phrase("next"));
    await settle();

    queue.stopCurrent();
    await settle();

    expect(syntheses[0].signal.aborted).toBe(true);
    expect(plays).toHaveLength(0);
    expect(texts(syntheses)).toEqual(["slow to synthesize", "next"]);
    expect([events, dropped]).toEqual([[], []]);
  });

  it("never synthesizes a Phrase stopped while its Preset is looked up", async () => {
    const { queue, syntheses, synthesisFor } = setup();
    let presetFound = () => {};
    synthesisFor.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          presetFound = () => resolve(async () => new Uint8Array());
        }),
    );
    queue.enqueue(phrase("stopped"));
    await settle();

    queue.stopCurrent();
    presetFound();
    await settle();

    expect(syntheses).toHaveLength(0);
    expect(queue.speaking).toBe(false);
  });

  it("empties the queue, Next included, and cuts off the current Phrase", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("current"));
    queue.enqueue(phrase("chat"));
    queue.enqueue(phrase("redemption"), "next");
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopEverything();
    expect(queue.waiting).toBe(0);
    await settle();

    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
    expect(texts(syntheses)).toEqual(["current"]);
    // Waiting Phrases never started, so they fire nothing.
    expect(events).toEqual(["started current", "finished current"]);
  });

  it("takes a Tag's waiting Phrases out of the queue and cuts off the current one if it carries the Tag", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("banned 1", "user-1", "message-1"));
    queue.enqueue(phrase("other", "user-2", "message-2"));
    queue.enqueue(phrase("banned 2", "user-1", "message-3"), "next");
    queue.enqueue(phrase("untagged"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopTagged("user-1");
    expect(queue.waiting).toBe(2);
    await settle();
    await speakCurrent(syntheses, plays, 1);
    await speakCurrent(syntheses, plays, 2);

    expect(texts(syntheses)).toEqual(["banned 1", "other", "untagged"]);
    expect(events).toEqual([
      "started banned 1",
      "finished banned 1",
      "started other",
      "finished other",
      "started untagged",
      "finished untagged",
    ]);
  });

  it("leaves the current Phrase alone when it does not carry the Tag", async () => {
    const { queue, syntheses, plays } = setup();
    queue.enqueue(phrase("other", "user-2"));
    queue.enqueue(phrase("deleted", "message-1"));
    await settle();
    syntheses[0].finish();
    await settle();

    queue.stopTagged("message-1");

    expect(plays[0].signal.aborted).toBe(false);
    expect(queue.waiting).toBe(0);
  });

  it("matches a Tag exactly, case included", () => {
    const { queue } = setup();
    queue.enqueue(phrase("current"));
    queue.enqueue(phrase("upper", "User-1"));
    queue.enqueue(phrase("longer", "user-10"));

    queue.stopTagged("user-1");
    queue.stopTagged("");

    expect(queue.waiting).toBe(2);
  });

  it("stops a Now that is still waiting for the Phrase it cut off", async () => {
    const { queue, syntheses, plays, events } = setup({
      settleOnAbort: false,
    });
    queue.enqueue(phrase("chat"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();
    queue.enqueue(phrase("BRB", "deck"), "now");

    queue.stopTagged("deck");
    plays[0].fail(plays[0].signal.reason);
    await settle();

    expect(texts(syntheses)).toEqual(["chat"]);
    expect(queue.speaking).toBe(false);
    expect(events).toEqual(["started chat", "finished chat"]);
  });

  it("finishes a Phrase once, however many times it is stopped", async () => {
    const { queue, syntheses, plays, events } = setup({
      settleOnAbort: false,
    });
    queue.enqueue(phrase("stopped", "user-1"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopCurrent();
    queue.stopTagged("user-1");
    queue.enqueue(phrase("BRB"), "now");
    queue.stopEverything();
    plays[0].fail(plays[0].signal.reason);
    await settle();

    expect(events).toEqual(["started stopped", "finished stopped"]);
    expect(queue.speaking).toBe(false);
  });

  it("does nothing when nothing is being spoken", () => {
    const { queue } = setup();

    queue.stopCurrent();
    queue.stopTagged("user-1");
    queue.stopEverything();

    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
  });
});

describe("speaking and waiting", () => {
  it("count a Phrase as speaking from synthesis to its end, and the rest as waiting", async () => {
    const { queue, syntheses, plays } = setup();
    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);

    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    // Both read the queue as it is right after the Speaks.
    expect([queue.speaking, queue.waiting]).toEqual([true, 1]);

    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();
    expect([queue.speaking, queue.waiting]).toEqual([true, 1]);

    plays[0].finish();
    await settle();
    // The next Phrase is taken at once: no moment in between reads idle.
    expect([queue.speaking, queue.waiting]).toEqual([true, 0]);

    await speakCurrent(syntheses, plays, 1);
    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
  });
});

describe("A Listen", () => {
  const listen = (text: string): Phrase => ({ ...phrase(text), listen: "l-1" });

  it("waits for the Phrase being spoken, then goes ahead of the waiting chat", async () => {
    const { queue, syntheses, plays } = setup();
    queue.enqueue(phrase("chat 1"));
    queue.enqueue(phrase("chat 2"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(listen("Milena"), "next");
    plays[0].finish();
    await settle();
    await speakCurrent(syntheses, plays, 1);
    await speakCurrent(syntheses, plays, 2);

    expect(texts(plays)).toEqual(["chat 1", "Milena", "chat 2"]);
    expect(plays[0].signal.aborted).toBe(false);
  });

  it("is spoken at once when nothing else is", async () => {
    const { queue, syntheses } = setup();

    queue.enqueue(listen("Milena"), "next");
    await settle();

    expect(syntheses.map(({ text }) => text)).toEqual(["Milena"]);
  });

  it("is not seen by scenarios: no Events, not speaking, not waiting", async () => {
    const { queue, syntheses, plays, events } = setup();

    queue.enqueue(listen("Milena"), "next");
    queue.enqueue(listen("Ava"), "next");
    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
    queue.enqueue(phrase("chat"));
    expect([queue.speaking, queue.waiting]).toEqual([false, 1]);

    await settle();
    await speakCurrent(syntheses, plays, 0);
    await speakCurrent(syntheses, plays, 1);
    expect([queue.speaking, queue.waiting]).toEqual([true, 0]);
    await speakCurrent(syntheses, plays, 2);

    expect(events).toEqual(["started chat", "finished chat"]);
  });

  it("is dropped as any Phrase is, for its editor to hear why", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue(listen("Milena"), "next");
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].fail(
      new PlayerError("device-missing", "BlackHole 2ch is not connected"),
    );
    await settle();

    expect(dropped).toEqual([
      {
        phrase: listen("Milena"),
        error: new PlayerError(
          "device-missing",
          "BlackHole 2ch is not connected",
        ),
      },
    ]);
  });

  it("is stopped by Stop Speech like any Phrase", async () => {
    const { queue, syntheses, plays } = setup();
    queue.enqueue(listen("Milena"), "next");
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopCurrent();

    expect(plays[0].signal.aborted).toBe(true);
  });
});

describe("A failure", () => {
  const passing = () => new ProviderError("transient", "The engine crashed");

  it("that may pass is tried once more before the sound starts, and a second one drops the Phrase", async () => {
    const { queue, syntheses, dropped, events } = setup();
    queue.enqueue(phrase("hello"));
    queue.enqueue(phrase("next"));
    await settle();

    syntheses[0].fail(passing());
    await settle();
    expect(syntheses.map(({ text }) => text)).toEqual(["hello", "hello"]);
    expect(dropped).toEqual([]);

    const second = new ProviderError("transient", "It crashed again");
    syntheses[1].fail(second);
    await settle();

    expect(dropped).toEqual([{ phrase: phrase("hello"), error: second }]);
    expect(syntheses.map(({ text }) => text)).toEqual([
      "hello",
      "hello",
      "next",
    ]);
    expect(events).toEqual([]);
  });

  it("that passed leaves the Phrase spoken as if nothing happened", async () => {
    const { queue, syntheses, plays, dropped, events, synthesisFor } = setup();
    synthesisFor.mockRejectedValueOnce(passing());
    queue.enqueue(phrase("hello"));
    await settle();

    await speakCurrent(syntheses, plays, 0);

    expect(synthesisFor).toHaveBeenCalledTimes(2);
    expect(dropped).toEqual([]);
    expect(events).toEqual(["started hello", "finished hello"]);
  });

  it("is tried again after the pause its Provider asks for, not before", async () => {
    const { queue, syntheses, dropped } = setup();
    queue.enqueue(phrase("hello"));
    await settle();

    syntheses[0].fail(
      new ProviderError("transient", "Too many requests", { retryAfter: 40 }),
    );
    await settle();
    // Still current while it waits.
    expect(syntheses).toHaveLength(1);
    expect(queue.speaking).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(syntheses.map(({ text }) => text)).toEqual(["hello", "hello"]);
    expect(dropped).toEqual([]);
  });

  it("stopped while it waits for its retry, ends with neither Phrase Started nor Phrase Finished, and the queue moves on", async () => {
    const { queue, syntheses, dropped, events } = setup();
    queue.enqueue(phrase("hello"));
    queue.enqueue(phrase("next"));
    await settle();

    syntheses[0].fail(
      new ProviderError("transient", "Too many requests", {
        retryAfter: 60_000,
      }),
    );
    await settle();
    queue.stopCurrent();
    await settle();

    expect(syntheses.map(({ text }) => text)).toEqual(["hello", "next"]);
    expect([events, dropped]).toEqual([[], []]);
  });

  it("of a play before its sound starts tries the whole Phrase again", async () => {
    const { queue, syntheses, plays, dropped, events } = setup();
    queue.enqueue(phrase("hello"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].fail(
      new PlayerError(
        "transient",
        "The system default output switched to another device while speaking",
      ),
    );
    await settle();
    await speakCurrent(syntheses, plays, 1);

    expect(plays.map(({ text }) => text)).toEqual(["hello", "hello"]);
    expect(dropped).toEqual([]);
    expect(events).toEqual(["started hello", "finished hello"]);
  });

  it.each([
    new ProviderError("voice-missing", "No voice Milena on this Mac"),
    new ProviderError("rejected", "The voice said nothing"),
    new ProviderError("unavailable", "Speech is off"),
    new PlayerError("device-missing", "BlackHole 2ch is not connected"),
    new PlayerError("unavailable", "BlackHole 2ch cannot be opened"),
    new TypeError("a bug"),
  ])("that will not pass drops the Phrase at once: %s", async (error) => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue(phrase("hello"));
    await settle();

    if (error instanceof PlayerError) {
      syntheses[0].finish();
      await settle();
      plays[0].fail(error);
    } else {
      syntheses[0].fail(error);
    }
    await settle();

    expect(dropped).toEqual([{ phrase: phrase("hello"), error }]);
    expect(syntheses).toHaveLength(1);
  });

  it("leaves a Phrase being tried again within Stop Speech's reach", async () => {
    const { queue, syntheses, dropped } = setup();
    queue.enqueue(phrase("hello"));
    await settle();
    syntheses[0].fail(passing());
    await settle();

    queue.stopCurrent();
    await settle();

    expect(syntheses[1].signal.aborted).toBe(true);
    expect(syntheses).toHaveLength(2);
    expect(dropped).toEqual([]);
  });

  it("that makes the Provider unavailable is not remembered: once it recovers, Phrases are spoken again", async () => {
    const { queue, syntheses, plays, dropped, events } = setup();
    queue.enqueue(phrase("while it is off"));
    queue.enqueue(phrase("once it is back"));
    await settle();

    syntheses[0].fail(new ProviderError("unavailable", "Speech is off"));
    await settle();
    syntheses[1].finish();
    await settle();
    plays[0].start();
    plays[0].finish();
    await settle();

    expect(dropped.map(({ phrase }) => phrase.text)).toEqual([
      "while it is off",
    ]);
    expect(events).toEqual([
      "started once it is back",
      "finished once it is back",
    ]);
  });
});

describe("A dropped Phrase as it is told", () => {
  it("names the kind, the reason and the beginning of the text", () => {
    const drop = dropOf(
      phrase("Hello chat"),
      new ProviderError("voice-missing", "No voice Milena on this Mac"),
    );

    expect(drop).toEqual({
      kind: "voice-missing",
      reason: "No voice Milena on this Mac",
      text: "Hello chat",
    });
    expect(describeDrop(drop)).toBe(
      'Phrase dropped: voice-missing — No voice Milena on this Mac: "Hello chat"',
    );
  });

  it("cuts a long text between graphemes", () => {
    const text = `${"a".repeat(39)}👍🏽 and the rest`;

    expect(
      dropOf(phrase(text), new PlayerError("transient", "Lost")).text,
    ).toBe(`${"a".repeat(39)}👍🏽…`);
  });

  it("calls an unexpected failure unavailable", () => {
    expect(dropOf(phrase("x"), new Error("boom"))).toEqual({
      kind: "unavailable",
      reason: "boom",
      text: "x",
    });
    expect(dropOf(phrase("x"), "boom").reason).toBe("boom");
  });
});
