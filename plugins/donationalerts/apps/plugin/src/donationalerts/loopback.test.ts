import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { openLoopback, PortInUse, type Loopback } from "./loopback";

const STATE = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const FRAGMENT = `access_token=abc&token_type=Bearer&expires_in=60&state=${STATE}`;

let open: Loopback | undefined;

afterEach(() => {
  open?.close();
  open = undefined;
});

async function start(): Promise<Loopback> {
  // Port 0: the OS picks a free one, so tests never collide with a real
  // Sign-in on the fixed port.
  open = await openLoopback({ port: 0, state: STATE });
  return open;
}

function post(loopback: Loopback, body: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${loopback.port}/callback`, {
    method: "POST",
    body,
  });
}

describe("openLoopback", () => {
  it("serves the page that posts the fragment back", async () => {
    const loopback = await start();
    const response = await fetch(`http://127.0.0.1:${loopback.port}/callback`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("location.hash");
  });

  it("answers with the token the browser posts", async () => {
    const loopback = await start();
    const response = await post(loopback, FRAGMENT);

    expect(response.status).toBe(200);
    await expect(loopback.answer).resolves.toEqual({
      kind: "token",
      accessToken: "abc",
      expiresIn: 60,
    });
  });

  it("refuses a wrong state and keeps waiting for the right one", async () => {
    const loopback = await start();
    let settled = false;
    void loopback.answer.then(() => (settled = true));

    const refused = await post(
      loopback,
      "access_token=evil&token_type=Bearer&expires_in=60&state=other",
    );
    expect(refused.status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    await post(loopback, FRAGMENT);
    await expect(loopback.answer).resolves.toMatchObject({
      accessToken: "abc",
    });
  });

  it("answers nothing but /callback", async () => {
    const loopback = await start();
    const response = await fetch(`http://127.0.0.1:${loopback.port}/`);

    expect(response.status).toBe(404);
  });

  it("fails with PortInUse when another program holds the port", async () => {
    const other = createServer();
    await new Promise<void>((resolve) =>
      other.listen(0, "127.0.0.1", () => resolve()),
    );
    const port = (other.address() as AddressInfo).port;

    try {
      await expect(openLoopback({ port, state: STATE })).rejects.toEqual(
        new PortInUse(port),
      );
    } finally {
      other.close();
    }
  });

  it("frees the port once closed", async () => {
    const loopback = await start();
    const { port } = loopback;
    loopback.close();
    open = undefined;

    open = await openLoopback({ port, state: STATE });
    expect(open.port).toBe(port);
  });
});
