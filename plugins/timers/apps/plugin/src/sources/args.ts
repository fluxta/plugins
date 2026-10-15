/**
 * A Source's string param, as Fluxta passes it in `ctx.args` — see manifest
 * `sources[].params`. Anything else reads as unset.
 */
export function stringArg(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return undefined;
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
