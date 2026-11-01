import {
  ProviderError,
  type ProviderErrorKind,
  type Voice,
} from "../speech/provider";

const API = "https://api.elevenlabs.io";

/** How long a request may take before it is given up as `transient`. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** The sample rate of the PCM asked for: offered on every plan. */
export const PCM_SAMPLE_RATE = 24_000;

/** The most voices ElevenLabs gives in one page. */
const PAGE_SIZE = 100;

/** How long a `transient` failure waits before its one retry, at most… */
const RETRY_AFTER_MAX_MS = 2000;

/** …and when ElevenLabs does not say. */
const RETRY_AFTER_MS = 1000;

/**
 * What one call to ElevenLabs says of the account: it works; it does not —
 * the key, a permission, the credits, or no way through to ElevenLabs; or
 * nothing — a rate limit, a missing voice, a text it refuses, its own fault.
 */
export type Outcome =
  { connected: true } | { connected: false; reason: string } | undefined;

/** A voice's settings as ElevenLabs keeps them, each one or not. */
export type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
};

/** A voice of My Voices, with its settings as set up on the site. */
export type ElevenLabsVoice = Voice & { settings?: VoiceSettings };

/** A Model that speaks text. */
export type Model = { id: string; name: string };

/** What one synthesis asks for. */
export type SpeechRequest = {
  text: string;
  modelId: string;
  /** Absent: the voice as set up on the site. */
  voiceSettings?: VoiceSettings;
};

export type ElevenLabsClientOptions = {
  /** The API key as stored now; `undefined` when there is none. */
  key: () => string | undefined;
  /**
   * Told after every call, with the key it was made with: a key replaced
   * meanwhile makes its outcome stale.
   */
  onOutcome?: (outcome: Outcome, key: string) => void;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

/**
 * The ElevenLabs API, as the plugin uses it. Every request carries the API
 * key in `xi-api-key` and gives up after {@link REQUEST_TIMEOUT_MS}, its
 * answer read whole within it; every failure is a ProviderError whose reason
 * is ElevenLabs' own message, or what went wrong on the way. The key never
 * reaches a reason: neither ElevenLabs' answers nor `fetch`'s errors hold
 * the request's headers.
 */
export class ElevenLabsClient {
  readonly #key: () => string | undefined;
  readonly #onOutcome: (outcome: Outcome, key: string) => void;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor({
    key,
    onOutcome = () => {},
    fetch = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: ElevenLabsClientOptions) {
    this.#key = key;
    this.#onOutcome = onOutcome;
    this.#fetch = fetch;
    this.#timeoutMs = timeoutMs;
  }

  /** Every voice in the account's My Voices, page after page. */
  async voices(signal?: AbortSignal): Promise<ElevenLabsVoice[]> {
    const voices: ElevenLabsVoice[] = [];
    let token: string | undefined;
    do {
      const query = new URLSearchParams({
        page_size: String(PAGE_SIZE),
        include_total_count: "false",
        ...(token !== undefined && { next_page_token: token }),
      });
      const page = await this.#json(`/v2/voices?${query}`, signal, voicePageOf);
      voices.push(...page.voices);
      token = page.next;
    } while (token !== undefined);
    return voices;
  }

  /** The Models that speak text, in ElevenLabs' order. */
  async models(signal?: AbortSignal): Promise<Model[]> {
    return this.#json("/v1/models", signal, modelsOf);
  }

  /** One voice's settings as set up on the site. */
  async voiceSettings(
    voiceId: string,
    signal?: AbortSignal,
  ): Promise<VoiceSettings> {
    return this.#json(
      `/v1/voices/${encodeURIComponent(voiceId)}/settings`,
      signal,
      voiceSettingsOf,
    );
  }

  /**
   * A whole Phrase, synthesized: 16-bit little-endian mono PCM at
   * {@link PCM_SAMPLE_RATE}. The text goes as it is written: the Model
   * reads whatever it reads in it.
   */
  async speech(
    voiceId: string,
    { text, modelId, voiceSettings }: SpeechRequest,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const query = new URLSearchParams({
      output_format: `pcm_${PCM_SAMPLE_RATE}`,
    });
    return this.#send(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}?${query}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: modelId,
          ...(voiceSettings && { voice_settings: voiceSettings }),
        }),
      },
      signal,
      async (response) => {
        // The endpoint's OpenAPI advertises audio/mpeg independently of
        // output_format. Also accept the explicit PCM and binary types.
        if (
          !["audio/pcm", "application/octet-stream", "audio/mpeg"].includes(
            mediaTypeOf(response),
          )
        ) {
          throw unexpectedResponse();
        }
        const pcm = new Uint8Array(await response.arrayBuffer());
        // A whole Phrase must contain whole 16-bit samples. PCM has no
        // header that could otherwise distinguish it from arbitrary bytes.
        if (pcm.byteLength < 2 || pcm.byteLength % 2 !== 0) {
          throw unexpectedResponse();
        }
        return pcm;
      },
    );
  }

  #json<T>(
    path: string,
    signal: AbortSignal | undefined,
    read: (body: unknown) => T,
  ): Promise<T> {
    return this.#send(
      path,
      { headers: { accept: "application/json" } },
      signal,
      async (response) => {
        if (mediaTypeOf(response) !== "application/json") {
          throw unexpectedResponse();
        }
        return read(parsed(await response.text()));
      },
    );
  }

  /**
   * One request and its answer, read by `read`; whatever fails is a
   * ProviderError, and the account is told what the call said of it.
   */
  async #send<T>(
    path: string,
    init: RequestInit & { headers: Record<string, string> },
    signal: AbortSignal | undefined,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    const key = this.#key();
    if (key === undefined) {
      throw new ProviderError(
        "unavailable",
        "There is no ElevenLabs API key — add one under ElevenLabs",
      );
    }
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    let answer: { ok: true; value: T } | { ok: false; body: unknown };
    try {
      response = await this.#fetch(`${API}${path}`, {
        ...init,
        headers: { ...init.headers, "xi-api-key": key },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      // Read whole within the timeout: a body cut short is no answer.
      answer = response.ok
        ? { ok: true, value: await read(response) }
        : { ok: false, body: parsed(await response.text()) };
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason;
      }
      const failure =
        error instanceof ProviderError
          ? error
          : new ProviderError(
              "transient",
              timeout.aborted
                ? `ElevenLabs did not answer within ${this.#timeoutMs / 1000} s`
                : `Cannot reach ElevenLabs: ${error instanceof Error ? error.message : String(error)}`,
              { retryAfter: RETRY_AFTER_MS },
            );
      this.#onOutcome({ connected: false, reason: failure.message }, key);
      throw failure;
    }
    if (answer.ok) {
      this.#onOutcome({ connected: true }, key);
      return answer.value;
    }
    const { failure, accountDown } = errorOf(response, answer.body);
    this.#onOutcome(
      accountDown ? { connected: false, reason: failure.message } : undefined,
      key,
    );
    throw failure;
  }
}

