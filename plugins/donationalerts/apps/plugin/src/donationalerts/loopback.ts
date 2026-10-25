import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { parseCallback, type CallbackResult } from "./callback";

/** Another program holds the loopback port, so no Sign-in can be received. */
export class PortInUse extends Error {
  constructor(readonly port: number) {
    super(`Port ${port} is in use by another program`);
  }
}

/** A callback that ends the Sign-in, for better or worse. */
export type SignInAnswer = Exclude<CallbackResult, { kind: "state-mismatch" }>;

export type Loopback = {
  /** The port actually bound — the one asked for, unless that was 0. */
  port: number;
  /** Settles with the first callback that carries this Sign-in's `state`. */
  answer: Promise<SignInAnswer>;
  close(): void;
};

/** A fragment is a few hundred bytes; anything far larger is not one. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * The redirect target of one Sign-in, open only while it is in progress.
 *
 * DonationAlerts redirects the browser to `/callback` with the token in the
 * URL fragment, which a browser never sends to a server. So `GET /callback`
 * serves a page that posts the fragment back to `POST /callback`, where it is
 * checked against `state` — a request without it is refused and the Sign-in
 * keeps waiting, so neither a stale tab nor another local page can end it.
 */
export function openLoopback(options: {
  port: number;
  state: string;
}): Promise<Loopback> {
  let settle: (answer: SignInAnswer) => void = () => {};
  const answer = new Promise<SignInAnswer>((resolve) => (settle = resolve));

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname !== "/callback") {
      response.writeHead(404).end();
      return;
    }

    if (request.method === "GET") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(CALLBACK_PAGE);
      return;
    }

    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }

    void readBody(request).then((body) => {
      const result =
        body === undefined
          ? { kind: "state-mismatch" as const }
          : parseCallback(body, options.state);

      response.writeHead(result.kind === "state-mismatch" ? 400 : 200, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end(PAGE_TEXT[result.kind]);

      if (result.kind !== "state-mismatch") {
        settle(result);
      }
    });
  });

  return new Promise((resolve, reject) => {
    const failToListen = (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE" ? new PortInUse(options.port) : error);
    };
    server.once("error", failToListen);

    // Loopback only: nothing outside this machine can reach the redirect.
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", failToListen);
      // An error once listening must not crash the sidecar; the Sign-in's
      // own timeout ends it.
      server.on("error", (error) => {
        console.error("The sign-in redirect failed:", error.message);
      });

      resolve({
        port: (server.address() as AddressInfo).port,
        answer,
        close() {
          server.close();
          server.closeAllConnections();
        },
      });
    });
  });
}

function readBody(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    let body = "";
    let tooLarge = false;

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
      tooLarge ||= Buffer.byteLength(body) > MAX_BODY_BYTES;
    });
    request.on("end", () => resolve(tooLarge ? undefined : body));
    request.on("error", () => resolve(undefined));
  });
}

const PAGE_TEXT: Record<CallbackResult["kind"], string> = {
  token: "Signed in to DonationAlerts. You can close this tab.",
  denied: "DonationAlerts did not grant access. You can close this tab.",
  malformed:
    "DonationAlerts answered in a way Fluxta does not understand. You can close this tab.",
  "state-mismatch":
    "This is not the sign-in Fluxta is waiting for. Start it again from Fluxta.",
};

// The fragment is removed from the address bar before anything else, so the
// token does not linger in the tab's history.
const CALLBACK_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fluxta — DonationAlerts</title>
    <style>
      body { font: 15px/1.5 system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; padding: 0 1rem; }
    </style>
  </head>
  <body>
    <p id="out">Finishing the sign-in…</p>
    <noscript>Fluxta needs JavaScript on this page to finish the sign-in.</noscript>
    <script>
      const body = location.hash.slice(1) || location.search.slice(1);
      history.replaceState(null, "", location.pathname);
      const out = document.getElementById("out");
      fetch(location.pathname, { method: "POST", body })
        .then((response) => response.text())
        .then((text) => { out.textContent = text; })
        .catch(() => { out.textContent = "Fluxta is no longer waiting for this sign-in. Start it again from Fluxta."; });
    </script>
  </body>
</html>
`;
