/**
 * The one place the plugin talks to the Telegram Bot API.
 *
 * A call is retried while Telegram is briefly unavailable — a network error,
 * a 5xx, or a 429 that names how long to wait — but never past the caller's
 * deadline: an Action has to answer Fluxta well inside its ~30 s timeout, so
 * a retry that could not finish in time is not started. Anything Telegram
 * refuses outright (a bad token, an unknown chat, a malformed request) fails
 * at once, since asking again would get the same answer.
 */

const API_ORIGIN = "https://api.telegram.org";
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 8_000;

export class BotApiError extends Error {
  constructor(
    message: string,
    /** Telegram's `error_code`, or `undefined` when Telegram never answered. */
    readonly code: number | undefined,
    /** Whether asking again later could succeed. */
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "BotApiError";
  }
}

export type BotApiOptions = {
  /** How long the call may take in all, retries included. */
  deadlineMs: number;
};

/** Calls one Bot API method and resolves with its `result`. */
export type CallBotApi = <T>(
  token: string,
  method: string,
  params: Record<string, unknown>,
  options: BotApiOptions,
) => Promise<T>;

export type BotApiDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const defaultDeps: BotApiDeps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

type BotApiResponse =
  | { ok: true; result: unknown }
  | {
      ok: false;
      error_code: number;
      description: string;
      parameters?: { retry_after?: number };
    };

type Attempt =
  | { done: true; result: unknown }
  | { done: false; error: BotApiError; retryAfterMs?: number };

export function createBotApi(deps: BotApiDeps = defaultDeps): CallBotApi {
  async function attempt(
    token: string,
    method: string,
    params: Record<string, unknown>,
    remainingMs: number,
  ): Promise<Attempt> {
    let response: Response;

    try {
      response = await deps.fetch(`${API_ORIGIN}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        // A request that hangs must not outlive the deadline either.
        signal: AbortSignal.timeout(Math.max(remainingMs, 1_000)),
      });
    } catch (error) {
      // Only the error's own message: the request URL carries the token.
      const reason = error instanceof Error ? error.message : String(error);
      return {
        done: false,
        error: new BotApiError(
          `Telegram could not be reached: ${reason}`,
          undefined,
          true,
        ),
      };
    }

    let body: BotApiResponse;

    try {
      body = (await response.json()) as BotApiResponse;
    } catch {
      return {
        done: false,
        error: new BotApiError(
          `Telegram answered with HTTP ${response.status} and no API response`,
          response.status,
          true,
        ),
      };
    }

    if (body.ok) {
      return { done: true, result: body.result };
    }

    const transient = body.error_code === 429 || body.error_code >= 500;
    const retryAfter = body.parameters?.retry_after;

    return {
      done: false,
      error: new BotApiError(body.description, body.error_code, transient),
      retryAfterMs: retryAfter === undefined ? undefined : retryAfter * 1_000,
    };
  }

  return async function callBotApi<T>(
    token: string,
    method: string,
    params: Record<string, unknown>,
    options: BotApiOptions,
  ): Promise<T> {
    const deadline = deps.now() + options.deadlineMs;
    let backoff = FIRST_RETRY_MS;

    for (;;) {
      const outcome = await attempt(
        token,
        method,
        params,
        deadline - deps.now(),
      );

      if (outcome.done) {
        return outcome.result as T;
      }

      if (!outcome.error.transient) {
        throw outcome.error;
      }

      const wait = outcome.retryAfterMs ?? backoff;

      if (deps.now() + wait > deadline) {
        throw outcome.error;
      }

      await deps.sleep(wait);
      backoff = Math.min(backoff * 2, MAX_RETRY_MS);
    }
  };
}
