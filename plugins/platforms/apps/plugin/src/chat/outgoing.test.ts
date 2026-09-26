import { describe, expect, it } from "vitest";

import { OutgoingMessages } from "./outgoing";

describe("OutgoingMessages", () => {
  it("does not claim a message it never sent", () => {
    expect(new OutgoingMessages().claim("bot", "hello", 0)).toBe(false);
  });

  it("claims a message it sent, so the Event does not fire for it", () => {
    const outgoing = new OutgoingMessages();
    outgoing.remember("bot", "hello", 0);

    expect(outgoing.claim("bot", "hello", 10)).toBe(true);
  });

  it("claims each send exactly once", () => {
    const outgoing = new OutgoingMessages();
    outgoing.remember("bot", "hello", 0);

    expect(outgoing.claim("bot", "hello", 10)).toBe(true);
    // A viewer echoing the same words must still reach the Event.
    expect(outgoing.claim("bot", "hello", 20)).toBe(false);
  });

  it("claims twice when the same text was sent twice", () => {
    const outgoing = new OutgoingMessages();
    outgoing.remember("bot", "hello", 0);
    outgoing.remember("bot", "hello", 5);

    expect(outgoing.claim("bot", "hello", 10)).toBe(true);
    expect(outgoing.claim("bot", "hello", 11)).toBe(true);
    expect(outgoing.claim("bot", "hello", 12)).toBe(false);
  });

  it("keeps accounts apart", () => {
    const outgoing = new OutgoingMessages();
    outgoing.remember("bot", "hello", 0);

    expect(outgoing.claim("viewer", "hello", 10)).toBe(false);
  });

  it("stops suppressing once the record has aged out", () => {
    const outgoing = new OutgoingMessages(1000);
    outgoing.remember("bot", "hello", 0);

    expect(outgoing.claim("bot", "hello", 2000)).toBe(false);
  });

  it("forgets a send that failed, so a real message still gets through", () => {
    const outgoing = new OutgoingMessages();
    outgoing.remember("bot", "hello", 0);
    outgoing.discard("bot", "hello", 5);

    expect(outgoing.claim("bot", "hello", 10)).toBe(false);
  });
});
