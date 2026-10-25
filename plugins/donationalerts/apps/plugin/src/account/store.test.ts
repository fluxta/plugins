import { describe, expect, it, vi } from "vitest";

import { AccountStore, type StoredAccount } from "./store";

const ACCOUNT: StoredAccount = {
  id: 10111687,
  name: "MikeRime",
  avatar: "https://example.com/avatar.png",
  accessToken: "token",
  expiresAt: 1_800_000_000_000,
};

function writer() {
  return { setPluginSettings: vi.fn(async () => {}) };
}

describe("AccountStore", () => {
  it("starts with no Account on a fresh install", () => {
    const store = new AccountStore(writer());

    expect(store.hydrate(null)).toBeUndefined();
    expect(store.get()).toBeUndefined();
  });

  it("reads back what it saved", async () => {
    const settings = writer();
    const store = new AccountStore(settings);
    await store.save(ACCOUNT);

    const persisted = settings.setPluginSettings.mock.lastCall?.at(0);
    const reloaded = new AccountStore(writer());

    expect(reloaded.hydrate(persisted)).toEqual(ACCOUNT);
  });

  it("ignores a stored Account it cannot read", () => {
    const store = new AccountStore(writer());
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(store.hydrate({ account: { id: "x" } })).toBeUndefined();
  });

  it("drops the token and keeps whose it was", async () => {
    const settings = writer();
    const store = new AccountStore(settings);
    await store.save(ACCOUNT);

    await store.dropToken();

    const identity = {
      id: ACCOUNT.id,
      name: ACCOUNT.name,
      avatar: ACCOUNT.avatar,
      expiresAt: ACCOUNT.expiresAt,
    };
    expect(store.get()).toEqual(identity);
    const reloaded = new AccountStore(writer());
    expect(
      reloaded.hydrate(settings.setPluginSettings.mock.lastCall?.at(0)),
    ).toEqual(identity);
  });

  it("keeps sections it does not know when it writes", async () => {
    const settings = writer();
    const store = new AccountStore(settings);
    store.hydrate({ future: { on: true } });

    await store.save(ACCOUNT);
    expect(settings.setPluginSettings).toHaveBeenLastCalledWith({
      future: { on: true },
      account: ACCOUNT,
    });

    await store.clear();
    expect(settings.setPluginSettings).toHaveBeenLastCalledWith({
      future: { on: true },
    });
    expect(store.get()).toBeUndefined();
  });
});
