import { describe, expect, it } from "vitest";

import { ChatsStore, type StoredSettings } from "./store";

const TOKEN = "123456789:AAH4r0bt0k3n-_ExampleExampleExample";

function storeWithWrites() {
  const writes: StoredSettings[] = [];
  const store = new ChatsStore({
    setPluginSettings: async (settings) => {
      writes.push(structuredClone(settings));
    },
  });
  return { store, writes };
}

describe("ChatsStore", () => {
  it("stores a new Chat with its chat normalised and persists the list", async () => {
    const { store, writes } = storeWithWrites();

    await store.create("c1", {
      name: " Stream ",
      chatId: "https://t.me/my_stream",
      token: ` ${TOKEN} `,
    });

    expect(store.get("c1")).toEqual({
      id: "c1",
      name: "Stream",
      chatId: "@my_stream",
      token: TOKEN,
    });
    expect(writes).toEqual([{ chats: [store.get("c1")] }]);
  });

  it("never shows the token to an editor", async () => {
    const { store } = storeWithWrites();
    await store.create("c1", {
      name: "Stream",
      chatId: "@my_stream",
      token: TOKEN,
    });

    expect(store.redacted()).toEqual([
      { id: "c1", name: "Stream", chatId: "@my_stream", hasToken: true },
    ]);
  });

  it("keeps the stored token when an edit leaves it out", async () => {
    const { store } = storeWithWrites();
    await store.create("c1", {
      name: "Stream",
      chatId: "@my_stream",
      token: TOKEN,
    });

    await store.update("c1", { name: "Live", chatId: "@my_live" });

    expect(store.get("c1")).toEqual({
      id: "c1",
      name: "Live",
      chatId: "@my_live",
      token: TOKEN,
    });
  });

  it("replaces the token when an edit gives a new one", async () => {
    const { store } = storeWithWrites();
    await store.create("c1", {
      name: "Stream",
      chatId: "@my_stream",
      token: TOKEN,
    });

    await store.update("c1", {
      name: "Stream",
      chatId: "@my_stream",
      token: "987654321:AAOtherOtherOtherOtherOther",
    });

    expect(store.get("c1")?.token).toBe(
      "987654321:AAOtherOtherOtherOtherOther",
    );
  });

  it("removes a Chat", async () => {
    const { store, writes } = storeWithWrites();
    await store.create("c1", {
      name: "Stream",
      chatId: "@my_stream",
      token: TOKEN,
    });

    await store.remove("c1");

    expect(store.list()).toEqual([]);
    expect(writes.at(-1)).toEqual({ chats: [] });
  });

  it("loads what was persisted, and nothing from empty settings", () => {
    const { store } = storeWithWrites();
    const chat = {
      id: "c1",
      name: "Stream",
      chatId: "@my_stream",
      token: TOKEN,
    };

    expect(store.hydrate({ chats: [chat] })).toEqual([chat]);
    expect(store.hydrate(null)).toEqual([]);
  });
});
