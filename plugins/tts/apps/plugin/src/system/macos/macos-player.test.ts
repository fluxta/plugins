import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlayerError } from "../../speech/player";
import { encodeWav } from "../../speech/wav";
import { FakeEngine } from "../fake-engine";
import { MacosPlayer } from "./macos-player";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "tts-player-test-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(folder, { recursive: true, force: true });
});

function setup() {
  const engine = new FakeEngine();
  const player = new MacosPlayer(engine, async () => folder);
  return { engine, player };
}

/** Waits until the player has written its file and asked the script to play. */
async function requested(engine: FakeEngine) {
  await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
  return engine.requests[0];
}

const second = encodeWav(new Float32Array(22_050), 22_050);
const SYSTEM_DEFAULT = "system-default";

describe("MacosPlayer", () => {
  it("plays the audio from a file, and removes the file once it has ended", async () => {
    const { engine, player } = setup();
    const onStarted = vi.fn();

    const played = player.play(
      second,
      { volume: 0.4, device: SYSTEM_DEFAULT, onStarted },
      new AbortController().signal,
    );
    const { id, message } = await requested(engine);

    // No device: the script plays on the default output as it stands.
    expect(message).toEqual({ op: "play", path: message.path, volume: 0.4 });
    const path = message.path as string;
    expect(path.startsWith(folder)).toBe(true);
    expect(new Uint8Array(readFileSync(path))).toEqual(second);

    expect(onStarted).not.toHaveBeenCalled();
    engine.reply(id, { started: true });
    expect(onStarted).toHaveBeenCalledTimes(1);
    engine.reply(id, { ended: true });
    await played;

    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(existsSync(path)).toBe(false);
    expect(engine.listening).toBe(0);
  });

  it("plays on a chosen device by its UID, naming it for the script's reasons", async () => {
    const { engine, player } = setup();

    void player.play(
      second,
      {
        volume: 1,
        device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      },
      new AbortController().signal,
    );
    const { message } = await requested(engine);

    expect(message).toMatchObject({
      op: "play",
      device: "BlackHole2ch_UID",
      name: "BlackHole 2ch",
    });
  });

  it("lists the devices the script finds", async () => {
    const { engine, player } = setup();
    const devices = [
      { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      {
        id: "BuiltInSpeakerDevice",
        name: "Mac mini Speakers",
        isDefault: true,
      },
    ];

    const listed = player.devices();
    const [{ id, message }] = engine.requests;
    expect(message).toEqual({ op: "devices" });
    engine.reply(id, { devices });

    expect(await listed).toEqual(devices);
    expect(engine.listening).toBe(0);
  });

  it("says why it cannot list the devices", async () => {
    const { engine, player } = setup();

    const listed = player.devices();
    engine.reply(engine.requests[0].id, {
      error: {
        kind: "unavailable",
        reason: "The player cannot run on this Mac",
      },
    });

    await expect(listed).rejects.toEqual(
      new PlayerError("unavailable", "The player cannot run on this Mac"),
    );
  });

  it("passes on the script's failures with their kind", async () => {
    const { engine, player } = setup();

    const played = player.play(
      second,
      { volume: 1, device: SYSTEM_DEFAULT },
      new AbortController().signal,
    );
    const { id } = await requested(engine);
    engine.reply(id, { started: true });
    engine.reply(id, {
      error: {
        kind: "device-missing",
        reason: "BlackHole 2ch was disconnected while speaking",
      },
    });

    await expect(played).rejects.toEqual(
      new PlayerError(
        "device-missing",
        "BlackHole 2ch was disconnected while speaking",
      ),
    );
    await expect(played).rejects.toHaveProperty("kind", "device-missing");
    expect(await readdir(folder)).toEqual([]);
  });

  it("stops the sound when aborted", async () => {
    const { engine, player } = setup();
    const abort = new AbortController();

    const played = player.play(
      second,
      { volume: 1, device: SYSTEM_DEFAULT },
      abort.signal,
    );
    const { id } = await requested(engine);
    engine.reply(id, { started: true });
    abort.abort(new DOMException("Stopped", "AbortError"));

    await expect(played).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.notified).toEqual([{ op: "stop", id }]);
    expect(engine.listening).toBe(0);
    expect(await readdir(folder)).toEqual([]);
  });

  it("stops a sound that never reports its end, so the Speech Queue goes on", async () => {
    const { engine, player } = setup();

    const played = player.play(
      second,
      { volume: 1, device: SYSTEM_DEFAULT },
      new AbortController().signal,
    );
    const { id } = await requested(engine);
    vi.useFakeTimers();
    engine.reply(id, { started: true });
    const outcome = played.catch((error: unknown) => error);

    vi.advanceTimersByTime(1000 + 4999);
    expect(engine.notified).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(await outcome).toMatchObject({ kind: "transient" });
    expect(engine.notified).toEqual([{ op: "stop", id }]);
  });

  it("does not report a start for a play that fails before its sound", async () => {
    const { engine, player } = setup();
    const onStarted = vi.fn();

    const played = player.play(
      second,
      { volume: 1, device: SYSTEM_DEFAULT, onStarted },
      new AbortController().signal,
    );
    const { id } = await requested(engine);
    engine.reply(id, {
      error: {
        kind: "unavailable",
        reason: "The output device cannot be opened",
      },
    });

    await expect(played).rejects.toMatchObject({ kind: "unavailable" });
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("does not start a play that is already aborted", async () => {
    const { engine, player } = setup();
    const abort = new AbortController();
    abort.abort(new DOMException("Stopped", "AbortError"));

    await expect(
      player.play(second, { volume: 1, device: SYSTEM_DEFAULT }, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.requests).toHaveLength(0);
  });
});
