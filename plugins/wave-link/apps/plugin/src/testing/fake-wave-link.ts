import { vi } from "vitest";
import { WaveLinkService } from "../wave-link/service";
import type { Notification, Rpc } from "../wave-link/rpc";

export function fixture() {
  return {
    channels: [
      {
        id: "music",
        name: "Music",
        level: 0.8,
        isMuted: false,
        mixes: [
          { id: "stream", level: 0.5, isMuted: false },
          { id: "personal", level: 0.7, isMuted: false },
        ],
      },
    ],
    mixes: [
      { id: "stream", name: "Stream", level: 1, isMuted: false },
      { id: "personal", name: "Personal", level: 0.9, isMuted: false },
    ],
  };
}

export class FakeWaveLink {
  data = fixture();
  appInfo: unknown = { appID: "EWL", interfaceRevision: 2 };
  online = true;
  calls: { method: string; params: unknown }[] = [];
  connections: Rpc[] = [];
  notify: Notification = () => undefined;
  beforeRequest?: (method: string) => Promise<void>;
  beforeReply?: (method: string) => Promise<void>;
  afterRead?: (method: string) => void;
  ignoreWrites = false;

  connect = async (
    _port: number,
    notify: Notification,
    disconnected: (message: string) => void,
  ): Promise<Rpc> => {
    if (!this.online) throw new Error("ECONNREFUSED");
    this.notify = notify;
    let connected = true;
    const rpc: Rpc = {
      get connected() {
        return connected;
      },
      close: () => {
        if (connected) {
          connected = false;
          disconnected("Wave Link disconnected.");
        }
      },
      request: async (method, params = {}, accept) => {
        if (!params || typeof params !== "object")
          throw new Error("Invalid params");
        this.calls.push({ method, params });
        await this.beforeRequest?.(method);
        if (!connected) throw new Error("Wave Link disconnected.");
        let result: unknown;
        if (method === "getApplicationInfo") result = this.appInfo;
        else if (method === "getChannels")
          result = { channels: structuredClone(this.data.channels) };
        else if (method === "getMixes")
          result = { mixes: structuredClone(this.data.mixes) };
        else if (method === "setChannel" || method === "setMix") {
          if (!this.ignoreWrites) {
            const patch = params as {
              id: string;
              level?: number;
              isMuted?: boolean;
              mixes?: { id: string; level?: number; isMuted?: boolean }[];
            };
            const entry =
              method === "setMix"
                ? this.data.mixes.find((entry) => entry.id === patch.id)
                : this.data.channels.find((entry) => entry.id === patch.id);
            if (!entry) throw new Error("Missing object.");
            if (patch.level !== undefined) entry.level = patch.level;
            if (patch.isMuted !== undefined) entry.isMuted = patch.isMuted;
            if (method === "setChannel" && patch.mixes) {
              const channel = this.data.channels.find(
                (entry) => entry.id === patch.id,
              )!;
              for (const mix of patch.mixes)
                Object.assign(
                  channel.mixes.find((entry) => entry.id === mix.id)!,
                  mix,
                );
            }
            notify(
              method === "setMix" ? "mixChanged" : "channelChanged",
              patch,
            );
          }
          result = {};
        } else throw new Error(`Unexpected RPC method: ${method}`);
        await this.beforeReply?.(method);
        if (!connected) throw new Error("Wave Link disconnected.");
        accept?.(result);
        this.afterRead?.(method);
        return result;
      },
    };
    this.connections.push(rpc);
    return rpc;
  };
}

export function harness() {
  const backend = new FakeWaveLink();
  const callbacks = {
    changed: vi.fn(),
    volumeChanged: vi.fn(),
    muteChanged: vi.fn(),
    connectionChanged: vi.fn(),
  };
  const service = new WaveLinkService(callbacks, {
    ports: async () => [1884],
    connect: backend.connect,
  });
  return { backend, callbacks, service };
}
