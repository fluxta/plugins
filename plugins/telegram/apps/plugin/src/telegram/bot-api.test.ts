import { describe, expect, it } from "vitest";

import { BotApiError, createBotApi } from "./bot-api";

type Reply = { status: number; body: unknown } | { networkError: string };

/**
 * A Bot API stand-in: answers each call with the next reply in line, keeps a
 * virtual clock that `sleep` advances, and records what was asked.
 */
function fakeTelegram(replies: Reply[]) {
  let now = 0;
  const calls: { url: string; body: unknown }[] = [];
  const sleeps: number[] = [];

  const api = createBotApi({
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      const reply = replies.shift();
      if (!reply) {
        throw new Error("no reply queued");
      }
      if ("networkError" in reply) {
        throw new TypeError(reply.networkError);
      }
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    },
  });

  return { api, calls, sleeps };
}

const ok = (result: unknown): Reply => ({
  status: 200,
  body: { ok: true, result },
});

const failure = (
  code: number,
  description: string,
  parameters?: unknown,
): Reply => ({
  status: code,
  body: { ok: false, error_code: code, description, parameters },
});

describe("createBotApi", () => {
  it("posts the parameters to the method and returns its result", async () => {
    const { api, calls } = fakeTelegram([ok({ message_id: 7 })]);

    const result = await api<{ message_id: number }>(
      "123:secret",
      "sendMessage",
      { chat_id: "@my_stream", text: "live" },
      { deadlineMs: 10_000 },
    );

    expect(result).toEqual({ message_id: 7 });
    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bot123:secret/sendMessage",
        body: { chat_id: "@my_stream", text: "live" },
      },
    ]);
  });

  it("waits as long as a 429 says, then tries again", async () => {
    const { api, sleeps } = fakeTelegram([
      failure(429, "Too Many Requests: retry after 3", { retry_after: 3 }),
      ok(true),
    ]);

    await expect(api("t", "getMe", {}, { deadlineMs: 10_000 })).resolves.toBe(
      true,
    );
    expect(sleeps).toEqual([3_000]);
  });

  it("retries a server error and a network failure with a growing backoff", async () => {
    const { api, sleeps } = fakeTelegram([
      failure(502, "Bad Gateway"),
      { networkError: "fetch failed" },
      ok(true),
    ]);

    await expect(api("t", "getMe", {}, { deadlineMs: 10_000 })).resolves.toBe(
      true,
    );
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("gives up at once on a request Telegram refuses", async () => {
    const { api, calls } = fakeTelegram([
      failure(400, "Bad Request: chat not found"),
    ]);

    const error = await api("t", "getChat", {}, { deadlineMs: 10_000 }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(BotApiError);
    expect(error).toMatchObject({
      code: 400,
      transient: false,
      message: "Bad Request: chat not found",
    });
    expect(calls).toHaveLength(1);
  });

  it("stops retrying when the next attempt would pass the deadline", async () => {
    const { api, calls } = fakeTelegram([
      failure(429, "Too Many Requests: retry after 30", { retry_after: 30 }),
    ]);

    await expect(
      api("t", "sendMessage", {}, { deadlineMs: 25_000 }),
    ).rejects.toMatchObject({ code: 429, transient: true });
    expect(calls).toHaveLength(1);
  });

  it("treats an answer that is not JSON as a transient failure", async () => {
    let now = 0;
    const responses = [
      new Response("<html>502</html>", { status: 502 }),
      new Response(JSON.stringify({ ok: true, result: 1 }), { status: 200 }),
    ];
    const api = createBotApi({
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      fetch: async () => responses.shift()!,
    });

    await expect(api("t", "getMe", {}, { deadlineMs: 10_000 })).resolves.toBe(
      1,
    );
  });

  it("never puts the token in an error message", async () => {
    const { api } = fakeTelegram([{ networkError: "fetch failed" }]);

    const error = (await api("123:secret", "getMe", {}, { deadlineMs: 0 }).then(
      () => undefined,
      (caught: unknown) => caught,
    )) as Error;

    expect(error.message).not.toContain("secret");
  });
});
