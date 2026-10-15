import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SendMessageSettings } from "telegram-protocol";
import { describe, expect, it, vi } from "vitest";

import { ChatsStore } from "../chats/store";
import { BotApiError, type CallBotApi } from "../telegram/bot-api";
import { SendMessageAction } from "./send-message";

const TOKEN = "123456789:AAH4r0bt0k3n-_ExampleExampleExample";

async function storeWith(...names: string[]): Promise<ChatsStore> {
  const store = new ChatsStore({ setPluginSettings: async () => {} });
  for (const [index, name] of names.entries()) {
    await store.create(`c${index + 1}`, {
      name,
      chatId: `@${name.toLowerCase()}_chat`,
      token: TOKEN,
    });
  }
  return store;
}

function trigger(action: SendMessageAction, settings: Record<string, unknown>) {
  return action.onTrigger(
    new StandaloneTriggerContext<SendMessageSettings>(
      "action-1",
      settings as SendMessageSettings,
    ),
  );
}

function recordingApi(answer: unknown = { message_id: 4812, text: "Live!" }) {
  const calls: Array<{ token: string; method: string; params: unknown }> = [];
  const api: CallBotApi = async <T>(
    token: string,
    method: string,
    params: Record<string, unknown>,
  ) => {
    calls.push({ token, method, params });
    if (answer instanceof Error) {
      throw answer;
    }
    return answer as T;
  };
  return { api, calls };
}

describe("SendMessageAction", () => {
  it("posts plain text to the Chat and produces the message's id and text", async () => {
    const { api, calls } = recordingApi();
    const action = new SendMessageAction(await storeWith("Stream"), api);

    const produced = await trigger(action, { chat: "c1", text: "Live!" });

    expect(calls).toEqual([
      {
        token: TOKEN,
        method: "sendMessage",
        params: { chat_id: "@stream_chat", text: "Live!" },
      },
    ]);
    expect(produced).toEqual({ messageId: 4812, text: "Live!" });
  });

  it("posts to the sole Chat when the settings name none", async () => {
    const { api, calls } = recordingApi();
    const action = new SendMessageAction(await storeWith("Stream"), api);

    await trigger(action, { text: "Live!" });

    expect(calls).toHaveLength(1);
  });

  it("sends a substituted value verbatim — no markup is parsed", async () => {
    const { api, calls } = recordingApi({
      message_id: 1,
      text: "<b>Tom & Jerry</b>",
    });
    const action = new SendMessageAction(await storeWith("Stream"), api);

    await trigger(action, { chat: "c1", text: "<b>Tom & Jerry</b>" });

    expect(calls[0]?.params).toEqual({
      chat_id: "@stream_chat",
      text: "<b>Tom & Jerry</b>",
    });
  });

  it("sends a number the host substituted for the whole text as its text", async () => {
    const { api, calls } = recordingApi({ message_id: 1, text: "42" });
    const action = new SendMessageAction(await storeWith("Stream"), api);

    await trigger(action, { chat: "c1", text: 42 });

    expect(calls[0]?.params).toMatchObject({ text: "42" });
  });

  it("produces no values and calls nothing without a Chat or a text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { api, calls } = recordingApi();
    const action = new SendMessageAction(
      await storeWith("Stream", "Backup"),
      api,
    );

    expect(await trigger(action, { text: "Live!" })).toEqual({});
    expect(await trigger(action, { chat: "gone", text: "Live!" })).toEqual({});
    expect(await trigger(action, { chat: "c1", text: "  " })).toEqual({});
    expect(calls).toEqual([]);
    warn.mockRestore();
  });

  it("produces no values when Telegram refuses, and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { api } = recordingApi(
      new BotApiError(
        "Forbidden: bot is not a member of the channel chat",
        403,
        false,
      ),
    );
    const action = new SendMessageAction(await storeWith("Stream"), api);

    await expect(
      trigger(action, { chat: "c1", text: "Live!" }),
    ).resolves.toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not a member of the channel"),
    );
    warn.mockRestore();
  });
});
