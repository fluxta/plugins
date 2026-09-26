import { describe, expect, it } from "vitest";

import { toViewerCountChangedPayload } from "./viewer-count-changed";

describe("toViewerCountChangedPayload", () => {
  it("carries the new count, the channel and the platform", () => {
    expect(toViewerCountChangedPayload(1234)).toEqual({
      viewerCount: 1234,
    });
  });

  it("keeps a count of zero a real number, not an empty value", () => {
    expect(toViewerCountChangedPayload(0).viewerCount).toBe(0);
  });
});
