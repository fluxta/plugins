/**
 * Turns a failed Twitch call into one line worth showing a streamer.
 *
 * twurple's own message carries the request URL, the method and the raw body,
 * which is what a maintainer wants from a stack trace and not what a streamer
 * needs from an editor. Twitch's own `message` is usually the whole story, so
 * that is what comes out, with the status code kept as the part that says how
 * to read it — a 403 means "not allowed", a 400 means "not accepted".
 */
export function explainTwitchError(error: unknown): string {
  const status = statusOf(error);
  const message = messageFrom(bodyOf(error)) ?? fallback(error);

  return status ? `${message} (HTTP ${status})` : message;
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown })?.statusCode;
  return typeof status === "number" ? status : undefined;
}

function bodyOf(error: unknown): string | undefined {
  const body = (error as { body?: unknown })?.body;
  return typeof body === "string" ? body : undefined;
}

function messageFrom(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message = parsed["message"] ?? parsed["error"];
    return typeof message === "string" && message.length > 0 ? message : undefined;
  } catch {
    return undefined;
  }
}

function fallback(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  // Keep the first line: twurple puts the summary there and the request dump
  // on the ones after it.
  return error.message.split("\n")[0] ?? error.message;
}
