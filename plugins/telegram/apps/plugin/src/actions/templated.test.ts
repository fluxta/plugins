import { describe, expect, it } from "vitest";

import { templatedNumber, templatedText } from "./templated";

describe("templatedText", () => {
  it("passes a string through unchanged", () => {
    expect(templatedText("hi alice")).toBe("hi alice");
    expect(templatedText("")).toBe("");
  });

  it("stringifies a number or boolean a single reference resolved to", () => {
    expect(templatedText(42)).toBe("42");
    expect(templatedText(true)).toBe("true");
  });

  it("reads anything else as missing", () => {
    expect(templatedText(undefined)).toBeUndefined();
    expect(templatedText(null)).toBeUndefined();
    expect(templatedText({})).toBeUndefined();
  });
});

describe("templatedNumber", () => {
  it("passes a finite number through", () => {
    expect(templatedNumber(75)).toBe(75);
    expect(templatedNumber(0)).toBe(0);
  });

  it("parses a number typed as text, ignoring surrounding spaces", () => {
    expect(templatedNumber("30")).toBe(30);
    expect(templatedNumber(" 12.5 ")).toBe(12.5);
  });

  it("reads blank text as missing rather than zero", () => {
    expect(templatedNumber("")).toBeUndefined();
    expect(templatedNumber("   ")).toBeUndefined();
  });

  it("reads non-numeric or non-finite values as missing", () => {
    expect(templatedNumber("loud")).toBeUndefined();
    expect(templatedNumber(Number.NaN)).toBeUndefined();
    expect(templatedNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(templatedNumber(undefined)).toBeUndefined();
  });
});
