import { createHash } from "node:crypto";
import http from "node:http";
import assert from "node:assert/strict";
import test from "node:test";

import {
  R2_ENV_VARS,
  createFakePublisher,
  createPublisher,
  createR2Publisher,
} from "../scripts/publisher.mjs";
import { withTempDir } from "./helpers.mjs";

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function r2Credentials() {
  const credentials = {};
  for (const name of R2_ENV_VARS) {
    credentials[name] = `value-of-${name}`;
  }
  return credentials;
}

/**
 * Runs an S3-shaped object store over plain HTTP so the r2 publisher exercises
 * its real signed-request path. Requests are recorded so tests can assert on
 * the methods and signing headers the publisher actually sent.
 */
async function withStubObjectStore(run) {
  const objects = new Map();
  const requests = [];

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization ?? null,
        contentSha256: request.headers["x-amz-content-sha256"] ?? null,
      });

      if (request.url.includes("/refuse-me/")) {
        response.writeHead(503).end("store unavailable");
        return;
      }

      if (request.method === "PUT") {
        objects.set(request.url, Buffer.concat(chunks));
        response.writeHead(200).end();
        return;
      }

      const stored = objects.get(request.url);
      if (!stored) {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, { "content-length": String(stored.length) });
      response.end(request.method === "HEAD" ? undefined : stored);
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    return await run({
      env: { ...r2Credentials(), R2_ENDPOINT: `http://127.0.0.1:${port}` },
      bucket: r2Credentials().R2_BUCKET,
      objects,
      requests,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("the fake publisher records intended object writes with checksums and sizes", async () => {
  const publisher = createFakePublisher();
  const bytes = Buffer.from("artifact bytes");

  const written = await publisher.putObject("artifacts/example.plugin-1.2.3.zip", bytes);
  assert.deepEqual(written, {
    objectKey: "artifacts/example.plugin-1.2.3.zip",
    size: bytes.length,
    checksum: sha256Hex(bytes),
  });

  const object = await publisher.getObject("artifacts/example.plugin-1.2.3.zip");
  assert.deepEqual(object.bytes, bytes);
  assert.equal(object.size, bytes.length);
  assert.equal(object.checksum, sha256Hex(bytes));

  assert.equal(await publisher.getObject("not-written"), null);
  assert.equal(await publisher.headObject("not-written"), null);
});

test("the fake publisher refuses to overwrite an existing object", async () => {
  const publisher = createFakePublisher();
  const firstBytes = Buffer.from("first bytes");
  const differentBytes = Buffer.from("different bytes");

  await publisher.putObject("artifacts/example.plugin-1.2.3.zip", firstBytes);

  const refused = await publisher.putObjectIfAbsent(
    "artifacts/example.plugin-1.2.3.zip",
    differentBytes,
  );
  assert.equal(refused.refused, true);
  assert.equal(refused.objectKey, "artifacts/example.plugin-1.2.3.zip");

  const object = await publisher.getObject("artifacts/example.plugin-1.2.3.zip");
  assert.deepEqual(object.bytes, firstBytes, "the existing object is not overwritten");

  const written = await publisher.putObjectIfAbsent(
    "artifacts/example.plugin-1.2.4.zip",
    differentBytes,
  );
  assert.equal(written.refused, undefined);
  assert.equal(written.objectKey, "artifacts/example.plugin-1.2.4.zip");
  assert.deepEqual(
    (await publisher.getObject("artifacts/example.plugin-1.2.4.zip")).bytes,
    differentBytes,
  );
});

test("the fake publisher persists objects across instances through a state directory", async () => {
  await withTempDir(async (root) => {
    const stateDir = `${root}/store`;
    const bytes = Buffer.from("persisted bytes");

    await createFakePublisher({ stateDir }).putObject(
      "artifacts/example.plugin-1.2.3.zip",
      bytes,
    );

    const reloaded = createFakePublisher({ stateDir });
    const object = await reloaded.getObject("artifacts/example.plugin-1.2.3.zip");
    assert.deepEqual(object.bytes, bytes);
    assert.equal(object.checksum, sha256Hex(bytes));
  });
});

test("createPublisher resolves fake and r2 kinds and rejects unknown kinds", () => {
  assert.equal(createPublisher("fake").name, "fake");
  assert.equal(createPublisher("r2", { env: r2Credentials() }).name, "r2");
  assert.throws(() => createPublisher("unknown-kind"), /Unknown publisher 'unknown-kind'/);
});

test("the r2 publisher requires Cloudflare R2 credentials and fails with a clear message", () => {
  assert.throws(
    () => createR2Publisher({}),
    new RegExp(R2_ENV_VARS.map((name) => `'${name}'`).join(".*")),
  );
});

test("the r2 publisher exposes the object operations when credentials are configured", () => {
  const publisher = createR2Publisher(r2Credentials());
  assert.equal(publisher.name, "r2");
  for (const operation of ["getObject", "headObject", "putObject", "putObjectIfAbsent"]) {
    assert.equal(typeof publisher[operation], "function", `${operation} must be defined`);
  }
});

test("the r2 publisher signs and completes every object operation against the store", async () => {
  await withStubObjectStore(async ({ env, bucket, requests }) => {
    const publisher = createR2Publisher(env);
    const objectKey = "artifacts/example.plugin-1.2.3.zip";
    const bytes = Buffer.from("artifact bytes");

    assert.equal(await publisher.getObject(objectKey), null, "an absent object reads as null");
    assert.equal(await publisher.headObject(objectKey), null);

    const written = await publisher.putObject(objectKey, bytes);
    assert.deepEqual(written, {
      objectKey,
      size: bytes.length,
      checksum: sha256Hex(bytes),
    });

    const object = await publisher.getObject(objectKey);
    assert.deepEqual(object.bytes, bytes);
    assert.equal(object.checksum, sha256Hex(bytes));
    assert.equal((await publisher.headObject(objectKey)).size, bytes.length);

    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET", "HEAD", "PUT", "GET", "HEAD"],
    );
    for (const request of requests) {
      assert.equal(request.url, `/${bucket}/${objectKey}`);
      assert.match(request.authorization, /^AWS4-HMAC-SHA256 Credential=/);
      assert.match(request.contentSha256, /^[0-9a-f]{64}$/);
    }
  });
});

test("the r2 publisher refuses to overwrite an existing object", async () => {
  await withStubObjectStore(async ({ env, objects, bucket }) => {
    const publisher = createR2Publisher(env);
    const objectKey = "artifacts/example.plugin-1.2.3.zip";
    const firstBytes = Buffer.from("first bytes");
    const differentBytes = Buffer.from("different bytes");

    const written = await publisher.putObjectIfAbsent(objectKey, firstBytes);
    assert.equal(written.refused, undefined);
    assert.equal(written.checksum, sha256Hex(firstBytes));

    const refused = await publisher.putObjectIfAbsent(objectKey, differentBytes);
    assert.deepEqual(refused, { objectKey, refused: true });
    assert.deepEqual(
      objects.get(`/${bucket}/${objectKey}`),
      firstBytes,
      "the existing object is not overwritten",
    );
  });
});

test("the r2 publisher reports a failing store with its status and body", async () => {
  await withStubObjectStore(async ({ env }) => {
    const publisher = createR2Publisher(env);
    await assert.rejects(
      () => publisher.putObject("refuse-me/example.zip", Buffer.from("bytes")),
      /R2 PUT 'refuse-me\/example.zip' failed with status 503: store unavailable/,
    );
  });
});
