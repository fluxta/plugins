import { describe, expect, it } from "vitest";

import { validateConnectionDraft, type Connection, type ConnectionDraft } from "./connection";

function draft(overrides: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return { name: "Main PC", host: "127.0.0.1", port: 4455, ...overrides };
}

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "conn-1",
    name: "Main PC",
    host: "127.0.0.1",
    port: 4455,
    hasPassword: false,
    ...overrides,
  };
}

describe("validateConnectionDraft", () => {
  it("accepts a filled-in connection", () => {
    expect(validateConnectionDraft(draft(), [])).toBeUndefined();
  });

  it("refuses a connection with no name", () => {
    expect(validateConnectionDraft(draft({ name: "   " }), [])).toMatch(/name/i);
  });

  it("refuses a name longer than the limit", () => {
    expect(validateConnectionDraft(draft({ name: "x".repeat(61) }), [])).toMatch(/60/);
  });

  it("refuses a connection with no host", () => {
    expect(validateConnectionDraft(draft({ host: "  " }), [])).toMatch(/host/i);
  });

  it("refuses a port outside the valid range", () => {
    expect(validateConnectionDraft(draft({ port: 0 }), [])).toMatch(/port/i);
    expect(validateConnectionDraft(draft({ port: 65536 }), [])).toMatch(/port/i);
  });

  it("refuses a fractional port", () => {
    expect(validateConnectionDraft(draft({ port: 4455.5 }), [])).toMatch(/port/i);
  });

  it("refuses a name another connection already uses", () => {
    expect(
      validateConnectionDraft(draft({ name: "Main PC" }), [connection({ id: "other" })]),
    ).toMatch(/already/i);
  });

  it("allows keeping its own name when editing", () => {
    expect(
      validateConnectionDraft(draft({ name: "Main PC" }), [connection({ id: "conn-1" })], "conn-1"),
    ).toBeUndefined();
  });
});
