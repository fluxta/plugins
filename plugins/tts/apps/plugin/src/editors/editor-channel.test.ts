import {
  INITIAL_DEFAULTS,
  LISTEN_TEXT,
  type EditorMessage,
  type PluginMessage,
  type Preset,
} from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { ElevenLabsAccount } from "../elevenlabs/account";
import { ElevenLabsClient } from "../elevenlabs/client";
import { ElevenLabsProvider } from "../elevenlabs/elevenlabs-provider";
import { SettingsStore } from "../settings/settings-store";
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

const chat: Preset = {
  id: "preset-chat",
  name: "Chat",
  voice: { provider: "system", id: "ava", name: "Ava (Premium)" },
  settings: { rate: 1.5 },
};

/** The key ElevenLabs takes in these tests; any other is invalid. */
const GOOD_KEY = "sk_good_secret";

/**
 * ElevenLabs as these tests see it: for the good key, Rachel and two Models,
 * one of which does not speak text; 401 for any other.
 */
const elevenLabsFetch = async (
  input: string | URL | Request,
  init?: RequestInit,
) =>
  new Headers(init?.headers).get("xi-api-key") === GOOD_KEY
    ? String(input).includes("/v1/models")
      ? Response.json([
          {
            model_id: "eleven_flash_v2_5",
            name: "Eleven Flash v2.5",
            can_do_text_to_speech: true,
          },
          {
            model_id: "eleven_english_sts_v2",
            name: "Eleven English v2",
            can_do_text_to_speech: false,
          },
        ])
      : Response.json({
          voices: [{ voice_id: "rachel-id", name: "Rachel" }],
          has_more: false,
        })
    : Response.json(
        { detail: { code: "invalid_api_key", message: "Invalid API key" } },
        { status: 401 },
      );

const blackHole: Device = { id: "BlackHole2ch_UID", name: "BlackHole 2ch" };
const speakers: Device = {
  id: "BuiltInSpeakerDevice",
  name: "Mac mini Speakers",
  isDefault: true,
};

