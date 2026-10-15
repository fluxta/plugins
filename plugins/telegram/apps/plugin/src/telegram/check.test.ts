import { describe, expect, it } from "vitest";

import { BotApiError, type CallBotApi } from "./bot-api";
import { checkChat, postingRefusal } from "./check";

const BOT = { id: 99, first_name: "Stream Bot", username: "stream_bot" };
const CHANNEL = { id: -1001, type: "channel", title: "My Stream" };

/** A Bot API that answers each method from a table — or throws its error. */
function fakeApi(answers: Record<string, unknown>): CallBotApi {
  return async <T>(_token: string, method: string): Promise<T> => {
    const answer = answers[method];
    if (answer instanceof Error) {
      throw answer;
    }
    return answer as T;
  };
}

describe("postingRefusal", () => {
  it("lets a creator post anywhere", () => {
    expect(postingRefusal(CHANNEL, { status: "creator" })).toBeUndefined();
  });

  it("needs a channel admin to have the right to post", () => {
    expect(
      postingRefusal(CHANNEL, {
        status: "administrator",
        can_post_messages: true,
      }),
    ).toBeUndefined();
    expect(
      postingRefusal(CHANNEL, {
        status: "administrator",
        can_post_messages: false,
      }),
    ).toMatch(/Post messages/);
  });

  it("refuses a plain member of a channel, not of a group", () => {
    expect(postingRefusal(CHANNEL, { status: "member" })).toMatch(/admin/);
    expect(
      postingRefusal({ id: -5, type: "supergroup" }, { status: "member" }),
    ).toBeUndefined();
  });

  it("refuses a bot that is restricted, gone or banned", () => {
    const group = { id: -5, type: "group" };
    expect(
      postingRefusal(group, { status: "restricted", can_send_messages: false }),
    ).toMatch(/restricted/);
    expect(postingRefusal(group, { status: "left" })).toMatch(/not a member/);
    expect(postingRefusal(group, { status: "kicked" })).toMatch(/not a member/);
  });
});

describe("checkChat", () => {
  it("is ready, with the chat's title, when the bot may post", async () => {
    const api = fakeApi({
      getMe: BOT,
      getChat: CHANNEL,
      getChatMember: { status: "administrator", can_post_messages: true },
    });

    await expect(checkChat(api, "t", "@my_stream")).resolves.toEqual({
      status: "ready",
      title: "My Stream",
    });
  });

  it("says when Telegram rejects the token", async () => {
    const api = fakeApi({
      getMe: new BotApiError("Unauthorized", 401, false),
    });

    await expect(checkChat(api, "t", "@my_stream")).resolves.toMatchObject({
      status: "error",
      message: expect.stringMatching(/token/),
    });
  });

  it("says when the bot cannot see the chat", async () => {
    const api = fakeApi({
      getMe: BOT,
      getChat: new BotApiError("Bad Request: chat not found", 400, false),
    });

    await expect(checkChat(api, "t", "@my_stream")).resolves.toMatchObject({
      status: "error",
      message: expect.stringMatching(/cannot see this chat/),
    });
  });

  it("reports why the bot may not post", async () => {
    const api = fakeApi({
      getMe: BOT,
      getChat: CHANNEL,
      getChatMember: { status: "member" },
    });

    await expect(checkChat(api, "t", "@my_stream")).resolves.toMatchObject({
      status: "error",
      message: expect.stringMatching(/admin/),
    });
  });

  it("does not ask a private chat about membership", async () => {
    const api = fakeApi({
      getMe: BOT,
      getChat: { id: 42, type: "private", first_name: "Alice" },
      getChatMember: new Error("must not be asked"),
    });

    await expect(checkChat(api, "t", "42")).resolves.toEqual({
      status: "ready",
      title: "Alice",
    });
  });

  it("passes on why Telegram could not be reached", async () => {
    const api = fakeApi({
      getMe: new BotApiError(
        "Telegram could not be reached: fetch failed",
        undefined,
        true,
      ),
    });

    await expect(checkChat(api, "t", "@my_stream")).resolves.toEqual({
      status: "error",
      message: "Telegram could not be reached: fetch failed",
    });
  });
});
