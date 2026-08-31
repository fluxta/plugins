import type { OBSWebSocket } from "obs-websocket-js";

import type { ConnectionsService } from "./service";

/**
 * Settings carrying a `connection` field resolve against the sole configured
 * Connection when unset — an Action saved before a second Connection existed
 * keeps working without ever having named one (ADR-0001).
 */
export function resolveConnectionId(
  connections: ConnectionsService,
  settings: { connection?: string },
): string | undefined {
  return settings.connection ?? connections.soleId();
}

/** The live OBS client an Action or Value Source should act against, or `undefined` if there isn't one. */
export function resolveObs(
  connections: ConnectionsService,
  settings: { connection?: string },
): OBSWebSocket | undefined {
  const id = resolveConnectionId(connections, settings);
  return id ? connections.obsOf(id) : undefined;
}
