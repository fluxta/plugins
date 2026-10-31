import { Plugin } from "@fluxta/sdk/api";

/**
 * The single Plugin instance for this sidecar. Actions and editor listeners
 * all register against it before `connect()` is called.
 */
export const plugin = new Plugin();
