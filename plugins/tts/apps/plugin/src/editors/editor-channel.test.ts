import {
  INITIAL_DEFAULTS,
  LISTEN_TEXT,
  type EditorMessage,
  type PluginMessage,
} from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { DefaultsStore } from "../settings/defaults-store";
import { Listing } from "../speech/listing";
import { PlayerError, type Device, type Player } from "../speech/player";
import { ProviderError, type Provider, type Voice } from "../speech/provider";
import type { SpeechQueue } from "../speech/speech-queue";
import { Voices } from "../speech/voices";
import { EditorChannel } from "./editor-channel";
import { RecentProblems } from "./recent-problems";

const milena: Voice = {
  id: "milena",
  name: "Milena",
  language: "ru-RU",
  isDefault: true,
};
const ava: Voice = {
  id: "ava",
  name: "Ava",
  language: "en-US",
  quality: "premium",
};

const blackHole: Device = { id: "BlackHole2ch_UID", name: "BlackHole 2ch" };
const speakers: Device = {
  id: "BuiltInSpeakerDevice",
  name: "Mac mini Speakers",
  isDefault: true,
};

function setup({
  lookUpVoices = async () => [milena, ava],
  lookUpDevices = async () => [blackHole, speakers],
}: {
  lookUpVoices?: Provider["voices"];
  lookUpDevices?: Player["devices"];
} = {}) {
  const sent: PluginMessage[] = [];
  const voicesLookUp = vi.fn(lookUpVoices);
  const voices = new Voices({
    voices: voicesLookUp,
    synthesize: async () => new Uint8Array(),
  });
  const devicesLookUp = vi.fn(lookUpDevices);
  const devices = new Listing(devicesLookUp);
  const setPluginSettings = vi.fn(async () => {});
  const defaults = new DefaultsStore(
    { setPluginSettings },
    () => void channel.publish(),
  );
  const enqueue = vi.fn<SpeechQueue["enqueue"]>();
  const problems = new RecentProblems(
    () => void channel.publish(),
    () => 1000,
  );
  const channel = new EditorChannel({
    sender: { sendToEditor: (message) => sent.push(message) },
    defaults,
    voices,
    devices,
    queue: { enqueue },
    problems,
  });
  const statuses = () =>
    sent.flatMap((message) =>
      message.event === "status" ? [message.status] : [],
    );
  const last = () => statuses().at(-1);
  return {
    channel,
    defaults,
    problems,
    sent,
    statuses,
    last,
    setPluginSettings,
    voicesLookUp,
    devicesLookUp,
    enqueue,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EditorChannel", () => {
  it("tells an editor the defaults, the Default Voice, every Voice and every device", async () => {
    const { channel, defaults, last } = setup();
    defaults.load({});

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      // Nothing chosen yet: the OS's own voice.
      defaultVoice: { id: "milena", name: "Milena" },
      voices: [
        { id: "ava", label: "Ava (Premium) — English (United States)" },
        { id: "milena", label: "Milena — Russian (Russia)" },
      ],
      // In the OS's order, as the host's Play Sound lists them.
      devices: [blackHole, speakers],
      problems: [],
    });
  });

  it("looks the voices and devices up afresh when an editor opens, not on every change", async () => {
    const { channel, defaults, voicesLookUp, devicesLookUp } = setup();
    defaults.load({});

    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "set-defaults", defaults: INITIAL_DEFAULTS });
    await settle();

    expect(voicesLookUp).toHaveBeenCalledTimes(2);
    expect(devicesLookUp).toHaveBeenCalledTimes(2);
  });

  it("names the chosen Default Voice, or only its id when it is not here", async () => {
    const { channel, defaults, last } = setup();

    defaults.load({ defaults: { voice: "ava" } });
    await channel.handle({ event: "get-status" });
    expect(last()?.defaultVoice).toEqual({ id: "ava", name: "Ava (Premium)" });

    defaults.load({ defaults: { voice: "gone" } });
    await channel.handle({ event: "get-status" });
    expect(last()?.defaultVoice).toEqual({ id: "gone" });
  });

  it("saves the Plugin Editor's defaults and tells every editor", async () => {
    const { channel, defaults, last, setPluginSettings } = setup();
    defaults.load({});

    await channel.handle({
      event: "set-defaults",
      defaults: {
        voice: "ava",
        rate: 1.5,
        volume: 40,
        device: blackHole,
        lengthLimit: null,
      },
    });
    await settle();

    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults: {
        voice: "ava",
        rate: 1.5,
        volume: 40,
        device: blackHole,
        lengthLimit: null,
      },
    });
    expect(last()).toMatchObject({
      defaults: { voice: "ava", rate: 1.5 },
      defaultVoice: { id: "ava", name: "Ava (Premium)" },
    });
  });

  it("answers only once the saved defaults are in", async () => {
    const { channel, defaults, sent, statuses } = setup();

    const answered = channel.handle({ event: "get-status" });
    await settle();
    expect(sent).toHaveLength(0);

    defaults.load({ defaults: { volume: 20 } });
    await answered;
    expect(statuses()[0].defaults.volume).toBe(20);
  });

  it("says why there are no voices or devices when the Provider or the Player cannot list them", async () => {
    const reason = "Text to Speech does not speak on linux";
    const { channel, defaults, last } = setup({
      lookUpVoices: async () => {
        throw new ProviderError("unavailable", reason);
      },
      lookUpDevices: async () => {
        throw new PlayerError("unavailable", reason);
      },
    });
    defaults.load({});

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      voices: [],
      voicesProblem: reason,
      devices: [],
      devicesProblem: reason,
      problems: [],
    });
  });

  it("tells every editor of a Phrase dropped, at once", async () => {
    const { channel, defaults, problems, last } = setup();
    defaults.load({});
    await channel.handle({ event: "get-status" });

    const drop = {
      kind: "device-missing",
      reason: "BlackHole 2ch is not connected",
      text: "Hello chat",
    };
    problems.add(drop);
    await settle();

    expect(last()?.problems).toEqual([{ id: 1, at: 1000, ...drop }]);
  });
});

