import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./messages";

describe("isEditorMessage", () => {
  it("accepts every well-formed editor message", () => {
    expect(isEditorMessage({ event: "get-status" })).toBe(true);
    expect(
      isEditorMessage({
        event: "create-chat",
        chat: { name: "Stream", chatId: "@my_stream", token: "1:a" },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "update-chat",
        id: "c1",
        chat: { name: "Stream", chatId: "@my_stream" },
      }),
    ).toBe(true);
    expect(isEditorMessage({ event: "delete-chat", id: "c1" })).toBe(true);
    expect(isEditorMessage({ event: "check-chat", id: "c1" })).toBe(true);
  });

  it("refuses a malformed or unknown message", () => {
    expect(isEditorMessage(null)).toBe(false);
    expect(isEditorMessage({ event: "create-chat", chat: { name: 1 } })).toBe(
      false,
    );
    expect(isEditorMessage({ event: "delete-chat" })).toBe(false);
    expect(isEditorMessage({ event: "launch" })).toBe(false);
  });
});

describe("isPluginMessage", () => {
  it("accepts what the sidecar sends", () => {
    expect(isPluginMessage({ event: "status", status: { chats: [] } })).toBe(
      true,
    );
    expect(isPluginMessage({ event: "chat-refused", message: "no" })).toBe(
      true,
    );
  });

  it("refuses anything else", () => {
    expect(isPluginMessage({ event: "scenes" })).toBe(false);
    expect(isPluginMessage("status")).toBe(false);
  });
});
