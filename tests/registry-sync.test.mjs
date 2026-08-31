import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  REGISTRY_SYNC_TOKEN_VAR,
  REGISTRY_SYNC_URL_VAR,
  postPublicationIndex,
} from "../scripts/lib/registry-sync.mjs";
import { runRegistrySync, withTempDir } from "./helpers.mjs";

const SAMPLE_INDEX = {
  schemaVersion: 1,
  packages: [
    {
      name: "example.plugin",
      versions: [
        {
          version: "1.2.3",
          manifest: { name: "example.plugin", version: "1.2.3" },
          packageMetadata: {},
          artifact: {
            objectKey: "artifacts/example.plugin-1.2.3.zip",
            checksum: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            size: 1,
            sourceCommit: "c".repeat(40),
            publishedAt: "2026-08-06T12:00:00.000Z",
          },
          status: "published",
          reason: null,
        },
      ],
    },
  ],
};

/**
 * Stands in for the Registry's `POST /v1/sync` (crates/registry/src/routes.rs
 * in the Fluxta repository): records every request it receives and answers
 * with whatever `respond` decides, so tests can drive both the happy path and
 * a rejected or broken response without a real Registry.
 */
async function withStubRegistry(respond, run) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization ?? null,
        contentType: request.headers["content-type"] ?? null,
        body,
      });
      respond(request, response, body);
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    return await run({ url: `http://127.0.0.1:${port}/v1/sync`, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function bearerCheckingResponder(expectedToken) {
  return (request, response) => {
    if (request.headers.authorization !== `Bearer ${expectedToken}`) {
      response.writeHead(401).end("unauthorized");
      return;
    }
    response.writeHead(200).end();
  };
}

test("postPublicationIndex posts the whole index with the bearer token and succeeds on 200", async () => {
  await withStubRegistry(bearerCheckingResponder("the-token"), async ({ url, requests }) => {
    const outcome = await postPublicationIndex({ url, token: "the-token", index: SAMPLE_INDEX });

    assert.deepEqual(outcome, { ok: true, status: 200, reason: null });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].authorization, "Bearer the-token");
    assert.match(requests[0].contentType, /application\/json/);
    assert.deepEqual(JSON.parse(requests[0].body.toString("utf8")), SAMPLE_INDEX);
  });
});

test("postPublicationIndex reports a non-200 response without throwing", async () => {
  await withStubRegistry(bearerCheckingResponder("the-token"), async ({ url }) => {
    const outcome = await postPublicationIndex({ url, token: "wrong-token", index: SAMPLE_INDEX });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.status, 401);
    assert.match(outcome.reason, /status 401/);
    assert.match(outcome.reason, /unauthorized/);
  });
});

test("postPublicationIndex reports an unreachable Registry without throwing", async () => {
  // Port 1 is privileged to bind but not to connect to, and nothing in this
  // test suite listens there, so the connection is reliably refused.
  const outcome = await postPublicationIndex({
    url: "http://127.0.0.1:1",
    token: "the-token",
    index: SAMPLE_INDEX,
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, null);
  assert.match(outcome.reason, /request failed/);
});

test("postPublicationIndex reports missing configuration by name instead of making a request", async () => {
  const missingUrl = await postPublicationIndex({ url: undefined, token: "t", index: SAMPLE_INDEX });
  assert.equal(missingUrl.ok, false);
  assert.match(missingUrl.reason, new RegExp(REGISTRY_SYNC_URL_VAR));

  const missingToken = await postPublicationIndex({
    url: "http://127.0.0.1:1",
    token: undefined,
    index: SAMPLE_INDEX,
  });
  assert.equal(missingToken.ok, false);
  assert.match(missingToken.reason, new RegExp(REGISTRY_SYNC_TOKEN_VAR));
});

test("postPublicationIndex reports an invalid URL without making a request", async () => {
  const outcome = await postPublicationIndex({
    url: "not a url",
    token: "the-token",
    index: SAMPLE_INDEX,
  });
  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /not a valid URL/);
});

async function writeResultFile(root, publicationIndex) {
  const resultPath = path.join(root, "publish-output", "result.json");
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(
    resultPath,
    JSON.stringify({ schemaVersion: 1, ok: true, mode: "publish", publicationIndex }, null, 2),
  );
  return resultPath;
}

test("registry-sync CLI posts the publicationIndex recorded in a publish result file", async () => {
  await withTempDir(async (root) => {
    const resultPath = await writeResultFile(root, SAMPLE_INDEX);

    await withStubRegistry(bearerCheckingResponder("the-token"), async ({ url, requests }) => {
      const result = await runRegistrySync(["--result", resultPath], {
        env: { ...process.env, REGISTRY_SYNC_URL: url, REGISTRY_SYNC_TOKEN: "the-token" },
      });

      assert.equal(result.code, 0, `unexpected registry-sync output: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, /Posted the Publication Index \(1 package\)/);
      assert.equal(requests.length, 1);
      assert.deepEqual(JSON.parse(requests[0].body.toString("utf8")), SAMPLE_INDEX);
    });
  });
});

test("registry-sync CLI reports a failed sync without a stack trace or a thrown error", async () => {
  await withTempDir(async (root) => {
    const resultPath = await writeResultFile(root, SAMPLE_INDEX);

    const result = await runRegistrySync(["--result", resultPath], {
      env: {
        ...process.env,
        REGISTRY_SYNC_URL: "http://127.0.0.1:1",
        REGISTRY_SYNC_TOKEN: "the-token",
      },
    });

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /::warning::Plugin Registry sync failed/);
    assert.match(result.stdout, /non-blocking; R2 stays authoritative/);
  });
});

test("registry-sync CLI reports a result file with no publicationIndex", async () => {
  await withTempDir(async (root) => {
    const resultPath = path.join(root, "result.json");
    await writeFile(resultPath, JSON.stringify({ ok: false }));

    const result = await runRegistrySync(["--result", resultPath], {
      env: { ...process.env, REGISTRY_SYNC_URL: "http://127.0.0.1:1", REGISTRY_SYNC_TOKEN: "t" },
    });

    assert.equal(result.code, 1);
    assert.match(result.stdout, /::warning::Plugin Registry sync skipped/);
    assert.match(result.stdout, /carries no publicationIndex/);
  });
});

test("registry-sync CLI requires --result", async () => {
  const result = await runRegistrySync([]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--result <file>/);
});
