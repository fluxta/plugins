import type { ChatStatus } from "telegram-protocol";
import { describe, expect, it } from "vitest";

import type { CallBotApi } from "../telegram/bot-api";
import { ChatsService } from "./service";
import type { StoredChat } from "./store";

const chat = (overrides: Partial<StoredChat> = {}): StoredChat => ({
  id: "c1",
  name: "Stream",
  chatId: "@my_stream",
  token: "1:token",
  ...overrides,
});

/**
 * A Bot API whose every call waits until the test releases it, so a test
 * can let checks finish in any order. Every chat is a channel the bot
 * administers — the title says which token asked.
 */
function controllableApi() {
  const pending: Array<() => void> = [];
  let checks = 0;

  const api: CallBotApi = async <T>(token: string, method: string) => {
    if (method === "getMe") {
      checks += 1;
    }
    await new Promise<void>((resolve) => pending.push(resolve));
    const answers: Record<string, unknown> = {
      getMe: { id: 1 },
      getChat: { id: -1, type: "channel", title: `via ${token}` },
      getChatMember: { status: "administrator", can_post_messages: true },
    };
    return answers[method] as T;
  };

  async function settle() {
    for (let round = 0; round < 10 && pending.length > 0; round += 1) {
      pending.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { api, settle, checks: () => checks };
}

describe("ChatsService", () => {
  it("checks a new Chat and reports checking, then ready", async () => {
    const { api, settle } = controllableApi();
    const seen: Array<ChatStatus | undefined> = [];
    const service = new ChatsService(api, () =>
      seen.push(service.statusOf("c1")),
    );

    service.reconcile([chat()]);
    expect(service.statusOf("c1")).toEqual({ status: "checking" });

    await settle();
    expect(service.statusOf("c1")).toEqual({
      status: "ready",
      title: "via 1:token",
    });
    expect(seen.at(-1)).toEqual({ status: "ready", title: "via 1:token" });
  });

  it("does not check a Chat again until its chat or token changes", async () => {
    const { api, settle, checks } = controllableApi();
    const service = new ChatsService(api, () => {});

    service.reconcile([chat()]);
    await settle();
    service.reconcile([chat({ name: "Renamed" })]);
    await settle();
    expect(checks()).toBe(1);

    service.reconcile([chat({ token: "2:token" })]);
    await settle();
    expect(checks()).toBe(2);
  });

  it("checks again when asked, whatever the last result", async () => {
    const { api, settle, checks } = controllableApi();
    const service = new ChatsService(api, () => {});

    service.reconcile([chat()]);
    await settle();
    await Promise.all([service.check(chat()), settle()]);

    expect(checks()).toBe(2);
  });

  it("keeps only the newest check's result", async () => {
    const { api, settle } = controllableApi();
    const service = new ChatsService(api, () => {});

    service.reconcile([chat()]);
    service.reconcile([chat({ token: "2:token" })]);
    await settle();

    expect(service.statusOf("c1")).toEqual({
      status: "ready",
      title: "via 2:token",
    });
  });

  it("forgets a removed Chat, even mid-check", async () => {
    const { api, settle } = controllableApi();
    const service = new ChatsService(api, () => {});

    service.reconcile([chat()]);
    service.reconcile([]);
    await settle();

    expect(service.statusOf("c1")).toBeUndefined();
  });
});
