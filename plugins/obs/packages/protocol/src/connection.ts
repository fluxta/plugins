import { z } from "zod";

export const CONNECTION_NAME_MAX = 60;

/**
 * What the editor sends to create or change a Connection.
 *
 * `password` means different things depending on which message carries it
 * (see {@link EditorMessage}'s `create-connection` vs `update-connection`):
 * on create, an absent password means "no password" (obs-websocket without
 * authentication enabled); on update, an absent password means "leave the
 * stored one unchanged" — the editor never has the stored password to send
 * back, so there is no other way to say "I didn't touch this field".
 */
export type ConnectionDraft = {
  name: string;
  host: string;
  port: number;
  password?: string;
};

export const ConnectionDraftSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  password: z.string().optional(),
});

/** obs-websocket's own default port. */
export const DEFAULT_OBS_PORT = 4455;

/**
 * One configured Connection as the editor sees it — never the password
 * itself, only whether one is stored, so a reopened form shows a placeholder
 * rather than a secret (see the plugin-wide editor's masking behaviour).
 */
export type Connection = {
  id: string;
  name: string;
  host: string;
  port: number;
  hasPassword: boolean;
};

/**
 * A Connection's live WebSocket state, independent of whether it is
 * configured correctly — a Connection can sit in `connecting` indefinitely
 * while OBS is closed, which is expected, not an error.
 */
export type ConnectionStatus =
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "error"; message: string };

export type ConnectionEntry = Connection & { status: ConnectionStatus };

/**
 * Refuses a draft the same way the plugin will, so the editor can catch a
 * problem before round-tripping it — mirrors `validateRewardDraft` in
 * `platforms-protocol`.
 */
export function validateConnectionDraft(
  draft: ConnectionDraft,
  others: readonly Connection[],
  editingId?: string,
): string | undefined {
  const name = draft.name.trim();

  if (!name) {
    return "Give this Connection a name.";
  }

  if (name.length > CONNECTION_NAME_MAX) {
    return `Connection names are at most ${CONNECTION_NAME_MAX} characters.`;
  }

  if (others.some((other) => other.id !== editingId && other.name === name)) {
    return `Another Connection is already named "${name}".`;
  }

  if (!draft.host.trim()) {
    return "Give this Connection a host — usually 127.0.0.1 for OBS on this machine.";
  }

  if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) {
    return "Port must be a whole number between 1 and 65535.";
  }

  return undefined;
}
