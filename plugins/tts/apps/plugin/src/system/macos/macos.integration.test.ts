import { spawn, type ChildProcess } from "node:child_process";

import { describe, expect, it } from "vitest";

import { PlayerError } from "../../speech/player";
import { wavDuration } from "../../speech/wav";
import { JxaProcess } from "./jxa-process";
import { MacosPlayer } from "./macos-player";
import { MacosProvider } from "./macos-provider";
import playerScript from "./player.jxa";
import synthesizerScript from "./synthesizer.jxa";

/**
 * The JXA scripts against the real AVFAudio. Nothing is heard: every play
 * runs at volume 0.
 */
describe.runIf(process.platform === "darwin")("macOS engines", () => {
  const signal = () => new AbortController().signal;

  it("lists voices with the OS's default among them, and speaks with it", async () => {
    const provider = new MacosProvider();

    const voices = await provider.voices();
    const fallback = voices.find(({ isDefault }) => isDefault);
    expect(voices.length).toBeGreaterThan(0);
    expect(fallback).toBeDefined();

    const audio = await provider.synthesize(
      "Hello, chat!",
      fallback!.id,
      { rate: 1 },
      signal(),
    );
    expect(wavDuration(audio)).toBeGreaterThan(0.3);
  });

  it("reports a voice that is not here", async () => {
    const provider = new MacosProvider();

    await expect(
      provider.synthesize("Hi", "no.such.voice", { rate: 1 }, signal()),
    ).rejects.toMatchObject({ kind: "voice-missing" });
  });

  it("plays a Phrase to its end, silently", async () => {
    const provider = new MacosProvider();
    const player = new MacosPlayer();
    const [voice] = await provider.voices();
    const audio = await provider.synthesize(
      "One two",
      voice.id,
      { rate: 2 },
      signal(),
    );

    const requested = Date.now();
    let started = 0;
    await player.play(
      audio,
      {
        volume: 0,
        device: "system-default",
        onStarted: () => (started = Date.now()),
      },
      signal(),
    );
    const ended = Date.now();

    expect(started).toBeGreaterThanOrEqual(requested);
    expect(ended - started).toBeGreaterThanOrEqual(
      wavDuration(audio) * 1000 - 50,
    );
  });

  it("lists the output devices, the default output among them", async () => {
    const devices = await new MacosPlayer().devices();

    expect(devices.filter(({ isDefault }) => isDefault)).toHaveLength(1);
    expect(new Set(devices.map(({ name }) => name)).size).toBe(devices.length);
  });

  it("plays on a device chosen by its UID, and reports one that is not here", async () => {
    const provider = new MacosProvider();
    const player = new MacosPlayer();
    const [voice] = await provider.voices();
    const audio = await provider.synthesize(
      "One",
      voice.id,
      { rate: 2 },
      signal(),
    );
    // The default output, chosen by its UID rather than followed.
    const chosen = (await player.devices()).find(({ isDefault }) => isDefault)!;

    await player.play(
      audio,
      { volume: 0, device: { id: chosen.id, name: chosen.name } },
      signal(),
    );
    await expect(
      player.play(
        audio,
        { volume: 0, device: { id: "no-such-device", name: "Gone 2ch" } },
        signal(),
      ),
    ).rejects.toEqual(
      new PlayerError("device-missing", "Gone 2ch is not connected"),
    );
  });

  it("starts the synthesizer again after it was killed", async () => {
    const children: ChildProcess[] = [];
    const provider = new MacosProvider(
      new JxaProcess("synthesizer", synthesizerScript, (command, args) => {
        const child = spawn(command, args, { stdio: "pipe" });
        children.push(child);
        return child;
      }),
    );
    const [voice] = await provider.voices();

    children[0].kill("SIGKILL");
    await new Promise((resolve) => children[0].once("exit", resolve));

    const audio = await provider.synthesize(
      "Back",
      voice.id,
      { rate: 1 },
      signal(),
    );
    expect(children).toHaveLength(2);
    expect(wavDuration(audio)).toBeGreaterThan(0);
  });

  it("stops a play at once when aborted", async () => {
    const provider = new MacosProvider();
    const player = new MacosPlayer(new JxaProcess("player", playerScript));
    const [voice] = await provider.voices();
    const audio = await provider.synthesize(
      "A sentence long enough to be stopped in the middle of it.",
      voice.id,
      { rate: 1 },
      signal(),
    );
    const abort = new AbortController();

    const played = player.play(
      audio,
      { volume: 0, device: "system-default" },
      abort.signal,
    );
    setTimeout(
      () => abort.abort(new DOMException("Stopped", "AbortError")),
      300,
    );
    const started = Date.now();

    await expect(played).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
