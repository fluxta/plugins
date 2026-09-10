import { ConnectionDraftSchema, type ConnectionDraft, type ConnectionEntry } from "./connection";
import type { PickerOption } from "./picker";

/**
 * The message protocol between the Plugin sidecar and its editors.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so the sidecar and every editor page agree on it by
 * construction rather than by convention. Mirrors `platforms-protocol`.
 *
 * Every message is an object with an `event` discriminant.
 */

/** Everything the plugin-wide editor renders. */
export type PluginStatus = {
  /** The sidecar's own version, read from the manifest it shipped with. */
  version: string;
  connections: ConnectionEntry[];
};

/** A message an editor sends to the sidecar. */
export type EditorMessage =
  | { event: "get-status" }
  | { event: "create-connection"; connection: ConnectionDraft }
  | { event: "update-connection"; id: string; connection: ConnectionDraft }
  | { event: "delete-connection"; id: string }
  | { event: "get-scenes"; connectionId: string }
  | { event: "get-scene-sources"; connectionId: string; scene: string }
  | { event: "get-inputs"; connectionId: string }
  | { event: "get-filters"; connectionId: string; source: string };

/**
 * A message the sidecar sends to its editors.
 *
 * A refused Connection write gets its own message rather than a field on the
 * status, same reasoning as Platforms' `reward-refused`: the refusal belongs
 * to the one edit that caused it, not to a snapshot every editor receives.
 *
 * The four live-list replies echo back what they were asked for
 * (`connectionId`, and `scene`/`source` where the list is further scoped) so
 * a picker that changed its selection mid-flight can tell a stale reply from
 * the one it is still waiting for.
 */
export type PluginMessage =
  | { event: "status"; status: PluginStatus }
  | { event: "connection-refused"; message: string }
  | { event: "scenes"; connectionId: string; scenes: PickerOption[] }
  | {
      event: "scene-sources";
      connectionId: string;
      scene: string;
      sources: PickerOption[];
    }
  | { event: "inputs"; connectionId: string; inputs: PickerOption[] }
  | {
      event: "filters";
      connectionId: string;
      source: string;
      filters: PickerOption[];
    };

function hasEvent(value: unknown): value is { event: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "event" in value &&
    typeof (value as { event: unknown }).event === "string"
  );
}

function isConnectionDraft(value: unknown): value is ConnectionDraft {
  return ConnectionDraftSchema.safeParse(value).success;
}

/**
 * Narrows a value that arrived over the wire. Both sides receive `unknown`
 * JSON, so neither should trust the other's shape.
 */
export function isEditorMessage(value: unknown): value is EditorMessage {
  if (!hasEvent(value)) {
    return false;
  }

  const message = value as Record<string, unknown>;

  switch (message["event"]) {
    case "get-status":
      return true;
    case "create-connection":
      return isConnectionDraft(message["connection"]);
    case "update-connection":
      return (
        typeof message["id"] === "string" &&
        isConnectionDraft(message["connection"])
      );
    case "delete-connection":
      return typeof message["id"] === "string";
    case "get-scenes":
    case "get-inputs":
      return typeof message["connectionId"] === "string";
    case "get-scene-sources":
      return (
        typeof message["connectionId"] === "string" &&
        typeof message["scene"] === "string"
      );
    case "get-filters":
      return (
        typeof message["connectionId"] === "string" &&
        typeof message["source"] === "string"
      );
    default:
      return false;
  }
}

export function isPluginMessage(value: unknown): value is PluginMessage {
  if (!hasEvent(value)) {
    return false;
  }

  const message = value as Record<string, unknown>;

  switch (message["event"]) {
    case "status":
    case "connection-refused":
    case "scenes":
    case "scene-sources":
    case "inputs":
    case "filters":
      return true;
    default:
      return false;
  }
}
