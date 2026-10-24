/** What saved settings hold, read without trusting their shape. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A name as it is shown, without the whitespace around it; never empty. */
export function nameOf(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const name = value.trim();
  return name === "" ? undefined : name;
}
