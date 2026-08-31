import type { ConnectionEntry } from "obs-protocol";

/**
 * The Connection id to actually query live pickers (Scene/Source/Input/
 * Filter) against: the one explicitly chosen, or — when the field is
 * hidden because exactly one Connection is configured (ADR-0001's
 * auto-default) — that sole one.
 *
 * Deliberately never written back into settings: what gets saved stays
 * whatever the author explicitly picked (or nothing), matching the
 * backend's own `resolveConnectionId` fallback. This only fills the gap
 * that left every live picker empty whenever `ConnectionSelect` hid itself —
 * hiding the field never actually told anything which Connection to query.
 */
export function effectiveConnectionId(
  connections: readonly ConnectionEntry[],
  chosen: string | undefined,
): string | undefined {
  return chosen ?? (connections.length === 1 ? connections[0]!.id : undefined);
}
