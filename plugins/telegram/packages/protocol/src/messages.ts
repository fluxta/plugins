import { ChatDraftSchema, type ChatDraft, type ChatEntry } from "./chat";

/**
 * The message protocol between the Plugin sidecar and its editors.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so the sidecar and every editor page agree on it by
 * construction rather than by convention.
 *
 * Every message is an object with an `event` discriminant.
 */

/** Everything the Plugin Editor renders. */
export type PluginStatus = {
  chats: ChatEntry[];
};

/** A message an editor sends to the sidecar. */
export type EditorMessage =
  | { event: "get-status" }
  | { event: "create-chat"; chat: ChatDraft }
  | { event: "update-chat"; id: string; chat: ChatDraft }
  | { event: "delete-chat"; id: string }
  | { event: "check-chat"; id: string };

/**
 * A message the sidecar sends to its editors.
 *
 * A refused Chat write gets its own message rather than a field on the
 * status: the refusal belongs to the one edit that caused it, not to a
 * snapshot every editor receives.
 */
export type PluginMessage =
  | { event: "status"; status: PluginStatus }
  | { event: "chat-refused"; message: string };

function hasEvent(value: unknown): value is { event: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "event" in value &&
    typeof (value as { event: unknown }).event === "string"
  );
}

function isChatDraft(value: unknown): value is ChatDraft {
  return ChatDraftSchema.safeParse(value).success;
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
    case "create-chat":
      return isChatDraft(message["chat"]);
    case "update-chat":
      return typeof message["id"] === "string" && isChatDraft(message["chat"]);
    case "delete-chat":
    case "check-chat":
      return typeof message["id"] === "string";
    default:
      return false;
  }
}

export function isPluginMessage(value: unknown): value is PluginMessage {
  if (!hasEvent(value)) {
    return false;
  }

  switch (value.event) {
    case "status":
    case "chat-refused":
      return true;
    default:
      return false;
  }
}