/**
 * A network intermediary can answer HTTP 200 with its own page. Neither
 * the account nor the Player may treat that as an ElevenLabs answer. Do
 * not include the body or headers: neither is trusted to keep the key out.
 */
function unexpectedResponse(): ProviderError {
  return new ProviderError(
    "transient",
    "ElevenLabs returned an unexpected response",
    { retryAfter: RETRY_AFTER_MS },
  );
}

function mediaTypeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

/** ElevenLabs' error codes that mean the Preset's Voice is not there… */
const VOICE_MISSING = new Set(["voice_not_found", "invalid_voice_id"]);

/** …and those that mean its Model is not offered: the Preset needs fixing. */
const MODEL_MISSING = new Set([
  "model_not_found",
  "unsupported_model",
  "model_access_denied",
]);

/**
 * An ElevenLabs answer that is not a success, as a ProviderError — and
 * whether it says the account itself does not work: the key, a permission
 * or the credits, all `unavailable`. A Model not offered is `unavailable`
 * too, but the Preset needs fixing, not the account. A rate limit or
 * ElevenLabs' own failure is `transient`, with a pause before the retry; a
 * voice it does not have `voice-missing`; anything else it refuses
 * `rejected`.
 */
function errorOf(
  response: Response,
  body: unknown,
): { failure: ProviderError; accountDown: boolean } {
  const { status } = response;
  const { code, message } = detailOf(body);
  const reason = `ElevenLabs: ${message ?? `it answered ${status}`}`;
  const of = (kind: ProviderErrorKind, accountDown = false) => ({
    failure: new ProviderError(kind, reason),
    accountDown,
  });
  if (code !== undefined && VOICE_MISSING.has(code)) {
    return of("voice-missing");
  }
  if (code !== undefined && MODEL_MISSING.has(code)) {
    return of("unavailable");
  }
  if (status === 401 || status === 402 || status === 403) {
    return of("unavailable", true);
  }
  if (status === 429 || status >= 500) {
    return {
      failure: new ProviderError("transient", reason, {
        retryAfter: retryAfterOf(response.headers.get("retry-after")),
      }),
      accountDown: false,
    };
  }
  return of(status === 404 ? "voice-missing" : "rejected");
}