describe("Listen", () => {
  const text = "Hello";

  it("speaks the typed text as Next, as the form says, out of scenarios' sight", async () => {
    const { channel, defaults, enqueue, sent } = setup();
    defaults.load({});

    await channel.handle({
      event: "listen",
      id: "l-1",
      text: "Thanks for the follow!",
      settings: { voice: "ava", rate: 1.5, volume: 40, device: blackHole },
    });

    expect(enqueue).toHaveBeenCalledWith(
      {
        text: "Thanks for the follow!",
        tags: [],
        voice: "ava",
        rate: 1.5,
        volume: 0.4,
        device: blackHole,
        listen: "l-1",
      },
      "next",
    );
    expect(sent).toEqual([]);
  });

  it("follows the Defaults for whatever the form leaves out — the OS's voice included", async () => {
    const { channel, defaults, enqueue } = setup();
    defaults.load({ defaults: { rate: 0.8, volume: 70, device: blackHole } });

    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });
    await channel.handle({
      event: "listen",
      id: "l-2",
      text,
      settings: { device: "system-default" },
    });

    expect(enqueue.mock.calls.map(([phrase]) => phrase)).toEqual([
      expect.objectContaining({
        voice: "milena",
        rate: 0.8,
        volume: 0.7,
        device: blackHole,
      }),
      expect.objectContaining({ device: "system-default" }),
    ]);
  });

  it("hears a Plugin Editor change saved just before the click", async () => {
    const { channel, defaults, enqueue } = setup();
    defaults.load({});

    void channel.handle({
      event: "set-defaults",
      defaults: { ...INITIAL_DEFAULTS, volume: 30 },
    });
    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });

    expect(enqueue.mock.calls[0][0].volume).toBe(0.3);
  });

  it("says the greeting when the field is blank", async () => {
    const { channel, defaults, enqueue } = setup();
    defaults.load({});

    await channel.handle({
      event: "listen",
      id: "l-1",
      text: " ",
      settings: {},
    });
    // Read warily, as the settings are.
    await channel.handle({
      event: "listen",
      id: "l-2",
      settings: {},
    } as unknown as EditorMessage);

    expect(enqueue.mock.calls.map(([phrase]) => phrase.text)).toEqual([
      LISTEN_TEXT,
      LISTEN_TEXT,
    ]);
  });

  it("answers the editor that asked when the Voice is not here, speaking nothing", async () => {
    const { channel, defaults, enqueue, sent } = setup();
    defaults.load({});

    await channel.handle({
      event: "listen",
      id: "l-1",
      text,
      settings: { voice: "gone" },
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "This voice is not on this computer",
      },
    ]);
  });

  it("answers with the Provider's reason when there are no voices at all", async () => {
    const { channel, defaults, sent } = setup({
      lookUpVoices: async () => {
        throw new ProviderError(
          "unavailable",
          "Text to Speech does not speak on linux",
        );
      },
    });
    defaults.load({});

    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });

    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "Text to Speech does not speak on linux",
      },
    ]);
  });

  it("passes on why a Listen's Phrase was dropped", () => {
    const { channel, sent } = setup();

    channel.listenFailed(
      "l-1",
      new PlayerError("device-missing", "BlackHole 2ch is not connected"),
    );

    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "BlackHole 2ch is not connected",
      },
    ]);
  });
});
