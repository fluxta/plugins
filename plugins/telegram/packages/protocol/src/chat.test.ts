import { describe, expect, it } from "vitest";

import { normalizeChatId, validateChatDraft, type Chat } from "./chat";

const TOKEN = "123456789:AAH4r0bt0k3n-_ExampleExampleExample";

describe("normalizeChatId", () => {
  it("keeps a public @username", () => {
    expect(normalizeChatId("@my_channel")).toBe("@my_channel");
    expect(normalizeChatId("  @my_channel ")).toBe("@my_channel");
  });

  it("turns a t.me link into its @username", () => {
    expect(normalizeChatId("https://t.me/my_channel")).toBe("@my_channel");
    expect(normalizeChatId("t.me/my_channel/")).toBe("@my_channel");
  });

  it("keeps a numeric id, including a private channel's negative one", () => {
    expect(normalizeChatId("-1001234567890")).toBe("-1001234567890");
    expect(normalizeChatId("42")).toBe("42");
  });

  it("refuses what the Bot API cannot address", () => {
    expect(normalizeChatId("")).toBeUndefined();
    expect(normalizeChatId("my channel")).toBeUndefined();
    expect(normalizeChatId("https://t.me/+AbCdEfInvite")).toBeUndefined();
    expect(normalizeChatId("@ab")).toBeUndefined();
  });
});

describe("validateChatDraft", () => {
  const announcements: Chat = {
    id: "c1",
    name: "Announcements",
    chatId: "@announcements",
    hasToken: true,
  };

  it("accepts a complete new Chat", () => {
    expect(
      validateChatDraft(
        { name: "Stream", chatId: "@my_stream", token: TOKEN },
        [announcements],
      ),
    ).toBeUndefined();
  });

  it("asks for a name, unique among the Chats", () => {
    expect(
      validateChatDraft({ name: " ", chatId: "@my_stream", token: TOKEN }, []),
    ).toMatch(/name/);
    expect(
      validateChatDraft(
        { name: "Announcements", chatId: "@my_stream", token: TOKEN },
        [announcements],
      ),
    ).toMatch(/already named/);
  });

  it("explains a chat it cannot address", () => {
    expect(
      validateChatDraft(
        { name: "Stream", chatId: "my stream", token: TOKEN },
        [],
      ),
    ).toMatch(/@username/);
  });

  it("requires a token for a new Chat, and a token that looks like one", () => {
    expect(
      validateChatDraft({ name: "Stream", chatId: "@my_stream" }, []),
    ).toMatch(/token/);
    expect(
      validateChatDraft(
        { name: "Stream", chatId: "@my_stream", token: "nope" },
        [],
      ),
    ).toMatch(/BotFather/);
  });

  it("lets an edit leave the stored token alone", () => {
    expect(
      validateChatDraft(
        { name: "Announcements", chatId: "@announcements" },
        [announcements],
        { id: "c1", hasToken: true },
      ),
    ).toBeUndefined();
  });
});
