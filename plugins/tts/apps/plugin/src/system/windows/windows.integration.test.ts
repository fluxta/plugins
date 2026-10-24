import { spawn, type ChildProcess } from "node:child_process";

import { describe, expect, it } from "vitest";

import type { Device } from "../../speech/player";
import type { Voice } from "../../speech/provider";
import { encodeWav, wavDuration } from "../../speech/wav";
import type { Spawn } from "../script-process";
import { encodedCommand, PowerShellProcess } from "./powershell-process";
import synthesizerScript from "./synthesizer.ps1";
import { WindowsPlayer } from "./windows-player";
import { WindowsProvider } from "./windows-provider";

/**
 * SAPI's names for the output devices, which the Player does not use: for
 * the record of how each of Windows' APIs names a device.
 */
const SAPI_OUTPUTS = `
function Receive($request) {
  $list = New-Object System.Collections.ArrayList
  foreach ($token in (New-Object -ComObject SAPI.SpVoice).GetAudioOutputs()) {
    $null = $list.Add(@{ id = [string]$token.Id; name = [string]$token.GetDescription() })
  }
  Send @{ id = $request.id; outputs = $list }
}
function Step { $false }
Run
`;

function sapiOutputs(): Promise<{ id: string; name: string }[]> {
  const probe = new PowerShellProcess("probe", SAPI_OUTPUTS);
  return new Promise((resolve, reject) => {
    const id = probe.request({ op: "outputs" }, (reply) => {
      probe.release(id);
      if (reply.error) {
        reject(new Error(reply.error.reason));
      } else {
        resolve(reply.outputs as { id: string; name: string }[]);
      }
    });
  });
}

/** Silence as long as a long Phrase, to pull a device out from under. */
const silence = (seconds: number) =>
  encodeWav(new Float32Array(22_050 * seconds), 22_050);

/** A device to play on that is not the default, if there is one. */
function other(devices: Device[]): Device | undefined {
  return (
    devices.find(({ name, isDefault }) => !isDefault && /cable/i.test(name)) ??
    devices.find(({ isDefault }) => !isDefault)
  );
}

/**
 * The PowerShell scripts against the real SAPI and WinRT. Nothing is heard:
 * every play runs at volume 0. It prints the voices and the output devices it
 * finds, for the record of what each store and each API holds.
 */
