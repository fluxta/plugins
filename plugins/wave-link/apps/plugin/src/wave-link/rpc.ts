import WebSocket from "ws";

export type Notification = (method: string, params: unknown) => void;
export type Rpc = {
  readonly connected: boolean;
  request(
    method: string,
    params?: unknown,
    accept?: (value: unknown) => void,
  ): Promise<unknown>;
  close(): void;
};
type Pending = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  accept?: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Only the local endpoint is accepted; every handshake and call is bounded. */
export function connectRpc(
  port: number,
  notify: Notification,
  disconnected: (message: string) => void,
  signal?: AbortSignal,
  timeoutMs = 2000,
): Promise<Rpc> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      origin: "streamdeck://",
      handshakeTimeout: 500,
      maxPayload: 2 * 1024 * 1024,
    });
    const client = new RpcClient(socket, notify, disconnected, timeoutMs);
    const abort = () => client.close();
    socket.once("open", () => {
      if (signal?.aborted) {
        client.close();
        reject(new Error("Connection cancelled."));
      } else resolve(client);
    });
    socket.once("error", reject);
    socket.once("close", () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Wave Link closed the connection."));
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export class RpcClient implements Rpc {
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private ended = false;

  get connected(): boolean {
    return !this.ended && this.socket.readyState === WebSocket.OPEN;
  }

  constructor(
    private readonly socket: Pick<
      WebSocket,
      "on" | "send" | "terminate" | "readyState"
    >,
    private readonly notify: Notification,
    private readonly disconnected: (message: string) => void,
    private readonly timeoutMs = 2000,
  ) {
    socket.on("message", (bytes) => this.receive(bytes.toString()));
    socket.on("close", () => this.end("Wave Link disconnected."));
    socket.on("error", (error) => this.end(error.message));
  }

  request(
    method: string,
    params: unknown = {},
    accept?: (value: unknown) => void,
  ): Promise<unknown> {
    if (this.ended || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Wave Link is not connected."));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `${method} timed out. The command was not retried; its state may have changed.`,
          ),
        );
        this.close();
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer, accept });
      try {
        this.socket.send(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        );
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
        this.close();
      }
    });
  }

  close(): void {
    this.end("Wave Link disconnected.");
    this.socket.terminate();
  }

  private end(message: string): void {
    if (this.ended) return;
    this.ended = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    }
    this.pending.clear();
    this.disconnected(message);
  }

  private receive(text: string): void {
    if (this.ended) return;
    let frame: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid RPC frame.");
      frame = value as Record<string, unknown>;
      if (frame.jsonrpc !== "2.0") throw new Error("Unsupported RPC envelope.");
    } catch {
      this.end("Wave Link sent an invalid JSON-RPC message.");
      this.socket.terminate();
      return;
    }

    if (typeof frame.id === "number") {
      const request = this.pending.get(frame.id);
      if (!request) return;
      this.pending.delete(frame.id);
      clearTimeout(request.timer);
      if (frame.error) {
        const error = frame.error as { message?: unknown; code?: unknown };
        request.reject(
          new Error(
            `${request.method}: ${typeof error.message === "string" ? error.message : "RPC request failed"} (${String(error.code)})`,
          ),
        );
      } else if (Object.hasOwn(frame, "result")) {
        try {
          // Apply reads synchronously, before the next notification in a frame
          // batch. Applying in an await continuation can overwrite a newer patch.
          request.accept?.(frame.result);
          request.resolve(frame.result);
        } catch (error) {
          request.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      } else request.reject(new Error("Wave Link returned no RPC result."));
    } else if (typeof frame.method === "string") {
      try {
        this.notify(frame.method, frame.params);
      } catch {
        this.end("Wave Link sent incompatible state. Reconnecting…");
        this.socket.terminate();
      }
    }
  }
}
