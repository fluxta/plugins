/**
 * Reads one string key out of an Options Source's `args` — the Source's own
 * `params` record, or (for an Event Field) the sibling fields currently
 * filtered in the same Event Filter, keyed by their Field key. Either way,
 * `args` is the whole ambient scope, not a manifest-declared subset — see
 * docs/adr/0004.
 */
export function stringArg(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return undefined;
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
