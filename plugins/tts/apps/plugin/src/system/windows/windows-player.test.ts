import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeWav } from "../../speech/wav";
import { FakeEngine } from "../fake-engine";
import { WindowsPlayer } from "./windows-player";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "tts-windows-player-test-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function setup() {
  const engine = new FakeEngine();
  return { engine, player: new WindowsPlayer(engine, async () => folder) };
}

const second = encodeWav(new Float32Array(22_050), 22_050);
const signal = () => new AbortController().signal;

const SPEAKERS =
  "\\\\?\\SWD#MMDEVAPI#{0.0.0.00000000}.{2f7e6b3c-1d4a-4e0b-9c8d-5a6b7c8d9e0f}#{e6327cad-dcec-4949-ae8a-991e976a79d2}";
const CABLE =
  "\\\\?\\SWD#MMDEVAPI#{0.0.0.00000000}.{8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d}#{e6327cad-dcec-4949-ae8a-991e976a79d2}";

describe("WindowsPlayer", () => {
  it("lists the endpoints the script finds, the default among them", async () => {
    const { engine, player } = setup();
    const devices = [
      { id: SPEAKERS, name: "Speakers (Realtek(R) Audio)", isDefault: true },
      { id: CABLE, name: "CABLE Input (VB-Audio Virtual Cable)" },
    ];

    const listed = player.devices();
    const [{ id, message }] = engine.requests;
    expect(message).toEqual({ op: "devices" });
    engine.reply(id, { devices });

    expect(await listed).toEqual(devices);
  });

  it("plays on the default output as it stands at the Phrase's volume, and reports its start and end", async () => {
    const { engine, player } = setup();
    const onStarted = vi.fn();

    const played = player.play(
      second,
      { volume: 0.4, device: "system-default", onStarted },
      signal(),
    );
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
    const [{ id, message }] = engine.requests;
    engine.reply(id, { started: true });
    engine.reply(id, { ended: true });

    await played;
    expect(message).toEqual({
      op: "play",
      path: expect.stringMatching(/\.wav$/),
      volume: 0.4,
    });
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it("plays on a chosen device by its endpoint id, naming it for the script's reasons", async () => {
    const { engine, player } = setup();

    void player.play(
      second,
      {
        volume: 1,
        device: { id: CABLE, name: "CABLE Input (VB-Audio Virtual Cable)" },
      },
      signal(),
    );
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));

    expect(engine.requests[0].message).toMatchObject({
      op: "play",
      device: CABLE,
      name: "CABLE Input (VB-Audio Virtual Cable)",
    });
  });

  it("passes on a device that went away mid-phrase as device-missing", async () => {
    const { engine, player } = setup();

    const played = player.play(
      second,
      {
        volume: 1,
        device: { id: CABLE, name: "CABLE Input (VB-Audio Virtual Cable)" },
      },
      signal(),
    );
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
    const [{ id }] = engine.requests;
    engine.reply(id, { started: true });
    engine.reply(id, {
      error: {
        kind: "device-missing",
        reason:
          "CABLE Input (VB-Audio Virtual Cable) was disconnected while speaking",
      },
    });

    await expect(played).rejects.toMatchObject({
      kind: "device-missing",
      message:
        "CABLE Input (VB-Audio Virtual Cable) was disconnected while speaking",
    });
  });
});
