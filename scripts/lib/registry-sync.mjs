import http from "node:http";
import https from "node:https";
import { isNonEmptyString } from "./shared.mjs";

export const REGISTRY_SYNC_URL_VAR = "REGISTRY_SYNC_URL";
export const REGISTRY_SYNC_TOKEN_VAR = "REGISTRY_SYNC_TOKEN";

const REQUEST_TIMEOUT_MS = 15_000;
const RESPONSE_BODY_PREVIEW_LENGTH = 500;

/**
 * Posts the whole Publication Index to the Fluxta Plugin Registry's
 * `POST /v1/sync` endpoint (`crates/registry` in the Fluxta repository).
 * The post is the full index rather than a delta and syncing is idempotent
 * on the Registry side, so this is safe to call after every successful
 * publication whether or not the index changed.
 *
 * Never throws. Every outcome — unconfigured credentials, an unreachable
 * Registry, a non-200 response — comes back as `{ ok: false, reason }` so the
 * caller can report it without failing a publication that already succeeded
 * against R2, which stays authoritative regardless of this call's outcome.
 */
export async function postPublicationIndex({ url, token, index }) {
  if (!isNonEmptyString(url)) {
    return { ok: false, status: null, reason: `${REGISTRY_SYNC_URL_VAR} is not configured` };
  }
  if (!isNonEmptyString(token)) {
    return { ok: false, status: null, reason: `${REGISTRY_SYNC_TOKEN_VAR} is not configured` };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return {
      ok: false,
      status: null,
      reason: `${REGISTRY_SYNC_URL_VAR} is not a valid URL: ${error.message}`,
    };
  }

  const body = Buffer.from(JSON.stringify(index), "utf8");

  let response;
  try {
    response = await sendRequest(parsedUrl, token, body);
  } catch (error) {
    return { ok: false, status: null, reason: `Registry request failed: ${error.message}` };
  }

  if (response.status === 200) {
    return { ok: true, status: response.status, reason: null };
  }
  return {
    ok: false,
    status: response.status,
    reason:
      `Registry responded with status ${response.status}` +
      (response.text ? `: ${truncate(response.text, RESPONSE_BODY_PREVIEW_LENGTH)}` : ""),
  };
}

/** Keeps an HTTP error body's leading text, where the useful detail is. */
function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function sendRequest(parsedUrl, token, body) {
  const transport = parsedUrl.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          resolve({ status: response.statusCode ?? 0, text: bytes.toString("utf8") });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error(`timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    request.on("error", reject);
    request.end(body);
  });
}
