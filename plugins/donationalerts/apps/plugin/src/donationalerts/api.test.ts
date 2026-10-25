import { describe, expect, it } from "vitest";

import { createApi, Unauthorized } from "./api";

function fakeFetch(
  answer: () => Response | Promise<Response>,
): typeof fetch & { calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer();
  }) as typeof fetch & { calls: typeof calls };
  impl.calls = calls;
  return impl;
}

const USER = {
  data: {
    id: 10111687,
    code: "mikerime",
    name: "MikeRime",
    is_active: 1,
    avatar: "https://example.com/avatar.png",
    email: "someone@example.com",
    language: "ru_RU",
    socket_connection_token: "socket-token",
  },
};

describe("subscribeChannels", () => {
  it("asks for this client's channel tokens", async () => {
    const fetch = fakeFetch(() =>
      Response.json({
        channels: [{ channel: "$alerts:donation_1", token: "channel-token" }],
      }),
    );
    const channels = await createApi(fetch).subscribeChannels("secret-token", {
      client: "client-uuid",
      channels: ["$alerts:donation_1"],
    });

    expect(channels).toEqual([
      { channel: "$alerts:donation_1", token: "channel-token" },
    ]);
    expect(fetch.calls[0]?.url).toBe(
      "https://www.donationalerts.com/api/v1/centrifuge/subscribe",
    );
    expect(fetch.calls[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(String(fetch.calls[0]?.init?.body))).toEqual({
      client: "client-uuid",
      channels: ["$alerts:donation_1"],
    });
  });

  it("turns a 401 into Unauthorized", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 401 }));

    await expect(
      createApi(fetch).subscribeChannels("t", { client: "c", channels: [] }),
    ).rejects.toBeInstanceOf(Unauthorized);
  });
});

describe("listDonations", () => {
  it("reads the first page with each entry's id", async () => {
    const entry = { id: 193057136, username: "Mike", amount: 100 };
    const fetch = fakeFetch(() =>
      Response.json({
        data: [entry, { id: 191876672 }],
        meta: { per_page: 30 },
      }),
    );

    const listed = await createApi(fetch).listDonations("secret-token");

    expect(listed).toEqual([
      { id: 193057136, data: entry },
      { id: 191876672, data: { id: 191876672 } },
    ]);
    expect(fetch.calls[0]?.url).toBe(
      "https://www.donationalerts.com/api/v1/alerts/donations",
    );
    expect(fetch.calls[0]?.init?.headers).toEqual({
      authorization: "Bearer secret-token",
    });
  });

  it("refuses a list it cannot read", async () => {
    const fetch = fakeFetch(() => Response.json({ data: [{ id: "x" }] }));

    await expect(createApi(fetch).listDonations("t")).rejects.toThrow(
      "donation list",
    );
  });
});

describe("getUser", () => {
  it("reads the Account's identity with the token in the header", async () => {
    const fetch = fakeFetch(() => Response.json(USER));
    const user = await createApi(fetch).getUser("secret-token");

    expect(user).toEqual({
      id: 10111687,
      name: "MikeRime",
      avatar: "https://example.com/avatar.png",
      socketConnectionToken: "socket-token",
    });
    expect(fetch.calls[0]?.url).toBe(
      "https://www.donationalerts.com/api/v1/user/oauth",
    );
    expect(fetch.calls[0]?.url).not.toContain("secret-token");
    expect(fetch.calls[0]?.init?.headers).toEqual({
      authorization: "Bearer secret-token",
    });
  });

  it("takes a missing avatar as none", async () => {
    const fetch = fakeFetch(() =>
      Response.json({ data: { ...USER.data, avatar: null } }),
    );

    await expect(createApi(fetch).getUser("t")).resolves.toMatchObject({
      avatar: "",
    });
  });

  it("turns a 401 into Unauthorized", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 401 }));

    await expect(createApi(fetch).getUser("t")).rejects.toBeInstanceOf(
      Unauthorized,
    );
  });

  it("fails without the token in the message", async () => {
    for (const answer of [
      () => new Response(null, { status: 503 }),
      () => Promise.reject(new Error("socket hang up secret-token")),
      () => new Response("<html>", { status: 200 }),
      () => Response.json({ data: { id: "not a number" } }),
    ]) {
      const error = await createApi(fakeFetch(answer))
        .getUser("secret-token")
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("secret-token");
    }
  });
});
