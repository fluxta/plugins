import type { ConnectionStatus } from "obs-protocol";

export const CONNECTION_STATUS_CHANGED_EVENT = "connection-status-changed";

/**
 * Every field declared for `connection-status-changed` in the manifest.
 *
 * `status`'s `select` operand resolves against the `connection-status`
 * Options Source — a fixed three-value list, not a live OBS query (see
 * `options/connection-status.ts`). `message` is only ever non-empty when
 * `status` is "error".
 */
export type ConnectionStatusChangedPayload = {
  connection: string;
  status: ConnectionStatus["status"];
  message: string;
};

export function toConnectionStatusChangedPayload(
  connectionId: string,
  status: ConnectionStatus,
): ConnectionStatusChangedPayload {
  return {
    connection: connectionId,
    status: status.status,
    message: status.status === "error" ? status.message : "",
  };
}