/**
 * `Retry-After` in seconds, capped: the whole queue waits for the retry.
 * ElevenLabs does not document one, so without it the pause is a second.
 */
function retryAfterOf(header: string | null): number {
  const seconds = Number(header);
  return header !== null && header.trim() !== "" && Number.isFinite(seconds)
    ? Math.min(RETRY_AFTER_MAX_MS, Math.max(0, seconds * 1000))
    : RETRY_AFTER_MS;
}

/**
 * ElevenLabs' code and message: `detail.code` and `detail.message` in its
 * documented shape, the first `detail[].msg` of a validation error, or a
 * bare `detail` string.
 */
function detailOf(body: unknown): { code?: string; message?: string } {
  const detail = isRecord(body) ? body.detail : undefined;
  if (Array.isArray(detail)) {
    return { message: textOf(detail.find(isRecord)?.msg) };
  }
  if (isRecord(detail)) {
    return { code: textOf(detail.code), message: textOf(detail.message) };
  }
  return { message: textOf(detail) };
}

/**
 * The voices of one page, by the name the site shows, with their settings.
 * They speak whatever language their text is in, so none has a language of
 * its own.
 */
function voicePageOf(page: unknown): {
  voices: ElevenLabsVoice[];
  next?: string;
} {
  if (
    !isRecord(page) ||
    !Array.isArray(page.voices) ||
    typeof page.has_more !== "boolean" ||
    (page.has_more && textOf(page.next_page_token) === undefined) ||
    (page.next_page_token != null && typeof page.next_page_token !== "string")
  ) {
    throw unexpectedResponse();
  }
  const voices = page.voices.map((voice): ElevenLabsVoice => {
    if (
      !isRecord(voice) ||
      typeof voice.voice_id !== "string" ||
      voice.voice_id.trim() === "" ||
      (voice.name != null && typeof voice.name !== "string")
    ) {
      throw unexpectedResponse();
    }
    const id = voice.voice_id;
    return {
      id,
      name: textOf(voice.name) ?? id,
      ...(voice.settings != null && {
        settings: voiceSettingsOf(voice.settings),
      }),
    };
  });
  return {
    voices,
    next:
      page.has_more && typeof page.next_page_token === "string"
        ? page.next_page_token
        : undefined,
  };
}

function modelsOf(value: unknown): Model[] {
  if (!Array.isArray(value)) {
    throw unexpectedResponse();
  }
  return value.flatMap((model): Model[] => {
    if (
      !isRecord(model) ||
      typeof model.model_id !== "string" ||
      model.model_id.trim() === "" ||
      typeof model.can_do_text_to_speech !== "boolean" ||
      (model.name != null && typeof model.name !== "string")
    ) {
      throw unexpectedResponse();
    }
    const id = model.model_id;
    return model.can_do_text_to_speech
      ? [{ id, name: textOf(model.name) ?? id }]
      : [];
  });
}

/** A voice's settings, each one only when it is what ElevenLabs means. */
function voiceSettingsOf(value: unknown): VoiceSettings {
  const numeric = ["stability", "similarity_boost", "style", "speed"];
  if (
    !isRecord(value) ||
    ![...numeric, "use_speaker_boost"].some((key) => key in value) ||
    numeric.some(
      (key) =>
        value[key] != null &&
        (typeof value[key] !== "number" || !Number.isFinite(value[key])),
    ) ||
    (value.use_speaker_boost != null &&
      typeof value.use_speaker_boost !== "boolean")
  ) {
    throw unexpectedResponse();
  }
  const settings = value;
  const number = (name: string) => {
    const found = settings[name];
    return typeof found === "number" && Number.isFinite(found)
      ? found
      : undefined;
  };
  const read: VoiceSettings = {
    stability: number("stability"),
    similarity_boost: number("similarity_boost"),
    style: number("style"),
    speed: number("speed"),
    use_speaker_boost:
      typeof settings.use_speaker_boost === "boolean"
        ? settings.use_speaker_boost
        : undefined,
  };
  return Object.fromEntries(
    Object.entries(read).filter(([, setting]) => setting !== undefined),
  );
}

/** Text without the whitespace around it; never empty. */
function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/** A body as JSON, or nothing when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