function setup({
  lookUpVoices = async () => [milena, ava],
  lookUpDevices = async () => [blackHole, speakers],
  fetchElevenLabs = elevenLabsFetch,
}: {
  lookUpVoices?: Provider["voices"];
  lookUpDevices?: Player["devices"];
  fetchElevenLabs?: typeof elevenLabsFetch;
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
  const settings = new SettingsStore(
    { setPluginSettings },
    () => void channel.publish(),
    () => "new-preset",
  );
  const connections = vi.fn();
  const account = new ElevenLabsAccount({
    key: () => settings.elevenLabsKey,
    onChange: () => void channel.publish(),
    report: connections,
  });
  const client = new ElevenLabsClient({
    key: () => settings.elevenLabsKey,
    onOutcome: (outcome, key) => account.outcome(outcome, key),
    fetch: vi.fn(fetchElevenLabs),
  });
  const elevenLabs = new ElevenLabsProvider(client);
  const enqueue = vi.fn<SpeechQueue["enqueue"]>();
  const problems = new RecentProblems(
    () => void channel.publish(),
    () => 1000,
  );
  const channel = new EditorChannel({
    sender: { sendToEditor: (message) => sent.push(message) },
    settings,
    voices: {
      system: voices,
      elevenlabs: new Listing(() => elevenLabs.voices()),
    },
    devices,
    queue: { enqueue },
    problems,
    elevenLabs: account,
    models: new Listing(() => client.models()),
  });
  const statuses = () =>
    sent.flatMap((message) =>
      message.event === "status" ? [message.status] : [],
    );
  const last = () => statuses().at(-1);
  return {
    channel,
    settings,
    problems,
    sent,
    statuses,
    last,
    setPluginSettings,
    voicesLookUp,
    devicesLookUp,
    enqueue,
    account,
    connections,
  };
}

const noKey = {
  name: "elevenlabs",
  label: "ElevenLabs",
  voices: [],
  problem: "There is no ElevenLabs API key — add one under ElevenLabs",
  models: [],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EditorChannel", () => {
  it("tells an editor the defaults, the Presets, every Voice and every device", async () => {
    const { channel, settings, last } = setup();
    settings.load({ presets: [chat] });

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      presets: [chat],
      providers: [
        {
          name: "system",
          label: "This computer",
          voices: [
            {
              id: "ava",
              name: "Ava (Premium)",
              label: "Ava (Premium) — English (United States)",
            },
            {
              id: "milena",
              name: "Milena",
              label: "Milena — Russian (Russia)",
            },
          ],
        },
        // Offered always, so that it can be found: the reason says where to
        // add a key.
        noKey,
      ],
      elevenLabs: { state: "no-key" },
      // In the OS's order, as the host's Play Sound lists them.
      devices: [blackHole, speakers],
      problems: [],
    });
  });

  it("looks the voices and devices up afresh when an editor opens, not on every change", async () => {
    const { channel, settings, voicesLookUp, devicesLookUp } = setup();
    settings.load({});

    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "set-defaults", defaults: INITIAL_DEFAULTS });
    await settle();

    expect(voicesLookUp).toHaveBeenCalledTimes(2);
    expect(devicesLookUp).toHaveBeenCalledTimes(2);
  });

  it("saves the Plugin Editor's defaults and tells every editor", async () => {
    const { channel, settings, last, setPluginSettings } = setup();
    settings.load({ presets: [chat] });
    const defaults = {
      preset: { id: chat.id, name: "Chat" },
      volume: 40,
      device: blackHole,
      lengthLimit: null,
    };

    await channel.handle({ event: "set-defaults", defaults });
    await settle();

    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults,
      presets: [chat],
    });
    expect(last()?.defaults).toEqual(defaults);
  });

  it("saves and deletes Presets, and tells every editor", async () => {
    const { channel, settings, last } = setup();
    settings.load({});
    const draft = {
      name: chat.name,
      voice: chat.voice,
      settings: chat.settings,
    };

    await channel.handle({ event: "save-preset", preset: draft });
    await settle();
    expect(last()?.presets).toEqual([{ ...chat, id: "new-preset" }]);

    await channel.handle({ event: "delete-preset", id: "new-preset" });
    await settle();
    expect(last()?.presets).toEqual([]);
  });

  it("answers only once the saved settings are in", async () => {
    const { channel, settings, sent, statuses } = setup();

    const answered = channel.handle({ event: "get-status" });
    await settle();
    expect(sent).toHaveLength(0);

    settings.load({ defaults: { volume: 20 } });
    await answered;
    expect(statuses()[0].defaults.volume).toBe(20);
  });

  it("says why there are no voices or devices when the Provider or the Player cannot list them", async () => {
    const reason = "Text to Speech does not speak on linux";
    const { channel, settings, last } = setup({
      lookUpVoices: async () => {
        throw new ProviderError("unavailable", reason);
      },
      lookUpDevices: async () => {
        throw new PlayerError("unavailable", reason);
      },
    });
    settings.load({});

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      presets: [],
      providers: [
        {
          name: "system",
          label: "This computer",
          voices: [],
          problem: reason,
        },
        noKey,
      ],
      elevenLabs: { state: "no-key" },
      devices: [],
      devicesProblem: reason,
      problems: [],
    });
  });

  it("stores an ElevenLabs key, checks the account with it and lists its voices — never telling the key", async () => {
    const { channel, settings, last, sent, connections, setPluginSettings } =
      setup();
    settings.load({});

    await channel.handle({ event: "set-elevenlabs-key", key: ` ${GOOD_KEY} ` });
    await settle();

    expect(settings.elevenLabsKey).toBe(GOOD_KEY);
    expect(setPluginSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ elevenLabs: { key: GOOD_KEY } }),
    );
    expect(last()?.elevenLabs).toEqual({ state: "connected" });
    expect(last()?.providers[1]).toEqual({
      name: "elevenlabs",
      label: "ElevenLabs",
      voices: [{ id: "rachel-id", name: "Rachel", label: "Rachel" }],
      models: [{ id: "eleven_flash_v2_5", name: "Eleven Flash v2.5" }],
    });
    expect(connections).toHaveBeenLastCalledWith([
      { id: "elevenlabs", title: "ElevenLabs", connected: true },
    ]);
    expect(JSON.stringify(sent)).not.toContain(GOOD_KEY);
  });

  it("keeps the stored key when the field is left blank", async () => {
    const { channel, settings, setPluginSettings } = setup();
    settings.load({ elevenLabs: { key: GOOD_KEY } });

    await channel.handle({ event: "set-elevenlabs-key", key: "  " });

    expect(settings.elevenLabsKey).toBe(GOOD_KEY);
    expect(setPluginSettings).not.toHaveBeenCalled();
  });

  it("says why the account is not connected with an invalid key", async () => {
    const { channel, settings, last, connections } = setup();
    settings.load({});

    await channel.handle({ event: "set-elevenlabs-key", key: "sk_wrong" });
    await settle();

    expect(last()?.elevenLabs).toEqual({
      state: "not-connected",
      reason: "ElevenLabs: Invalid API key",
    });
    expect(last()?.providers[1]).toMatchObject({
      voices: [],
      problem: "ElevenLabs: Invalid API key",
    });
    expect(connections).toHaveBeenLastCalledWith([
      { id: "elevenlabs", title: "ElevenLabs", connected: false },
    ]);
    expect(JSON.stringify(last())).not.toContain("sk_wrong");
  });

  it("removes the key, and the External Connection with it", async () => {
    const { channel, settings, account, last, connections } = setup();
    settings.load({ elevenLabs: { key: GOOD_KEY } });
    account.keyChanged();
    await channel.handle({ event: "get-status" });
    await settle();
    expect(last()?.elevenLabs).toEqual({ state: "connected" });

    await channel.handle({ event: "remove-elevenlabs-key" });
    await settle();

    expect(settings.elevenLabsKey).toBeUndefined();
    expect(last()?.elevenLabs).toEqual({ state: "no-key" });
    expect(last()?.providers[1]).toEqual(noKey);
    expect(connections).toHaveBeenLastCalledWith([]);
  });

  it("does not wait for ElevenLabs: this computer's voices go out at once, ElevenLabs' once it answers", async () => {
    const answers: (() => void)[] = [];
    const answer = () => answers.forEach((give) => give());
    const { channel, settings, last } = setup({
      fetchElevenLabs: (input, init) =>
        new Promise((resolve) => {
          answers.push(() => resolve(elevenLabsFetch(input, init)));
        }),
    });
    settings.load({ elevenLabs: { key: GOOD_KEY } });

    const opened = channel.handle({ event: "get-status" });
    await settle();

    expect(last()?.providers[0].voices).toHaveLength(2);
    expect(last()?.providers[1]).toEqual({
      name: "elevenlabs",
      label: "ElevenLabs",
      voices: [],
      loading: true,
      models: [],
    });

    answer();
    await opened;
    expect(last()?.providers[1].voices).toEqual([
      { id: "rachel-id", name: "Rachel", label: "Rachel" },
    ]);
  });

  it("asks for a failed ElevenLabs list again only when an editor opens", async () => {
    const fetchElevenLabs = vi.fn<typeof elevenLabsFetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const voiceLookUps = () =>
      fetchElevenLabs.mock.calls.filter(([input]) =>
        String(input).includes("/v2/voices"),
      ).length;
    const { channel, settings, last } = setup({ fetchElevenLabs });
    settings.load({ elevenLabs: { key: GOOD_KEY } });

    await channel.handle({ event: "get-status" });
    expect(last()?.providers[1].problem).toBe(
      "Cannot reach ElevenLabs: fetch failed",
    );
    await channel.handle({
      event: "set-defaults",
      defaults: { ...INITIAL_DEFAULTS, volume: 50 },
    });
    await settle();
    expect(voiceLookUps()).toBe(1);

    await channel.handle({ event: "get-status" });
    expect(voiceLookUps()).toBe(2);
  });

  it("reports an unexpected startup response as disconnected, and refreshes it when an editor opens", async () => {
    let blocked = true;
    const fetchElevenLabs = vi.fn<typeof elevenLabsFetch>((input, init) =>
      blocked
        ? Promise.resolve(
            new Response("<html>Service blocked</html>", {
              headers: { "content-type": "text/html" },
            }),
          )
        : elevenLabsFetch(input, init),
    );
    const { channel, settings, account, connections, last } = setup({
      fetchElevenLabs,
    });
    settings.load({ elevenLabs: { key: GOOD_KEY } });

    account.keyChanged();
    await channel.publish();

    expect(account.status).toEqual({
      state: "not-connected",
      reason: "ElevenLabs returned an unexpected response",
    });
    expect(last()?.elevenLabs).toEqual(account.status);
    expect(last()?.providers[1]).toMatchObject({
      voices: [],
      models: [],
      problem: "ElevenLabs returned an unexpected response",
    });
    expect(connections).toHaveBeenLastCalledWith([
      { id: "elevenlabs", title: "ElevenLabs", connected: false },
    ]);
    expect(fetchElevenLabs).toHaveBeenCalledTimes(2);

    blocked = false;
    await channel.handle({ event: "get-status" });

    expect(account.status.state).toBe("connected");
    expect(last()?.providers[1].voices).toHaveLength(1);
    expect(last()?.providers[1].problem).toBeUndefined();
    expect(connections).toHaveBeenLastCalledWith([
      { id: "elevenlabs", title: "ElevenLabs", connected: true },
    ]);
  });

  it("tells every editor of a Phrase dropped, at once", async () => {
    const { channel, settings, problems, last } = setup();
    settings.load({});
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
  const chatRef = { id: chat.id, name: "Chat" };

  it("speaks the typed text as Next, with a Speak's Preset and Overrides, out of scenarios' sight", async () => {
    const { channel, settings, enqueue, sent } = setup();
    settings.load({ presets: [chat] });

    await channel.handle({
      event: "listen",
      id: "l-1",
      text: "Thanks for the follow!",
      settings: { preset: chatRef, volume: 40, device: blackHole },
    });

    expect(enqueue).toHaveBeenCalledWith(
      {
        text: "Thanks for the follow!",
        tags: [],
        preset: chatRef,
        volume: 0.4,
        device: blackHole,
        listen: "l-1",
      },
      "next",
    );
    expect(sent).toEqual([]);
  });

  it("speaks a Preset dialog's unsaved form, with the Defaults' volume and device", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({ defaults: { volume: 70, device: blackHole } });
    const speech = {
      voice: { provider: "system", id: "milena", name: "Milena" },
      settings: { rate: 0.8 },
    } as const;

    await channel.handle({
      event: "listen",
      id: "l-1",
      text,
      settings: { speech },
    });

    expect(enqueue.mock.calls[0][0]).toEqual({
      text,
      tags: [],
      speech,
      volume: 0.7,
      device: blackHole,
      listen: "l-1",
    });
  });

  it("follows the Defaults for whatever the form leaves out — no Preset while there is no Default Preset", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({ defaults: { volume: 70, device: blackHole } });

    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });
    await channel.handle({
      event: "listen",
      id: "l-2",
      text,
      settings: { device: "system-default" },
    });

    expect(enqueue.mock.calls.map(([phrase]) => phrase)).toEqual([
      {
        text,
        tags: [],
        volume: 0.7,
        device: blackHole,
        listen: "l-1",
      },
      expect.objectContaining({ device: "system-default" }),
    ]);
  });

  it("hears a Plugin Editor change saved just before the click", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({});

    void channel.handle({
      event: "set-defaults",
      defaults: { ...INITIAL_DEFAULTS, volume: 30 },
    });
    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });

    expect(enqueue.mock.calls[0][0].volume).toBe(0.3);
  });

  it("says the greeting when the field is blank", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({});

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

  it("answers the editor that asked when the Preset or its Voice is not here, speaking nothing", async () => {
    const { channel, settings, enqueue, sent } = setup();
    settings.load({
      presets: [
        { ...chat, voice: { provider: "system", id: "gone", name: "Gone" } },
      ],
    });

    await channel.handle({
      event: "listen",
      id: "l-1",
      text,
      settings: { preset: { id: "deleted", name: "Announcer" } },
    });
    await channel.handle({
      event: "listen",
      id: "l-2",
      text,
      settings: { preset: chatRef },
    });
    await channel.handle({
      event: "listen",
      id: "l-3",
      text,
      settings: { speech: { settings: { rate: 1 } } } as never,
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "No Preset Announcer on this computer",
      },
      {
        event: "listen-failed",
        id: "l-2",
        problem: "This voice is not on this computer",
      },
      {
        event: "listen-failed",
        id: "l-3",
        problem: "Choose a voice to listen to",
      },
    ]);
  });

  it("answers with the Provider's reason when there are no voices at all", async () => {
    const { channel, settings, sent } = setup({
      lookUpVoices: async () => {
        throw new ProviderError(
          "unavailable",
          "Text to Speech does not speak on linux",
        );
      },
    });
    settings.load({});

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
