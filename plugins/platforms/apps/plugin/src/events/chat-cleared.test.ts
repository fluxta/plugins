import { describe, expect, it } from "vitest";

import { toChatClearedPayload } from "./chat-cleared";

describe("toChatClearedPayload", () => {
  it("carries nothing beyond that it fired", () => {
    expect(toChatClearedPayload()).toEqual({});
  });
});
