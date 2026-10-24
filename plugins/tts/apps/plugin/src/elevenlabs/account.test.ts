import { describe, expect, it, vi } from "vitest";

import { ElevenLabsAccount } from "./account";

/** An account whose stored key is `key` — `null` for none. */
function setup(key: string | null = "sk_one") {
  const stored: { key: string | undefined } = { key: key ?? undefined };
  const report = vi.fn();
  const onChange = vi.fn();
  const account = new ElevenLabsAccount({
    key: () => stored.key,
    onChange,
    report,
  });
  return { account, stored, report, onChange };
}

const lastReport = (report: ReturnType<typeof vi.fn>) =>
  report.mock.calls.at(-1)?.[0];

describe("ElevenLabsAccount", () => {
  it("has no key and no External Connection on a fresh install", () => {
    const { account, report } = setup(null);

    account.keyChanged();

    expect(account.status).toEqual({ state: "no-key" });
    expect(report).not.toHaveBeenCalled();
  });

  it("is checked once a key is stored, and shows in the indicator only once a call has answered", () => {
    const { account, report } = setup();

    account.keyChanged();
    expect(account.status).toEqual({ state: "checking" });
    expect(report).not.toHaveBeenCalled();

    account.outcome({ connected: true }, "sk_one");
    expect(account.status).toEqual({ state: "connected" });
    expect(lastReport(report)).toEqual([
      { id: "elevenlabs", title: "ElevenLabs", connected: true },
    ]);
  });

  it("follows the latest call: not connected with its reason, connected again with the next success", () => {
    const { account, report } = setup();
    account.keyChanged();

    account.outcome(
      { connected: false, reason: "ElevenLabs: Invalid API key" },
      "sk_one",
    );
    expect(account.status).toEqual({
      state: "not-connected",
      reason: "ElevenLabs: Invalid API key",
    });
    expect(lastReport(report)).toEqual([
      { id: "elevenlabs", title: "ElevenLabs", connected: false },
    ]);

    account.outcome({ connected: true }, "sk_one");
    expect(lastReport(report)).toEqual([
      { id: "elevenlabs", title: "ElevenLabs", connected: true },
    ]);
  });

  it("is left as it is by a call that says nothing of the account", () => {
    const { account, onChange } = setup();
    account.keyChanged();
    account.outcome({ connected: true }, "sk_one");
    onChange.mockClear();

    account.outcome(undefined, "sk_one");

    expect(account.status).toEqual({ state: "connected" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a call made with a key since replaced", () => {
    const { account, stored } = setup();
    account.keyChanged();
    stored.key = "sk_two";
    account.keyChanged();

    account.outcome({ connected: true }, "sk_one");

    expect(account.status).toEqual({ state: "checking" });
  });

  it("keeps the indicator through a key replaced, until the new one answers", () => {
    const { account, stored, report } = setup();
    account.keyChanged();
    account.outcome({ connected: true }, "sk_one");
    report.mockClear();

    stored.key = "sk_two";
    account.keyChanged();

    expect(account.status).toEqual({ state: "checking" });
    expect(report).not.toHaveBeenCalled();
  });

  it("takes the External Connection away with the key", () => {
    const { account, stored, report } = setup();
    account.keyChanged();
    account.outcome({ connected: true }, "sk_one");

    stored.key = undefined;
    account.keyChanged();

    expect(account.status).toEqual({ state: "no-key" });
    expect(lastReport(report)).toEqual([]);
  });

  it("tells only of a change, so that the editors' look-ups do not call again and again", () => {
    const { account, report, onChange } = setup();
    account.keyChanged();
    const failed = {
      connected: false as const,
      reason: "Cannot reach ElevenLabs",
    };

    account.outcome(failed, "sk_one");
    account.outcome(failed, "sk_one");
    account.outcome(failed, "sk_one");

    // Checking, then not connected — once each.
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledOnce();
  });
});
