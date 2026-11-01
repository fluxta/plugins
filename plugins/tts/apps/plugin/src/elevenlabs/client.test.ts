import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../speech/provider";
import { ElevenLabsClient, type Outcome } from "./client";

const KEY = "sk_0123456789abcdef_secret";

type Answer = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * A client over a `fetch` that answers each request in turn, recording the
 * requests and what the client told of the account.
 */
function setup(
  answers: (Answer | ((init: RequestInit) => Promise<Response>))[],
  { key = KEY as string | null, timeoutMs = 10_000 } = {},
) {
  const requests: { url: URL; headers: Headers; init: RequestInit }[] = [];
  const outcomes: { outcome: Outcome; key: string }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init = {}) => {
    requests.push({
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      init,
    });
    const answer = answers.shift();
    if (typeof answer === "function") {
      return answer(init);
    }
    const { status = 200, body, headers } = answer ?? {};
    if (body instanceof Uint8Array) {
      return new Response(body, {
        status,
        headers: { "content-type": "audio/pcm", ...headers },
      });
    }
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      {
        status,
        headers: {
          "content-type":
            typeof body === "string" ? "text/plain" : "application/json",
          ...headers,
        },
      },
    );
  });
  const client = new ElevenLabsClient({
    key: () => key ?? undefined,
    onOutcome: (outcome, used) => outcomes.push({ outcome, key: used }),
    fetch,
    timeoutMs,
  });
  return { client, requests, outcomes, fetch };
}

function page(names: string[], next?: string) {
  return {
    body: {
      voices: names.map((name) => ({ voice_id: `id-${name}`, name })),
      has_more: next !== undefined,
      total_count: 0,
      next_page_token: next ?? null,
    },
  };
}

/** What a voices call failed with. */
async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

