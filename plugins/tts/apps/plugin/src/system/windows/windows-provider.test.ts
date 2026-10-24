import { describe, expect, it } from "vitest";

import { ProviderError } from "../../speech/provider";
import { pcm16Wav, wavDuration } from "../../speech/wav";
import { FakeEngine } from "../fake-engine";
import {
  oneCoreRate,
  sapiRate,
  storeVoice,
  WindowsProvider,
  windowsVoices,
} from "./windows-provider";

const ONECORE =
  "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\";
const SAPI =
  "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\";

const pavel = {
  id: `${ONECORE}MSTTS_V110_ruRU_PavelM`,
  name: "Microsoft Pavel",
  language: "ru-RU",
};
const irina = {
  id: `${ONECORE}MSTTS_V110_ruRU_IrinaM`,
  name: "Microsoft Irina",
  language: "ru-RU",
};
const irinaDesktop = {
  id: `${SAPI}TTS_MS_RU-RU_IRINA_11.0`,
  name: "Microsoft Irina Desktop",
  language: "ru-RU",
};
const anna = { id: `${SAPI}RHVoice_Anna`, name: "Anna", language: "ru-RU" };

describe("windowsVoices", () => {
  it("lists OneCore's voices, then SAPI's, a voice in both once, as OneCore's", () => {
    expect(
      windowsVoices({
        oneCore: [pavel, irina],
        sapi: [irinaDesktop, anna],
        oneCoreDefault: irina.id,
        sapiDefault: irinaDesktop.id,
      }),
    ).toEqual([
      { id: `onecore:${pavel.id}`, name: "Microsoft Pavel", language: "ru-RU" },
      {
        id: `onecore:${irina.id}`,
        name: "Microsoft Irina",
        language: "ru-RU",
        isDefault: true,
      },
      { id: `sapi:${anna.id}`, name: "Anna", language: "ru-RU" },
    ]);
  });

  it("keeps a SAPI voice of the same name in another language", () => {
    const zira = {
      id: `${ONECORE}Zira`,
      name: "Microsoft Zira",
      language: "en-US",
    };
    const ziraGb = {
      id: `${SAPI}Zira`,
      name: "Microsoft Zira Desktop",
      language: "en-GB",
    };

    expect(
      windowsVoices({ oneCore: [zira], sapi: [ziraGb] }).map(({ id }) => id),
    ).toEqual([`onecore:${zira.id}`, `sapi:${ziraGb.id}`]);
  });

  it("marks SAPI's default without OneCore's — on OneCore's twin, when there is one", () => {
    expect(
      windowsVoices({
        oneCore: [],
        sapi: [irinaDesktop, anna],
        sapiDefault: anna.id,
      })
        .filter(({ isDefault }) => isDefault)
        .map(({ id }) => id),
    ).toEqual([`sapi:${anna.id}`]);

    expect(
      windowsVoices({
        oneCore: [pavel, irina],
        sapi: [irinaDesktop],
        oneCoreDefault: "",
        sapiDefault: irinaDesktop.id,
      })
        .filter(({ isDefault }) => isDefault)
        .map(({ id }) => id),
    ).toEqual([`onecore:${irina.id}`]);
  });

  it("reads warily: skips what is not a voice, and gives a voice without a language one", () => {
    expect(
      windowsVoices({
        oneCore: "nothing",
        sapi: [
          null,
          { id: "", name: "x" },
          { id: "a", name: "Anna" },
          { name: "b" },
        ],
      }),
    ).toEqual([{ id: "sapi:a", name: "Anna", language: "und" }]);
  });
});

describe("storeVoice", () => {
  it("splits a Voice's id into its store and the store's own id", () => {
    expect(storeVoice(`onecore:${pavel.id}`)).toEqual({
      store: "onecore",
      id: pavel.id,
    });
    expect(storeVoice("sapi:a:b")).toEqual({ store: "sapi", id: "a:b" });
  });

  it("knows no other store, nor an id without one", () => {
    expect(storeVoice("com.apple.voice.compact.ru-RU.Milena")).toBeUndefined();
    expect(storeVoice("onecore:")).toBeUndefined();
    expect(storeVoice(":x")).toBeUndefined();
  });
});

describe("rates", () => {
  it("maps the multiplier onto SAPI's −10–10, where 10 is three times the pace", () => {
    expect([0.5, 0.8, 1, 1.5, 2].map(sapiRate)).toEqual([-6, -2, 0, 4, 6]);
    expect([0.1, 3, 10].map(sapiRate)).toEqual([-10, 10, 10]);
  });

  it("passes the multiplier to OneCore within its 0.5–6", () => {
    expect([0.25, 0.5, 1.5, 2, 9].map(oneCoreRate)).toEqual([
      0.5, 0.5, 1.5, 2, 6,
    ]);
  });
});

function setup() {
  const engine = new FakeEngine();
  return { engine, provider: new WindowsProvider(engine) };
}

const signal = () => new AbortController().signal;
const second = pcm16Wav(new Uint8Array(32_000), 16_000);

