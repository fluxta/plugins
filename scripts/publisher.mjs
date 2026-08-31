#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

export const R2_ACCOUNT_ID_VAR = "R2_ACCOUNT_ID";
export const R2_ACCESS_KEY_ID_VAR = "R2_ACCESS_KEY_ID";
export const R2_SECRET_ACCESS_KEY_VAR = "R2_SECRET_ACCESS_KEY";
export const R2_BUCKET_VAR = "R2_BUCKET";
export const R2_ENDPOINT_VAR = "R2_ENDPOINT";
export const R2_ENV_VARS = [
  R2_ACCOUNT_ID_VAR,
  R2_ACCESS_KEY_ID_VAR,
  R2_SECRET_ACCESS_KEY_VAR,
  R2_BUCKET_VAR,
];

const R2_REGION = "auto";
const R2_SERVICE = "s3";
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function missingR2Credentials(env) {
  return R2_ENV_VARS.filter((name) => !isNonEmptyString(env[name]));
}

export function createPublisher(kind, options = {}) {
  if (kind === "fake") {
    return createFakePublisher(options);
  }
  if (kind === "r2") {
    return createR2Publisher(options.env ?? process.env);
  }
  throw new Error(`Unknown publisher '${kind}': expected 'fake' or 'r2'.`);
}

export function createFakePublisher(options = {}) {
  const stateDir = options.stateDir ?? null;
  const memory = new Map();

  async function loadBytes(objectKey) {
    if (stateDir) {
      try {
        return await readFile(path.join(stateDir, objectKey));
      } catch {
        return null;
      }
    }
    return memory.get(objectKey) ?? null;
  }

  async function storeBytes(objectKey, bytes) {
    if (stateDir) {
      const target = path.join(stateDir, objectKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return;
    }
    memory.set(objectKey, bytes);
  }

  function describe(bytes) {
    return { size: bytes.length, checksum: sha256Hex(bytes) };
  }

  return {
    name: "fake",
    async getObject(objectKey) {
      const bytes = await loadBytes(objectKey);
      if (bytes === null) {
        return null;
      }
      return { bytes, ...describe(bytes) };
    },
    async headObject(objectKey) {
      const bytes = await loadBytes(objectKey);
      return bytes === null ? null : { size: bytes.length };
    },
    async putObject(objectKey, bytes) {
      await storeBytes(objectKey, bytes);
      return { objectKey, ...describe(bytes) };
    },
    async putObjectIfAbsent(objectKey, bytes) {
      if ((await loadBytes(objectKey)) !== null) {
        return { objectKey, refused: true };
      }
      await storeBytes(objectKey, bytes);
      return { objectKey, ...describe(bytes) };
    },
  };
}

export function createR2Publisher(env) {
  const missing = missingR2Credentials(env);
  if (missing.length > 0) {
    throw new Error(
      "R2 publishing requires environment variables " +
        missing.map((name) => `'${name}'`).join(", ") +
        ".",
    );
  }

  const accessKeyId = env[R2_ACCESS_KEY_ID_VAR];
  const secretAccessKey = env[R2_SECRET_ACCESS_KEY_VAR];
  const bucket = env[R2_BUCKET_VAR];
  const endpoint = new URL(
    env[R2_ENDPOINT_VAR] ?? `https://${env[R2_ACCOUNT_ID_VAR]}.r2.cloudflarestorage.com`,
  );

  async function signedRequest(method, objectKey, bytes) {
    const payloadHash = bytes === undefined ? EMPTY_SHA256 : sha256Hex(bytes);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const resourcePath = `/${bucket}/${encodeObjectKey(objectKey)}`;
    const signedHeaderNames = ["host", "x-amz-content-sha256", "x-amz-date"];
    const canonicalHeaders = [
      `host:${endpoint.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join("\n");
    const canonicalRequest = [
      method,
      resourcePath,
      "",
      `${canonicalHeaders}\n`,
      signedHeaderNames.join(";"),
      payloadHash,
    ].join("\n");
    const scope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signature = hmacHex(signingKey(secretAccessKey, dateStamp), stringToSign);
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`;

    return sendHttpRequest({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: Number(endpoint.port) || (endpoint.protocol === "https:" ? 443 : 80),
      path: resourcePath,
      method,
      headers: {
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authorization,
      },
      body: bytes,
    });
  }

  function assertOkStatus(response, operation, objectKey) {
    if (response.status === 200 || response.status === 204) {
      return;
    }
    throw new Error(
      `R2 ${operation} '${objectKey}' failed with status ${response.status}: ${response.text}`,
    );
  }

  async function getObject(objectKey) {
    const response = await signedRequest("GET", objectKey);
    if (response.status === 404) {
      return null;
    }
    assertOkStatus(response, "GET", objectKey);
    return {
      bytes: response.bytes,
      size: response.bytes.length,
      checksum: sha256Hex(response.bytes),
    };
  }

  async function headObject(objectKey) {
    const response = await signedRequest("HEAD", objectKey);
    if (response.status === 404) {
      return null;
    }
    assertOkStatus(response, "HEAD", objectKey);
    return { size: Number(response.headers["content-length"] ?? 0) };
  }

  async function putObject(objectKey, bytes) {
    const response = await signedRequest("PUT", objectKey, bytes);
    assertOkStatus(response, "PUT", objectKey);
    return { objectKey, size: bytes.length, checksum: sha256Hex(bytes) };
  }

  async function putObjectIfAbsent(objectKey, bytes) {
    const existing = await headObject(objectKey);
    if (existing) {
      return { objectKey, refused: true };
    }
    return putObject(objectKey, bytes);
  }

  return { name: "r2", getObject, headObject, putObject, putObjectIfAbsent };
}

function encodeObjectKey(objectKey) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sendHttpRequest({ protocol, hostname, port, path: resourcePath, method, headers, body }) {
  const transport = protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      { method, hostname, port, path: resourcePath, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            bytes,
            text: bytes.toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    if (body) {
      request.end(body);
    } else {
      request.end();
    }
  });
}

function signingKey(secretAccessKey, dateStamp) {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacSha256(dateKey, R2_REGION);
  const serviceKey = hmacSha256(regionKey, R2_SERVICE);
  return hmacSha256(serviceKey, "aws4_request");
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

function hmacHex(key, data) {
  return hmacSha256(key, data).toString("hex");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
