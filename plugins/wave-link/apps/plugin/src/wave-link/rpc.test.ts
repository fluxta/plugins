import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RpcClient } from "./rpc";

class Socket extends EventEmitter {
  readyState = 1;
  sent: { id: number; method: string }[] = [];
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  terminate() {
    if (this.readyState !== 3) {
      this.readyState = 3;
      this.emit("close");
    }
  }
  frame(value: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(value)));
  }
}
function setup() {
  const socket = new Socket();
  const notify = vi.fn();
  const disconnected = vi.fn();
  const rpc = new RpcClient(
    socket as unknown as ConstructorParameters<typeof RpcClient>[0],
    notify,
    disconnected,
    100,
  );
  return { socket, rpc, notify, disconnected };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("correlates out-of-order replies and ignores late/unknown request ids", async () => {
  const { socket, rpc } = setup();
  const first = rpc.request("getChannels");
  const second = rpc.request("getMixes");
  socket.frame({ jsonrpc: "2.0", id: 999, result: {} });
  socket.frame({ jsonrpc: "2.0", id: 2, result: { mixes: [] } });
  socket.frame({ jsonrpc: "2.0", id: 1, result: { channels: [] } });
  expect(await first).toEqual({ channels: [] });
  expect(await second).toEqual({ mixes: [] });
  rpc.close();
});

it("applies a read before the next notification in the same incoming batch", async () => {
  const { socket, rpc, notify } = setup();
  const order: string[] = [];
  notify.mockImplementation(() => order.push("notification"));
  const read = rpc.request("getChannels", {}, () => order.push("snapshot"));
  socket.frame({ jsonrpc: "2.0", id: 1, result: { channels: [] } });
  socket.frame({
    jsonrpc: "2.0",
    method: "channelChanged",
    params: { id: "music" },
  });
  await read;
  expect(order).toEqual(["snapshot", "notification"]);
  rpc.close();
});

it("times out, rejects every pending request and disconnects exactly once", async () => {
  const { rpc, disconnected } = setup();
  const first = expect(rpc.request("setChannel")).rejects.toThrow(
    "not retried",
  );
  const second = expect(rpc.request("getMixes")).rejects.toThrow(
    "disconnected",
  );
  await vi.advanceTimersByTimeAsync(100);
  await Promise.all([first, second]);
  expect(disconnected).toHaveBeenCalledTimes(1);
  expect(rpc.connected).toBe(false);
  await expect(rpc.request("getChannels")).rejects.toThrow("not connected");
});

it("rejects RPC errors without pretending they succeeded", async () => {
  const { rpc, socket } = setup();
  const failure = expect(rpc.request("setChannel")).rejects.toThrow(
    "Method not found",
  );
  socket.frame({
    jsonrpc: "2.0",
    id: 1,
    error: { code: -32601, message: "Method not found" },
  });
  await failure;
  expect(rpc.connected).toBe(true);
  rpc.close();
});

it("rejects pending calls and closes malformed protocol frames", async () => {
  const { rpc, socket, disconnected } = setup();
  const failure = expect(rpc.request("getChannels")).rejects.toThrow(
    "invalid JSON-RPC",
  );
  socket.emit("message", Buffer.from("not json"));
  await failure;
  expect(disconnected).toHaveBeenCalledTimes(1);
});
