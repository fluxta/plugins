import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./messages";

describe("isEditorMessage", () => {
  it("accepts every well-formed editor message", () => {
    expect(isEditorMessage({ event: "get-status" })).toBe(true);
    expect(isEditorMessage({ event: "sign-in" })).toBe(true);
    expect(isEditorMessage({ event: "cancel-sign-in" })).toBe(true);
    expect(isEditorMessage({ event: "sign-out" })).toBe(true);
    expect(
      isEditorMessage({
        event: "send-test-donation",
        donation: {
          username: "Mike",
          amount: 100,
          currency: "RUB",
          message: "",
        },
      }),
    ).toBe(true);
  });

  it("refuses a malformed or unknown message", () => {
    expect(isEditorMessage(null)).toBe(false);
    expect(isEditorMessage("sign-in")).toBe(false);
    expect(isEditorMessage({ event: "launch" })).toBe(false);
    expect(
      isEditorMessage({
        event: "send-test-donation",
        donation: {
          username: "Mike",
          amount: "100",
          currency: "RUB",
          message: "",
        },
      }),
    ).toBe(false);
  });
});

describe("isPluginMessage", () => {
  it("accepts every Account state", () => {
    for (const account of [
      { status: "signed-out" },
      { status: "signed-out", problem: "Port 29361 is in use." },
      { status: "signing-in", authorizeUrl: "https://example.com" },
      {
        status: "signed-in",
        name: "MikeRime",
        avatar: "https://example.com/a.png",
        expiresAt: 1_800_000_000_000,
      },
      {
        status: "reauthorization-required",
        name: "MikeRime",
        avatar: "",
        reason: "expired",
        expiresAt: 1_800_000_000_000,
      },
      {
        status: "reauthorization-required",
        name: "MikeRime",
        avatar: "",
        reason: "refused",
        expiresAt: 1_800_000_000_000,
      },
    ]) {
      expect(
        isPluginMessage({ event: "status", status: { account, recent: [] } }),
      ).toBe(true);
    }
  });

  it("accepts every Realtime Connection state", () => {
    const account = {
      status: "signed-in",
      name: "MikeRime",
      avatar: "",
      expiresAt: 1_800_000_000_000,
    };
    for (const realtime of [
      { status: "connecting" },
      { status: "connected" },
      { status: "reconnecting", reason: "connection closed" },
    ]) {
      expect(
        isPluginMessage({
          event: "status",
          status: { account, realtime, recent: [] },
        }),
      ).toBe(true);
    }
  });

  it("accepts Recent Events of every kind", () => {
    const fields = {
      donationId: 1,
      username: "Mike",
      message: "Hi",
      messageType: "text",
      amount: 100,
      currency: "RUB",
      isTest: false,
    };
    const recent = [
      { kind: "donation", at: 1, delivery: "live", fields },
      { kind: "donation", at: 2, delivery: "catch-up", fields },
      { kind: "donation", at: 3, delivery: "test", fields },
      {
        kind: "goal",
        at: 4,
        fields: {
          goalId: 7,
          title: "Mic",
          isActive: true,
          currency: "RUB",
          startAmount: 0,
          raisedAmount: 1,
          goalAmount: 2,
        },
      },
    ];

    expect(
      isPluginMessage({
        event: "status",
        status: { account: { status: "signed-out" }, recent },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          account: { status: "signed-out" },
          recent: [{ kind: "donation", at: 1, delivery: "replayed", fields }],
        },
      }),
    ).toBe(false);
  });

  it("refuses anything else", () => {
    expect(isPluginMessage({ event: "status", status: {} })).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: { account: { status: "signed-in", name: "MikeRime" } },
      }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          account: { status: "signed-out" },
          realtime: { status: "reconnecting" },
        },
      }),
    ).toBe(false);
    expect(isPluginMessage({ event: "chats" })).toBe(false);
  });
});
