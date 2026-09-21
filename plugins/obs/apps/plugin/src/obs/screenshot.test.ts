import { describe, expect, it } from "vitest";

import { formatFromPath } from "./screenshot";

describe("formatFromPath", () => {
  it("maps common extensions to their OBS image format", () => {
    expect(formatFromPath("C:\\shots\\test.png")).toBe("png");
    expect(formatFromPath("/home/user/test.jpg")).toBe("jpg");
    expect(formatFromPath("/home/user/test.jpeg")).toBe("jpg");
    expect(formatFromPath("/home/user/test.bmp")).toBe("bmp");
  });

  it("is case-insensitive", () => {
    expect(formatFromPath("test.PNG")).toBe("png");
  });

  it("returns undefined for an unsupported or missing extension", () => {
    expect(formatFromPath("test.webp")).toBeUndefined();
    expect(formatFromPath("test")).toBeUndefined();
  });
});