describe("ElevenLabsClient.voices", () => {
  it("lists every page of My Voices, with the key in xi-api-key", async () => {
    const { client, requests, outcomes } = setup([
      page(["Rachel", "Adam"], "page-2"),
      page(["My Stream Voice"]),
    ]);

    expect(await client.voices()).toEqual([
      { id: "id-Rachel", name: "Rachel" },
      { id: "id-Adam", name: "Adam" },
      { id: "id-My Stream Voice", name: "My Stream Voice" },
    ]);

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/v2/voices",
      "/v2/voices",
    ]);
    expect(requests[0].url.host).toBe("api.elevenlabs.io");
    expect(requests[0].url.searchParams.get("page_size")).toBe("100");
    expect(requests[0].url.searchParams.has("next_page_token")).toBe(false);
    expect(requests[1].url.searchParams.get("next_page_token")).toBe("page-2");
    expect(requests.map(({ headers }) => headers.get("xi-api-key"))).toEqual([
      KEY,
      KEY,
    ]);
    expect(outcomes).toEqual([
      { outcome: { connected: true }, key: KEY },
      { outcome: { connected: true }, key: KEY },
    ]);
  });

  it("names a voice by its id when it has no name", async () => {
    const { client } = setup([
      {
        body: {
          voices: [{ voice_id: "abc", name: " " }],
          has_more: false,
        },
      },
    ]);

    expect(await client.voices()).toEqual([{ id: "abc", name: "abc" }]);
  });

  it("asks nothing without a key, and says where to add one", async () => {
    const { client, fetch, outcomes } = setup([], { key: null });

    const error = await failure(client.voices());

    expect(error.kind).toBe("unavailable");
    expect(error.message).toBe(
      "There is no ElevenLabs API key — add one under ElevenLabs",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(outcomes).toEqual([]);
  });

  it.each([
    [401, "invalid_api_key", "Invalid API key"],
    [
      401,
      "missing_permissions",
      "The API key you used is missing the permission voices_read to execute this operation.",
    ],
    [
      403,
      "insufficient_permissions",
      "You do not have the required permissions for this action.",
    ],
    [
      402,
      "insufficient_credits",
      "Your account does not have enough credits for this operation.",
    ],
  ])(
    "is unavailable on a %i %s, in ElevenLabs' words, and the account is not connected",
    async (status, code, message) => {
      const { client, outcomes } = setup([
        { status, body: { detail: { type: "x", code, message } } },
      ]);

      const error = await failure(client.voices());

      expect([error.kind, error.message]).toEqual([
        "unavailable",
        `ElevenLabs: ${message}`,
      ]);
      expect(outcomes).toEqual([
        {
          outcome: { connected: false, reason: `ElevenLabs: ${message}` },
          key: KEY,
        },
      ]);
    },
  );

  it("is transient on a rate limit or ElevenLabs' own failure, which say nothing of the account", async () => {
    const { client, outcomes } = setup([
      {
        status: 429,
        body: { detail: { message: "Too many concurrent requests." } },
      },
      { status: 503, body: "<html>Service Unavailable</html>" },
    ]);

    const limited = await failure(client.voices());
    const down = await failure(client.voices());

    expect([limited.kind, limited.message]).toEqual([
      "transient",
      "ElevenLabs: Too many concurrent requests.",
    ]);
    expect([down.kind, down.message]).toEqual([
      "transient",
      "ElevenLabs: it answered 503",
    ]);
    expect(outcomes.map(({ outcome }) => outcome)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("is rejected on what it refuses, voice-missing on a voice it does not have — in the first message of a list", async () => {
    const { client } = setup([
      { status: 422, body: { detail: [{ loc: ["query"], msg: "Bad page" }] } },
      { status: 404, body: { detail: "Voice not found" } },
    ]);

    const refused = await failure(client.voices());
    const missing = await failure(client.voices());

    expect([refused.kind, refused.message]).toEqual([
      "rejected",
      "ElevenLabs: Bad page",
    ]);
    expect([missing.kind, missing.message]).toEqual([
      "voice-missing",
      "ElevenLabs: Voice not found",
    ]);
  });

  it("is transient without a way through to ElevenLabs, and the account is not connected", async () => {
    const { client, outcomes } = setup([
      async () => {
        throw new TypeError("fetch failed");
      },
    ]);

    const error = await failure(client.voices());

    expect([error.kind, error.message]).toEqual([
      "transient",
      "Cannot reach ElevenLabs: fetch failed",
    ]);
    expect(outcomes[0].outcome).toEqual({
      connected: false,
      reason: "Cannot reach ElevenLabs: fetch failed",
    });
  });

  it("gives up on a request that takes too long", async () => {
    const hanging = (init: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      );
    const { client, outcomes } = setup([hanging], { timeoutMs: 20 });

    const error = await failure(client.voices());

    expect([error.kind, error.message]).toEqual([
      "transient",
      "ElevenLabs did not answer within 0.02 s",
    ]);
    expect(outcomes[0].outcome).toMatchObject({ connected: false });
  });

  it("rejects with the signal's reason when stopped, telling nothing of the account", async () => {
    const abort = new AbortController();
    const { client, outcomes } = setup([
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
          abort.abort(new Error("stopped"));
        }),
    ]);

    await expect(client.voices(abort.signal)).rejects.toThrow("stopped");
    expect(outcomes).toEqual([]);
  });

  it("never puts the key in a reason", async () => {
    const { client, outcomes } = setup([
      { status: 401, body: { detail: { message: "Invalid API key" } } },
      { status: 500, body: "" },
      async () => {
        throw new TypeError("fetch failed", { cause: new Error("ENOTFOUND") });
      },
    ]);

    const reasons = [
      (await failure(client.voices())).message,
      (await failure(client.voices())).message,
      (await failure(client.voices())).message,
      ...outcomes.map(({ outcome }) => JSON.stringify(outcome ?? null)),
    ];

    for (const reason of reasons) {
      expect(reason).not.toContain(KEY);
    }
  });
});