describe.runIf(process.platform === "win32")(
  "Windows engines",
  { timeout: 60_000 },
  () => {
    const signal = () => new AbortController().signal;
    const provider = new WindowsProvider();
    const seconds = async (text: string, voice: Voice, rate = 1) =>
      wavDuration(
        await provider.synthesize(text, voice.id, { rate }, signal()),
      );
    const stores = async () => {
      const voices = await provider.voices();
      return {
        voices,
        oneCore: voices.find(({ id }) => id.startsWith("onecore:")),
        sapi: voices.find(({ id }) => id.startsWith("sapi:")),
        fallback: voices.find(({ isDefault }) => isDefault) ?? voices[0],
      };
    };

    it("lists both stores' voices, each once, the OS's default among them", async () => {
      const { voices } = await stores();
      console.info(
        voices
          .map(
            ({ id, name, language, isDefault }) =>
              `${isDefault ? "*" : " "} ${name} (${language}) ${id}`,
          )
          .join("\n"),
      );

      expect(voices.length).toBeGreaterThan(0);
      expect(voices.filter(({ isDefault }) => isDefault)).toHaveLength(1);
      expect(new Set(voices.map(({ id }) => id)).size).toBe(voices.length);
      expect(voices.every(({ id }) => /^(onecore|sapi):./.test(id))).toBe(true);
    });

    it("speaks with a voice of each store", async () => {
      const { oneCore, sapi } = await stores();

      for (const voice of [oneCore, sapi].filter((found) => found)) {
        const audio = await provider.synthesize(
          "Hello, chat!",
          voice!.id,
          { rate: 1 },
          signal(),
        );
        const view = new DataView(audio.buffer, audio.byteOffset);
        console.info(
          `${voice!.name}: ${view.getUint32(24, true)} Hz, ${view.getUint16(22, true)} channel(s), ${view.getUint16(34, true)}-bit`,
        );
        expect(wavDuration(audio)).toBeGreaterThan(0.3);
      }
    });

    it("reads markup as text, in both stores", async () => {
      const { oneCore, sapi } = await stores();

      for (const voice of [oneCore, sapi].filter((found) => found)) {
        // A pause read as SSML would add 20 s; said aloud it takes a few.
        expect(
          await seconds('Wait <break time="20s"/> & <speak>here', voice!),
        ).toBeLessThan(12);
      }
    });

    it("is slower at 0.5× and faster at 2×, in both stores", async () => {
      const { oneCore, sapi } = await stores();
      const text = "The quick brown fox jumps over the lazy dog.";

      for (const voice of [oneCore, sapi].filter((found) => found)) {
        const [slow, normal, fast] = [
          await seconds(text, voice!, 0.5),
          await seconds(text, voice!, 1),
          await seconds(text, voice!, 2),
        ];
        console.info(
          `${voice!.name}: 0.5× ${slow} s, 1× ${normal} s, 2× ${fast} s`,
        );
        expect(slow).toBeGreaterThan(normal * 1.3);
        expect(fast).toBeLessThan(normal / 1.3);
      }
    });

    it("speaks Russian with a Russian voice, when one is installed", async () => {
      const { voices } = await stores();
      const russian = voices.find(({ language }) => language === "ru-RU");

      if (russian) {
        expect(await seconds("Привет, чат!", russian)).toBeGreaterThan(0.3);
      }
    });

    it("reports a voice that is not here", async () => {
      await expect(
        provider.synthesize(
          "Hi",
          "onecore:HKEY_LOCAL_MACHINE\\Gone",
          { rate: 1 },
          signal(),
        ),
      ).rejects.toMatchObject({ kind: "voice-missing" });
    });

    it("plays a Phrase to its end on System default, silently", async () => {
      const { fallback } = await stores();
      const audio = await provider.synthesize(
        "One two",
        fallback.id,
        { rate: 2 },
        signal(),
      );

      const requested = Date.now();
      let started = 0;
      await new WindowsPlayer().play(
        audio,
        {
          volume: 0,
          device: "system-default",
          onStarted: () => (started = Date.now()),
        },
        signal(),
      );
      const ended = Date.now();

      console.info(
        `Request to start: ${started - requested} ms; start to end: ${ended - started} ms of ${Math.round(wavDuration(audio) * 1000)} ms`,
      );
      expect(started).toBeGreaterThanOrEqual(requested);
      expect(ended - started).toBeGreaterThanOrEqual(
        wavDuration(audio) * 1000 - 200,
      );
    });

    it("lists the output devices under Windows' names, the default among them", async () => {
      const devices = await new WindowsPlayer().devices();
      const sapi = await sapiOutputs();
      console.info(
        [
          "Output devices (the Player's):",
          ...devices.map(
            ({ id, name, isDefault }) =>
              `${isDefault ? "*" : " "} ${name} ${id}`,
          ),
          "SAPI's GetAudioOutputs, for comparison:",
          ...sapi.map(
            ({ id, name }) => `  ${name} (${name.length} characters) ${id}`,
          ),
        ].join("\n"),
      );

      expect(devices.length).toBeGreaterThan(0);
      expect(devices.filter(({ isDefault }) => isDefault)).toHaveLength(1);
      expect(new Set(devices.map(({ id }) => id)).size).toBe(devices.length);
    });

    it("plays a Phrase to its end on a chosen device, silently", async () => {
      const player = new WindowsPlayer();
      const devices = await player.devices();
      // The default itself, chosen by its id, when it is the only one.
      const device =
        other(devices) ?? devices.find(({ isDefault }) => isDefault)!;
      const audio = silence(1);

      const started = Date.now();
      await player.play(
        audio,
        { volume: 0, device: { id: device.id, name: device.name } },
        signal(),
      );

      console.info(
        `On ${device.name}: request to end ${Date.now() - started} ms of ${Math.round(wavDuration(audio) * 1000)} ms`,
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(800);
    });

    it("drops a Phrase for a device that is not here", async () => {
      await expect(
        new WindowsPlayer().play(
          silence(1),
          {
            volume: 0,
            device: {
              id: "\\\\?\\SWD#MMDEVAPI#{0.0.0.00000000}.{00000000-0000-0000-0000-000000000000}#{e6327cad-dcec-4949-ae8a-991e976a79d2}",
              name: "Gone Speakers",
            },
          },
          signal(),
        ),
      ).rejects.toMatchObject({
        kind: "device-missing",
        message: "Gone Speakers is not connected",
      });
    });

    it("stops a play at once when aborted", async () => {
      const { fallback } = await stores();
      const audio = await provider.synthesize(
        "A sentence long enough to be stopped in the middle of it.",
        fallback.id,
        { rate: 1 },
        signal(),
      );
      const abort = new AbortController();
      const player = new WindowsPlayer();

      const played = player.play(
        audio,
        { volume: 0, device: "system-default" },
        abort.signal,
      );
      setTimeout(
        () => abort.abort(new DOMException("Stopped", "AbortError")),
        1500,
      );
      await expect(played).rejects.toMatchObject({ name: "AbortError" });

      // The next play is not queued behind the stopped one.
      const started = Date.now();
      await player.play(
        await provider.synthesize("One", fallback.id, { rate: 2 }, signal()),
        { volume: 0, device: "system-default" },
        signal(),
      );
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it("starts the synthesizer again after it was killed", async () => {
      const children: ChildProcess[] = [];
      const restarting = new WindowsProvider(
        new PowerShellProcess(
          "synthesizer",
          synthesizerScript,
          (command, args) => {
            const child = spawn(command, args, {
              stdio: "pipe",
              windowsHide: true,
            });
            children.push(child);
            return child;
          },
        ),
      );
      const [voice] = await restarting.voices();

      children[0].kill();
      await new Promise((resolve) => children[0].once("exit", resolve));

      const audio = await restarting.synthesize(
        "Back",
        voice.id,
        { rate: 1 },
        signal(),
      );
      expect(children).toHaveLength(2);
      expect(wavDuration(audio)).toBeGreaterThan(0);
    });

    it("is unavailable under ConstrainedLanguage, with the reason", async () => {
      // As AppLocker or WDAC would have it: the session is put into
      // ConstrainedLanguage before the bootstrap runs.
      const constrained: Spawn = (command, args) => {
        const bootstrap = Buffer.from(args.at(-1)!, "base64").toString(
          "utf16le",
        );
        const locked = `$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'\n${bootstrap}`;
        return spawn(command, [...args.slice(0, -1), encodedCommand(locked)], {
          stdio: "pipe",
          windowsHide: true,
        });
      };
      const locked = new WindowsProvider(
        new PowerShellProcess("synthesizer", synthesizerScript, constrained),
      );

      await expect(locked.voices()).rejects.toMatchObject({
        kind: "unavailable",
        message:
          "PowerShell runs in ConstrainedLanguage mode — Text to Speech cannot run on this machine",
      });
    });
  },
);

/**
 * What happens when a device goes away, or the default output switches,
 * mid-phrase — by hand, as no test can unplug a device. In PowerShell:
 * `$env:TTS_DEVICE_CHANGES = "1"`, then
 * `pnpm --filter tts-plugin exec vitest run windows.integration`, and do what
 * each test prints. Nothing is heard: the plays are silence at volume 0.
 */
describe.runIf(
  process.platform === "win32" && process.env.TTS_DEVICE_CHANGES === "1",
)("Windows output device changes, by hand", { timeout: 120_000 }, () => {
  const signal = () => new AbortController().signal;

  /**
   * Plays 60 s of silence until it is cut off, noting when the device list
   * — from a second PowerShell, polled all along — first shows the change.
   */
  async function cutOff(
    device: "system-default" | Device,
    changed: (devices: Device[]) => boolean,
  ) {
    const player = new WindowsPlayer();
    const watcher = new WindowsPlayer();
    let watching = true;
    let seen = 0;
    void (async () => {
      while (watching) {
        const devices = await watcher.devices().catch(() => []);
        if (!seen && changed(devices)) seen = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })();
    const started = Date.now();
    const error = await player
      .play(
        silence(60),
        {
          volume: 0,
          device:
            device === "system-default"
              ? device
              : { id: device.id, name: device.name },
        },
        signal(),
      )
      .then(
        () => new Error("The play was not cut off"),
        (failure: unknown) => failure,
      );
    watching = false;
    const cut = Date.now();
    console.info(
      `Cut off ${cut - started} ms after the request` +
        (seen ? `, ${cut - seen} ms after the device list showed it` : "") +
        `: ${String(error)}`,
    );
    return { player, error };
  }

  it("cuts a Phrase off when its device goes away, and drops the next one for it", async () => {
    const devices = await new WindowsPlayer().devices();
    const device = other(devices);
    if (!device) {
      throw new Error("Needs a second output device, a virtual cable say");
    }
    console.info(
      `Within 30 s, unplug "${device.name}" or disable it (Control Panel > Sound > Playback, right-click > Disable).`,
    );

    const { player, error } = await cutOff(
      device,
      (now) => !now.some(({ id }) => id === device.id),
    );
    expect(error).toMatchObject({
      kind: "device-missing",
      message: `${device.name} was disconnected while speaking`,
    });

    await expect(
      player.play(
        silence(1),
        { volume: 0, device: { id: device.id, name: device.name } },
        signal(),
      ),
    ).rejects.toMatchObject({ kind: "device-missing" });
    console.info(`Plug in or enable "${device.name}" again.`);
  });

  it("cuts a Phrase on System default off when the default switches, and plays the next one on the new default", async () => {
    const devices = await new WindowsPlayer().devices();
    const before = devices.find(({ isDefault }) => isDefault);
    if (!before || devices.length < 2) {
      throw new Error("Needs a second output device, a virtual cable say");
    }
    console.info(
      `Within 30 s, switch Windows' output from "${before.name}" to another device (the volume flyout, or Control Panel > Sound > Playback > Set Default).`,
    );

    const { player, error } = await cutOff(
      "system-default",
      (now) => !now.some(({ id, isDefault }) => isDefault && id === before.id),
    );
    expect(error).toMatchObject({
      kind: "transient",
      message:
        "The system default output switched to another device while speaking",
    });

    await player.play(
      silence(1),
      { volume: 0, device: "system-default" },
      signal(),
    );
    const after = (await new WindowsPlayer().devices()).find(
      ({ isDefault }) => isDefault,
    );
    console.info(
      `The next Phrase played on System default, now "${after?.name}". Switch back to "${before.name}".`,
    );
  });
});
