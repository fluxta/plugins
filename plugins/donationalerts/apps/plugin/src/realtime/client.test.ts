import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCentrifugeClient,
  type PrivateSubscribe,
  type RealtimeClient,
} from "./client";

const CHANNEL = "$alerts:donation_10111687";

type Command = { id: number; method?: number };
type MessageHandler = ((event: MessageEvent) => void) | null;

/** Only the transport is fake: replies go through centrifuge-js's real decoder. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 0;
  commands: Command[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  private messageHandler: MessageHandler = null;
  private closeEvent = { code: 1000, reason: "" };

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  get onmessage(): MessageHandler {
    return this.messageHandler;
  }

  set onmessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  open() {
    this.readyState = this.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.commands.push(...data.split("\n").map((line) => JSON.parse(line)));
  }

  receive(data: string) {
    this.messageHandler?.(new MessageEvent("message", { data }));
  }

  close = vi.fn((code = 1000, reason = "") => {
    this.readyState = 2;
    this.closeEvent = { code, reason };
  });

  finishClose() {
    this.readyState = 3;
    this.onclose?.(this.closeEvent);
  }
}

const clients: RealtimeClient[] = [];

function setup() {
  const authorize = vi.fn<PrivateSubscribe>(({ data }, respond) => {
    respond({
      status: 200,
      data: {
        channels: data.channels.map((channel) => ({
          channel,
          token: "channel-token",
        })),
      },
    });
  });
  const client = createCentrifugeClient(authorize);
  clients.push(client);
  const publish = vi.fn();
  const subscribe = vi.fn();
  const disconnect = vi.fn();
  client.on("disconnect", disconnect);
  client.subscribe(CHANNEL, { publish, subscribe, error: vi.fn() });
  client.setToken("socket-token");
  client.connect();
  return {
    client,
    authorize,
    publish,
    subscribe,
    disconnect,
    socket: FakeWebSocket.instances[0]!,
  };
}

async function connect(socket: FakeWebSocket, clientId = "client-1") {
  socket.open();
  socket.receive(
    JSON.stringify({
      id: socket.commands[0]!.id,
      result: { client: clientId },
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  const command = socket.commands.find(({ method }) => method === 1)!;
  expect(command).toBeDefined();
  socket.receive(JSON.stringify({ id: command.id, result: {} }));
  await vi.advanceTimersByTimeAsync(0);
}

function publication(id: number) {
  return JSON.stringify({
    result: { channel: CHANNEL, data: { data: { id }, offset: id } },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  FakeWebSocket.instances = [];
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createCentrifugeClient", () => {
  it("reconnects and resubscribes after malformed JSON instead of throwing", async () => {
    const { socket, authorize, subscribe, disconnect, publish } = setup();
    await connect(socket);
    expect(subscribe).toHaveBeenCalledTimes(1);

    // The same error and position as the reported production crash.
    expect(() => socket.receive('{"id":10}{}')).not.toThrow();
    expect(socket.close).toHaveBeenCalledWith(4000, "Invalid realtime message");
    socket.finishClose();
    expect(disconnect).toHaveBeenCalledWith({
      reason: "Invalid realtime message",
      reconnect: true,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const reconnected = FakeWebSocket.instances[1]!;
    await connect(reconnected, "client-2");
    expect(authorize).toHaveBeenLastCalledWith(
      { data: { client: "client-2", channels: [CHANNEL] } },
      expect.any(Function),
    );
    expect(subscribe).toHaveBeenCalledTimes(2);

    reconnected.receive(publication(7));
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 7 } }),
    );
  });

  it("retries when malformed JSON arrives before the initial handshake completes", async () => {
    const { socket, subscribe } = setup();
    socket.open();

    expect(() => socket.receive('{"id":10}{}')).not.toThrow();
    expect(socket.close).toHaveBeenCalledOnce();
    socket.finishClose();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    await connect(FakeWebSocket.instances[1]!);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it.each(["\n", "\r\n"])(
    "delivers batched replies with %j separators in order",
    async (separator) => {
      const { socket, publish } = setup();
      await connect(socket);

      socket.receive([publication(1), publication(2), ""].join(separator));
      await vi.advanceTimersByTimeAsync(0);

      expect(publish.mock.calls.map(([ctx]) => ctx.data.id)).toEqual([1, 2]);
      expect(socket.close).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    },
  );

  it("does not log message contents or accept further messages on a failed transport", async () => {
    const { socket, publish } = setup();
    await connect(socket);

    socket.receive("private-token donor-name donation-message");
    socket.receive(publication(1));
    await vi.advanceTimersByTimeAsync(0);

    expect(publish).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain("reconnecting");
    for (const secret of ["private-token", "donor-name", "donation-message"]) {
      expect(logged).not.toContain(secret);
    }
  });
});