describe("WindowsProvider", () => {
  it("lists both stores' voices", async () => {
    const { engine, provider } = setup();

    const voices = provider.voices();
    engine.reply(1, {
      oneCore: [pavel],
      sapi: [anna],
      oneCoreDefault: pavel.id,
      problems: [],
    });

    expect(await voices).toEqual([
      {
        id: `onecore:${pavel.id}`,
        name: "Microsoft Pavel",
        language: "ru-RU",
        isDefault: true,
      },
      { id: `sapi:${anna.id}`, name: "Anna", language: "ru-RU" },
    ]);
    expect(engine.listening).toBe(0);
  });

  it("lists one store's voices when the other cannot be read", async () => {
    const { engine, provider } = setup();

    const voices = provider.voices();
    engine.reply(1, {
      oneCore: [],
      sapi: [anna],
      problems: ["OneCore: Class not registered"],
    });

    expect(await voices).toEqual([
      { id: `sapi:${anna.id}`, name: "Anna", language: "ru-RU" },
    ]);
  });

  it("is unavailable when neither store can be read", async () => {
    const { engine, provider } = setup();

    const voices = provider.voices();
    engine.reply(1, {
      oneCore: [],
      sapi: [],
      problems: ["SAPI: Class not registered", "OneCore: Unable to find type"],
    });

    await expect(voices).rejects.toEqual(
      new ProviderError(
        "unavailable",
        "No voice store can be read: SAPI: Class not registered; OneCore: Unable to find type",
      ),
    );
  });

  it("passes on why the script cannot run", async () => {
    const { engine, provider } = setup();
    const reason =
      "PowerShell runs in ConstrainedLanguage mode — Text to Speech cannot run on this machine";

    const voices = provider.voices();
    engine.reply(1, { error: { kind: "unavailable", reason } });

    await expect(voices).rejects.toEqual(
      new ProviderError("unavailable", reason),
    );
  });

  it("asks the voice's store for the trimmed text, at the store's rate", async () => {
    const { engine, provider } = setup();

    void provider.synthesize(
      "  Привет, чат  ",
      `onecore:${pavel.id}`,
      { rate: 2 },
      signal(),
    );
    void provider.synthesize("Hi", `sapi:${anna.id}`, { rate: 2 }, signal());

    expect(engine.requests.map(({ message }) => message)).toEqual([
      {
        op: "synthesize",
        store: "onecore",
        voice: pavel.id,
        text: "Привет, чат",
        rate: 2,
      },
      { op: "synthesize", store: "sapi", voice: anna.id, text: "Hi", rate: 6 },
    ]);
  });

  it("returns OneCore's WAV as it is", async () => {
    const { engine, provider } = setup();

    const audio = provider.synthesize(
      "Hi",
      `onecore:${pavel.id}`,
      { rate: 1 },
      signal(),
    );
    engine.reply(1, { wav: Buffer.from(second).toString("base64") });

    expect(await audio).toEqual(second);
    expect(engine.listening).toBe(0);
  });

  it("puts SAPI's PCM behind a WAV header of the format SAPI wrote", async () => {
    const { engine, provider } = setup();

    const audio = provider.synthesize(
      "Hi",
      `sapi:${anna.id}`,
      { rate: 1 },
      signal(),
    );
    engine.reply(1, {
      pcm: Buffer.alloc(44_100).toString("base64"),
      sampleRate: 22_050,
      channels: 1,
      bits: 16,
    });

    expect(wavDuration(await audio)).toBe(1);
  });

  it("refuses SAPI audio that is not 16-bit", async () => {
    const { engine, provider } = setup();

    const audio = provider.synthesize(
      "Hi",
      `sapi:${anna.id}`,
      { rate: 1 },
      signal(),
    );
    engine.reply(1, { pcm: "AAAA", sampleRate: 22_050, channels: 1, bits: 8 });

    await expect(audio).rejects.toEqual(
      new ProviderError("unavailable", "SAPI wrote 8-bit audio, not 16-bit"),
    );
  });

  it("rejects what the voice did not say", async () => {
    const { engine, provider } = setup();

    const silent = provider.synthesize(
      "Hi",
      `onecore:${pavel.id}`,
      { rate: 1 },
      signal(),
    );
    engine.reply(1, { wav: "" });

    await expect(silent).rejects.toMatchObject({
      kind: "rejected",
      message: "The voice said nothing",
    });
  });

  it("rejects empty text, and a voice of no store here, without asking the script", async () => {
    const { engine, provider } = setup();

    await expect(
      provider.synthesize("  ", `onecore:${pavel.id}`, { rate: 1 }, signal()),
    ).rejects.toMatchObject({ kind: "rejected" });
    await expect(
      provider.synthesize(
        "Hi",
        "com.apple.voice.compact.ru-RU.Milena",
        { rate: 1 },
        signal(),
      ),
    ).rejects.toEqual(
      new ProviderError(
        "voice-missing",
        "No voice com.apple.voice.compact.ru-RU.Milena on this computer",
      ),
    );
    expect(engine.requests).toEqual([]);
  });

  it("passes on the script's failure, as its kind", async () => {
    const { engine, provider } = setup();

    const audio = provider.synthesize(
      "Hi",
      `onecore:${pavel.id}`,
      { rate: 1 },
      signal(),
    );
    engine.reply(1, {
      error: {
        kind: "voice-missing",
        reason: "No voice MSTTS_V110_ruRU_PavelM on this computer",
      },
    });

    await expect(audio).rejects.toEqual(
      new ProviderError(
        "voice-missing",
        "No voice MSTTS_V110_ruRU_PavelM on this computer",
      ),
    );
  });

  it("stops listening when aborted, and tells the script", async () => {
    const { engine, provider } = setup();
    const abort = new AbortController();

    const audio = provider.synthesize(
      "Hi",
      `onecore:${pavel.id}`,
      { rate: 1 },
      abort.signal,
    );
    abort.abort(new Error("stopped"));

    await expect(audio).rejects.toThrow("stopped");
    expect(engine.notified).toEqual([{ op: "cancel", id: 1 }]);
    expect(engine.listening).toBe(0);
  });
});
