import type { Options } from "@fluxta/sdk/api";

import type { ConnectionsStore } from "../connections/store";

export const CONNECTIONS_OPTIONS = "connections";

/** The configured Connections, for the `connection` operand/param everywhere else reads. */
export function createConnectionsOptions(store: ConnectionsStore): Options {
  return {
    key: CONNECTIONS_OPTIONS,
    resolve: () => store.list().map((connection) => ({ value: connection.id, label: connection.name })),
  };
}
