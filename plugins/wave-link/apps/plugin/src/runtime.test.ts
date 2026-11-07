import type {
  Plugin,
  Source,
  Options,
  StandaloneAction,
} from "@fluxta/sdk/api";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pluginMessageSchema } from "wave-link-protocol";
import { registerPlugin } from "./runtime";
import { FakeWaveLink } from "./testing/fake-wave-link";
import { WaveLinkService } from "./wave-link/service";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("registers the manifest contract and carries actions, events, values and editor snapshots through the real runtime", async () => {
  const host = {
    registerAction: vi.fn(),
    registerSource: vi.fn(),
    registerOptions: vi.fn(),
    sendToEditor: vi.fn(),
    setConnections: vi.fn(),
    emitEvent: vi.fn(),
    onReceiveFromEditor: vi.fn(),
  };
  const backend = new FakeWaveLink();
  const service = registerPlugin(
    host as unknown as Plugin,
    (callbacks) =>
      new WaveLinkService(callbacks, {
        ports: async () => [1884],
        connect: backend.connect,
      }),
  );
  const manifest = JSON.parse(
    readFileSync(new URL("../../../manifest.json", import.meta.url), "utf8"),
  );
  const actions = host.registerAction.mock.calls.map(
    ([action]) => action as StandaloneAction,
  );
  const sources = host.registerSource.mock.calls.map(
    ([source]) => source as Source,
  );
  const options = host.registerOptions.mock.calls.map(
    ([option]) => option as Options,
  );
  expect(actions.map((action) => action.type).sort()).toEqual(
    manifest.actions.map((action: { type: string }) => action.type).sort(),
  );
  expect(sources.map((source) => source.key).sort()).toEqual(
    manifest.sources.map((source: { key: string }) => source.key).sort(),
  );
  await service.start();
  const action = actions.find((action) => action.type === "set-volume")!;
  expect(
    await action.onTrigger!({
      uuid: "example",
      settings: {
        targetKind: "channelMix",
        channelId: "music",
        mixId: "stream",
        volumePercent: "25",
      },
    }),
  ).toEqual({ success: true, error: "" });
  const mute = actions.find((action) => action.type === "set-mute")!;
  expect(
    await mute.onTrigger!({
      uuid: "example",
      settings: { targetKind: "mix", mixId: "stream", mode: "mute" },
    }),
  ).toEqual({ success: true, error: "" });
  const source = sources.find((source) => source.key === "channelMixVolume")!;
  expect(
    await source.resolve({
      itemId: 0,
      args: { channelId: "music", mixId: "stream" },
    }),
  ).toBe(25);
  expect(
    await options
      .find((entry) => entry.key === "channels")!
      .resolve({ args: {} }),
  ).toEqual([{ value: "music", label: "Music" }]);
  for (const [type, payload] of host.emitEvent.mock.calls) {
    const declaration = manifest.events.find(
      (event: { type: string }) => event.type === type,
    );
    expect(declaration).toBeDefined();
    expect(Object.keys(payload).sort()).toEqual(
      declaration.fields.map((field: { key: string }) => field.key).sort(),
    );
  }
  expect(new Set(host.emitEvent.mock.calls.map(([type]) => type))).toEqual(
    new Set(manifest.events.map((event: { type: string }) => event.type)),
  );
  const editorReceive = host.onReceiveFromEditor.mock.calls[0][0];
  host.sendToEditor.mockClear();
  editorReceive({ event: "set-volume", volumePercent: 100 });
  expect(host.sendToEditor).not.toHaveBeenCalled();
  editorReceive({ event: "get-status" });
  const message = pluginMessageSchema.parse(host.sendToEditor.mock.calls[0][0]);
  expect(message.status.status).toBe("connected");
  expect(host.setConnections).toHaveBeenLastCalledWith([
    { id: "local", title: "Wave Link", connected: true },
  ]);
  service.stop();
});
