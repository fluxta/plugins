import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { EditMessageSettings } from "telegram-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatsStore } from "../chats/store";
import { BotApiError, type CallBotApi } from "../telegram/bot-api";
import { EditMessageAction, isNotModified, messageIdOf } from "./edit-message";

const TOKEN = "123456789:AAH4r0bt0k3n-_ExampleExampleExample";

const NOT_MODIFIED = new BotApiError(
  "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message",
  400,
  false,
);

const NOT_FOUND = new BotApiError(
  "Bad Request: message to edit not found",
  400,
  false,
);

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

function trigger(action: EditMessageAction, settings: Record<string, unknown>) {
  return action.onTrigger(
    new StandaloneTriggerContext<EditMessageSettings>(
      "action-1",
      settings as EditMessageSettings,
    ),
  );
}

function recordingApi(answer: unknown = { message_id: 4812, text: "Ended" }) {
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

function silenceWarnings() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messageIdOf", () => {
  it("reads an id typed by hand or substituted as a number", () => {
    expect(messageIdOf("4812")).toBe(4812);
    expect(messageIdOf(" 4812 ")).toBe(4812);
    expect(messageIdOf(4812)).toBe(4812);
  });

  it("reads no id from a blank, an absent reference, or anything not a message number", () => {
    for (const value of [
      undefined,
      null,
      "",
      "  ",
      "abc",
      0,
      "0",
      -5,
      1.5,
      true,
    ]) {
      expect(messageIdOf(value)).toBeUndefined();
    }
  });
});

describe("isNotModified", () => {
  it("recognises Telegram refusing an edit that changes nothing", () => {
    expect(isNotModified(NOT_MODIFIED)).toBe(true);
  });

  it("does not mistake any other refusal for it", () => {
    expect(isNotModified(NOT_FOUND)).toBe(false);
    expect(isNotModified(new Error("message is not modified"))).toBe(false);
  });
});

describe("EditMessageAction", () => {
  it("replaces the Message's text in its Chat with plain text", async () => {
    const { api, calls } = recordingApi();
    const action = new EditMessageAction(await storeWith("Stream"), api);

    const produced = await trigger(action, {
      chat: "c1",
      messageId: "4812",
      text: "Stream ended · 2:14:05",
    });

    expect(calls).toEqual([
      {
        token: TOKEN,
        method: "editMessageText",
        params: {
          chat_id: "@stream_chat",
          message_id: 4812,
          text: "Stream ended · 2:14:05",
        },
      },
    ]);
    expect(produced).toBeUndefined();
  });

  it("takes a message id the host substituted as a number", async () => {
    const { api, calls } = recordingApi();
    const action = new EditMessageAction(await storeWith("Stream"), api);

    await trigger(action, { messageId: 4812, text: "Ended" });

    expect(calls[0]?.params).toMatchObject({ message_id: 4812 });
  });

  it("treats an edit that changes nothing as done, without a warning", async () => {
    const warn = silenceWarnings();
    const { api } = recordingApi(NOT_MODIFIED);
    const action = new EditMessageAction(await storeWith("Stream"), api);

    await expect(
      trigger(action, { chat: "c1", messageId: 4812, text: "Ended" }),
    ).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a deleted Message or a wrong id and lets the run go on", async () => {
    const warn = silenceWarnings();
    const { api } = recordingApi(NOT_FOUND);
    const action = new EditMessageAction(await storeWith("Stream"), api);

    await expect(
      trigger(action, { chat: "c1", messageId: 4812, text: "Ended" }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("message to edit not found"),
    );
  });

  it("asks Telegram nothing when the message id is blank or not a Message's", async () => {
    const warn = silenceWarnings();
    const { api, calls } = recordingApi();
    const action = new EditMessageAction(await storeWith("Stream"), api);

    await trigger(action, { chat: "c1", messageId: "", text: "Ended" });
    await trigger(action, { chat: "c1", text: "Ended" });
    await trigger(action, { chat: "c1", messageId: 0, text: "Ended" });
    await trigger(action, { chat: "c1", messageId: "abc", text: "Ended" });

    expect(calls).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no message id"));
  });

  it("asks Telegram nothing without a Chat or a text", async () => {
    silenceWarnings();
    const { api, calls } = recordingApi();
    const action = new EditMessageAction(
      await storeWith("Stream", "Backup"),
      api,
    );

    await trigger(action, { messageId: 4812, text: "Ended" });
    await trigger(action, { chat: "gone", messageId: 4812, text: "Ended" });
    await trigger(action, { chat: "c1", messageId: 4812, text: "  " });

    expect(calls).toEqual([]);
  });
});