describe("ElevenLabsClient", () => {
  it("lists a voice's settings as set up on the site", async () => {
    const { client } = setup([
      {
        body: {
          voices: [
            {
              voice_id: "rachel-id",
              name: "Rachel",
              settings: {
                stability: 0.4,
                similarity_boost: 0.9,
                style: null,
                use_speaker_boost: true,
                speed: 1.05,
              },
            },
          ],
          has_more: false,
        },
      },
    ]);

    expect(await client.voices()).toEqual([
      {
        id: "rachel-id",
        name: "Rachel",
        settings: {
          stability: 0.4,
          similarity_boost: 0.9,
          use_speaker_boost: true,
          speed: 1.05,
        },
      },
    ]);
  });

  it("lists the Models that speak text", async () => {
    const { client, requests } = setup([
      {
        body: [
          {
            model_id: "eleven_flash_v2_5",
            name: "Eleven Flash v2.5",
            can_do_text_to_speech: true,
          },
          { model_id: "eleven_sts", can_do_text_to_speech: false },
          { model_id: "eleven_v4", can_do_text_to_speech: true },
        ],
      },
    ]);

    expect(await client.models()).toEqual([
      { id: "eleven_flash_v2_5", name: "Eleven Flash v2.5" },
      { id: "eleven_v4", name: "eleven_v4" },
    ]);
    expect(requests[0].url.pathname).toBe("/v1/models");
  });

  it("asks for one voice's settings", async () => {
    const { client, requests } = setup([
      { body: { stability: 0.5, use_speaker_boost: false } },
    ]);

    expect(await client.voiceSettings("rachel/id")).toEqual({
      stability: 0.5,
      use_speaker_boost: false,
    });
    expect(requests[0].url.pathname).toBe("/v1/voices/rachel%2Fid/settings");
  });

  it("synthesizes the text as written, through the Model, as 24 kHz PCM", async () => {
    const pcm = new Uint8Array([1, 0, 2, 0]);
    const { client, requests } = setup([{ body: pcm }]);

    const audio = await client.speech("rachel-id", {
      text: 'Hi <break time="3s"/> [whispers] chat',
      modelId: "eleven_v4",
      voiceSettings: { speed: 1.2 },
    });

    expect(audio).toEqual(pcm);
    const [{ url, init, headers }] = requests;
    expect(url.pathname).toBe("/v1/text-to-speech/rachel-id");
    expect(url.searchParams.get("output_format")).toBe("pcm_24000");
    expect(init.method).toBe("POST");
    expect(headers.get("xi-api-key")).toBe(KEY);
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'Hi <break time="3s"/> [whispers] chat',
      model_id: "eleven_v4",
      voice_settings: { speed: 1.2 },
    });
  });

  it("leaves voice_settings out while the voice speaks as set up", async () => {
    const { client, requests } = setup([{ body: new Uint8Array([0, 0]) }]);

    await client.speech("rachel-id", { text: "Hi", modelId: "eleven_v4" });

    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      text: "Hi",
      model_id: "eleven_v4",
    });
  });

  it("waits Retry-After before the retry of a rate limit — at most 2 s, else 1 s", async () => {
    const { client } = setup([
      { status: 429, body: {}, headers: { "retry-after": "1.5" } },
      { status: 429, body: {}, headers: { "retry-after": "30" } },
      { status: 503, body: {} },
      async () => {
        throw new TypeError("fetch failed");
      },
    ]);

    const pauses = [];
    for (let i = 0; i < 4; i++) {
      pauses.push((await failure(client.models())).retryAfter);
    }

    expect(pauses).toEqual([1500, 2000, 1000, 1000]);
  });

  it("drops a voice it does not have as voice-missing, and a Model it does not offer as unavailable — the account fine either way", async () => {
    const { client, outcomes } = setup([
      {
        status: 404,
        body: { detail: { code: "voice_not_found", message: "No voice" } },
      },
      {
        status: 400,
        body: { detail: { code: "invalid_voice_id", message: "Bad voice" } },
      },
      {
        status: 404,
        body: { detail: { code: "model_not_found", message: "No model" } },
      },
      {
        status: 403,
        body: {
          detail: { code: "model_access_denied", message: "Not your plan" },
        },
      },
    ]);
    const say = () => client.speech("x", { text: "Hi", modelId: "m" });

    const kinds = [];
    for (let i = 0; i < 4; i++) {
      kinds.push((await failure(say())).kind);
    }

    expect(kinds).toEqual([
      "voice-missing",
      "voice-missing",
      "unavailable",
      "unavailable",
    ]);
    expect(outcomes.map(({ outcome }) => outcome)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("rejects a text ElevenLabs refuses", async () => {
    const { client } = setup([
      {
        status: 400,
        body: { detail: { code: "text_too_long", message: "Too long" } },
      },
    ]);

    const error = await failure(
      client.speech("x", { text: "Hi", modelId: "m" }),
    );

    expect([error.kind, error.message]).toEqual([
      "rejected",
      "ElevenLabs: Too long",
    ]);
  });
});

const jsonCalls = [
  {
    name: "voices",
    call: (client: ElevenLabsClient) => client.voices(),
    valid: { voices: [], has_more: false },
    invalid: [
      null,
      [],
      {},
      { detail: { message: "Blocked" } },
      { voices: "Blocked", has_more: false },
      { voices: [], has_more: "false" },
      { voices: [], has_more: true },
      { voices: [{ name: "No id" }], has_more: false },
      { voices: ["Rachel"], has_more: false },
      { voices: [{ voice_id: "x", settings: "Blocked" }], has_more: false },
    ],
  },
  {
    name: "models",
    call: (client: ElevenLabsClient) => client.models(),
    valid: [],
    invalid: [
      null,
      {},
      { detail: { message: "Blocked" } },
      ["Blocked"],
      [{ name: "No id", can_do_text_to_speech: true }],
      [{ model_id: "x", can_do_text_to_speech: "true" }],
    ],
  },
  {
    name: "voice settings",
    call: (client: ElevenLabsClient) => client.voiceSettings("voice"),
    valid: { stability: 0.5, use_speaker_boost: true },
    invalid: [
      null,
      [],
      {},
      { detail: { message: "Blocked" } },
      { stability: "0.5" },
      { use_speaker_boost: "true" },
    ],
  },
];

const unexpected = {
  kind: "transient",
  message: "ElevenLabs returned an unexpected response",
  retryAfter: 1000,
};

function expectDisconnected(outcomes: { outcome: Outcome; key: string }[]) {
  expect(outcomes).toEqual([
    {
      outcome: { connected: false, reason: unexpected.message },
      key: KEY,
    },
  ]);
}

describe.each(jsonCalls)(
  "ElevenLabsClient validates $name",
  ({ call, valid, invalid }) => {
    it.each([
      ["text/html", "<html>Blocked</html>"],
      ["application/json", "<html>Blocked</html>"],
      ["application/json", '{"voices":'],
      ["application/json", ""],
      ["text/plain", JSON.stringify(valid)],
      ["", JSON.stringify(valid)],
    ])(
      "rejects HTTP 200 with %s and an unexpected body",
      async (contentType, body) => {
        const { client, outcomes } = setup([
          { body, headers: { "content-type": contentType } },
        ]);

        await expect(call(client)).rejects.toMatchObject(unexpected);
        expectDisconnected(outcomes);
      },
    );

    it.each(invalid.map((body) => [body]))(
      "rejects an unexpected JSON structure: %j",
      async (body) => {
        const { client, outcomes } = setup([{ body }]);

        await expect(call(client)).rejects.toMatchObject(unexpected);
        expectDisconnected(outcomes);
      },
    );

    it("accepts a valid response with MIME parameters and additional fields", async () => {
      const { client, outcomes } = setup([
        {
          body: Array.isArray(valid) ? valid : { ...valid, future_field: true },
          headers: { "content-type": "Application/JSON; charset=utf-8" },
        },
      ]);

      await call(client);

      expect(outcomes).toEqual([{ outcome: { connected: true }, key: KEY }]);
    });
  },
);

it("does not reflect an unexpected response's body or headers in the reason", async () => {
  const { client, outcomes } = setup([
    {
      body: { detail: { message: KEY } },
      headers: { "content-type": `text/html; secret=${KEY}` },
    },
  ]);

  await expect(client.voices()).rejects.toMatchObject(unexpected);
  expectDisconnected(outcomes);
  expect(JSON.stringify(outcomes)).not.toContain(`secret=${KEY}`);
});

describe("ElevenLabsClient validates PCM", () => {
  const say = (client: ElevenLabsClient) =>
    client.speech("voice", { text: "Hello", modelId: "eleven_flash_v2_5" });

  it.each(["text/html", "application/json", "audio/wav", "audio/ogg", ""])(
    "rejects HTTP 200 with content type %s before reporting success",
    async (contentType) => {
      const { client, outcomes } = setup([
        {
          body: new TextEncoder().encode("<html>Blocked</html> "),
          headers: { "content-type": contentType },
        },
      ]);

      await expect(say(client)).rejects.toMatchObject(unexpected);
      expectDisconnected(outcomes);
    },
  );

  it.each([0, 1, 3])("rejects %i bytes of incomplete PCM", async (length) => {
    const { client, outcomes } = setup([{ body: new Uint8Array(length) }]);

    await expect(say(client)).rejects.toMatchObject(unexpected);
    expectDisconnected(outcomes);
  });

  it.each([
    "audio/pcm",
    "application/octet-stream",
    "audio/mpeg",
    "Audio/PCM; rate=24000",
  ])("accepts complete PCM returned as %s", async (contentType) => {
    const pcm = new Uint8Array([1, 0, 2, 0]);
    const { client, outcomes } = setup([
      { body: pcm, headers: { "content-type": contentType } },
    ]);

    expect(await say(client)).toEqual(pcm);
    expect(outcomes).toEqual([{ outcome: { connected: true }, key: KEY }]);
  });

  it("does not confirm a response whose body was cut short", async () => {
    const { client, outcomes } = setup([
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([0, 0]));
              controller.error(new TypeError("terminated"));
            },
          }),
          { headers: { "content-type": "audio/pcm" } },
        ),
    ]);

    await expect(say(client)).rejects.toMatchObject({ kind: "transient" });
    expect(outcomes).toEqual([
      {
        outcome: {
          connected: false,
          reason: "Cannot reach ElevenLabs: terminated",
        },
        key: KEY,
      },
    ]);
  });
});
