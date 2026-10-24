import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  INITIAL_DEFAULTS,
  type Defaults,
  type SpeakSettings,
} from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import type { SpeechQueue } from "../speech/speech-queue";
import { SpeakAction, type DefaultsSource } from "./speak";

function setup(defaults: Defaults = INITIAL_DEFAULTS) {
  const enqueue = vi.fn();
  const source = { loaded: Promise.resolve(), defaults };
  const speak = new SpeakAction(
    { enqueue } as unknown as SpeechQueue,
    source as DefaultsSource,
  );
  const trigger = (settings: unknown) =>
    speak.onTrigger(
      new StandaloneTriggerContext<SpeakSettings>(
        "action-1",
        settings as SpeakSettings,
      ),
    );
  return { enqueue, trigger, source };
}

describe("Speak", () => {
  it("enqueues its text in turn, as a fresh install speaks, and produces nothing", async () => {
    const { enqueue, trigger } = setup();

    expect(await trigger({ text: "Hello, chat!" })).toBeUndefined();
    // No Preset — the OS's voice at 1.0× — full volume, on whatever this
    // computer plays on.
    expect(enqueue).toHaveBeenCalledWith(
      {
        text: "Hello, chat!",
        tags: [],
        volume: 1,
        device: "system-default",
      },
      "in-turn",
    );
  });

  it("speaks a number or a boolean a lone reference resolved to", async () => {
    const { enqueue, trigger } = setup();

    await trigger({ text: 42 });
    await trigger({ text: false });

    expect(enqueue.mock.calls.map(([phrase]) => phrase.text)).toEqual([
      "42",
      "false",
    ]);
  });

  it("enqueues an empty Phrase when there is no text, for the Provider to reject", async () => {
    const { enqueue, trigger } = setup();

    await trigger({});
    await trigger(null);
    await trigger({ text: { not: "text" } });

    expect(enqueue.mock.calls.map(([phrase]) => phrase.text)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("puts its Phrase where its Position says, and in turn for anything else", async () => {
    const { enqueue, trigger } = setup();

    await trigger({ text: "a", position: "next" });
    await trigger({ text: "b", position: "now" });
    await trigger({ text: "c", position: "in-turn" });
    await trigger({ text: "d", position: "first" });

    expect(enqueue.mock.calls.map(([, position]) => position)).toEqual([
      "next",
      "now",
      "in-turn",
      "in-turn",
    ]);
  });

  it("attaches its Tags as they compare: trimmed, a number as its string, case kept", async () => {
    const { enqueue, trigger } = setup();

    await trigger({
      text: "hi",
      tags: [" user-1 ", 123, "User-1", "123", "msg-9"],
    });

    expect(enqueue.mock.calls[0][0].tags).toEqual([
      "user-1",
      "123",
      "User-1",
      "msg-9",
    ]);
  });

  it("discards a Tag that comes out empty: nothing could address it", async () => {
    const { enqueue, trigger } = setup();

    await trigger({ text: "hi", tags: ["", "   ", null, { id: 1 }, "user-1"] });
    await trigger({ text: "hi", tags: "user-1" });

    expect(enqueue.mock.calls.map(([phrase]) => phrase.tags)).toEqual([
      ["user-1"],
      [],
    ]);
  });
});

describe("Speak's defaults and overrides", () => {
  const blackHole = { id: "BlackHole2ch_UID", name: "BlackHole 2ch" };
  const chat = { id: "preset-chat", name: "Chat" };
  const announcer = { id: "preset-announcer", name: "Announcer" };
  const chosen: Defaults = {
    preset: chat,
    volume: 80,
    device: blackHole,
    lengthLimit: 200,
  };

  it("speaks with the defaults when it overrides nothing", async () => {
    const { enqueue, trigger } = setup(chosen);

    await trigger({ text: "hi" });

    expect(enqueue.mock.calls[0][0]).toEqual({
      text: "hi",
      tags: [],
      preset: chat,
      volume: 0.8,
      device: blackHole,
    });
  });

  it("speaks with what it overrides, the rest following the defaults", async () => {
    const { enqueue, trigger } = setup(chosen);

    // A streamer-only Phrase, in headphones.
    const headphones = { id: "headphones-uid", name: "AirPods" };
    await trigger({
      text: "hi",
      preset: announcer,
      volume: 30,
      device: headphones,
    });

    expect(enqueue.mock.calls[0][0]).toMatchObject({
      preset: announcer,
      volume: 0.3,
      device: headphones,
    });
  });

  it("follows the defaults as they stand when it runs, with no restart", async () => {
    const { enqueue, trigger, source } = setup(chosen);

    await trigger({ text: "before" });
    source.defaults = { ...chosen, preset: announcer, volume: 50 };
    await trigger({ text: "after" });

    expect(
      enqueue.mock.calls.map(([{ preset, volume }]) => ({ preset, volume })),
    ).toEqual([
      { preset: chat, volume: 0.8 },
      { preset: announcer, volume: 0.5 },
    ]);
  });

  it("cuts its text to the length limit — the default, or its own", async () => {
    const { enqueue, trigger } = setup({ ...chosen, lengthLimit: 11 });
    const text = "Hello there, chat";

    await trigger({ text });
    await trigger({ text, lengthLimit: 5 });
    await trigger({ text, lengthLimit: 500 });

    expect(enqueue.mock.calls.map(([phrase]) => phrase.text)).toEqual([
      "Hello there",
      "Hello",
      text,
    ]);
  });

  it("speaks the text whole when the default has no limit", async () => {
    const { enqueue, trigger } = setup({ ...chosen, lengthLimit: null });
    const text = "word ".repeat(200).trim();

    await trigger({ text });

    expect(enqueue.mock.calls[0][0].text).toBe(text);
  });

  it("waits for the saved defaults before it speaks", async () => {
    const enqueue = vi.fn();
    let load = () => {};
    const source = {
      loaded: new Promise<void>((resolve) => (load = resolve)),
      defaults: INITIAL_DEFAULTS,
    };
    const speak = new SpeakAction(
      { enqueue } as unknown as SpeechQueue,
      source,
    );

    const spoken = speak.onTrigger(
      new StandaloneTriggerContext<SpeakSettings>("action-1", { text: "hi" }),
    );
    await Promise.resolve();
    expect(enqueue).not.toHaveBeenCalled();

    const chat = { id: "preset-chat", name: "Chat" };
    source.defaults = { ...INITIAL_DEFAULTS, preset: chat };
    load();
    await spoken;
    expect(enqueue.mock.calls[0][0].preset).toEqual(chat);
  });
});
