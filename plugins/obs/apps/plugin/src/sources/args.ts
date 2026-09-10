/** Every Value Source here takes a `connection` param — see manifest `sources[].params`. */
export function connectionArg(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return undefined;
  }

  const value = (args as Record<string, unknown>)["connection"];
  return typeof value === "string" ? value : undefined;
}
