export * from "./action";
export * from "./command";
export * from "./reward";

import { CommandSchema, type Command } from "./command";
import { RewardDraftSchema, type Reward, type RewardDraft } from "./reward";

/**
 * The message protocol between the Plugin sidecar and its editors.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so the sidecar and every editor page agree on it by
 * construction rather than by convention.
 *
 * Every message is an object with an `event` discriminant.
 */

/** Which Account a message or state is about. */
export type AccountRole = "broadcaster" | "bot";

export const ACCOUNT_ROLES: readonly AccountRole[] = ["broadcaster", "bot"];

/**
 * What an editor shows for one Account slot.
 *
 * `authorizing` carries what the user needs if the browser did not open: the
 * address to visit and the code to enter there.
 *
 * `reauthorization-required` is not an error — a refresh token dies after 30
 * days of inactivity, so a streamer returning from a break lands here.
 */
export type AccountState =
  | { status: "disconnected" }
  | {
      status: "authorizing";
      userCode: string;
      verificationUri: string;
      /** Epoch milliseconds after which the device code stops working. */
      expiresAt: number;
    }
  | { status: "connected"; login: string; displayName: string }
  | { status: "reauthorization-required"; login: string }
  | { status: "error"; message: string };

export type AccountsState = Record<AccountRole, AccountState>;

/**
 * Whether the plugin is receiving events from Twitch.
 *
 * One WebSocket carries every subscription, so this is one state for all of
 * them. `idle` is not a fault — with no Broadcaster Account there is nothing
 * to listen to, and the plugin deliberately does not try.
 */
export type EventSubState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "listening"; channel: string }
  | { status: "error"; message: string };

/**
 * The Channel's Rewards, as the sidecar last saw them on Twitch.
 *
 * `idle` is not a fault — Rewards belong to the Broadcaster Account, so with
 * none connected there is no channel to list and the plugin does not ask.
 */
export type RewardsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rewards: Reward[] }
  | { status: "error"; message: string };

/** Everything the plugin editor renders. */
export type PluginStatus = {
  /** The sidecar's own version, read from the manifest it shipped with. */
  version: string;
  accounts: AccountsState;
  events: EventSubState;
  commands: Command[];
  rewards: RewardsState;
};

/** A message an editor sends to the sidecar. */
export type EditorMessage =
  | { event: "get-status" }
  | { event: "connect-account"; role: AccountRole }
  | { event: "cancel-authorization"; role: AccountRole }
  | { event: "disconnect-account"; role: AccountRole }
  | { event: "save-command"; command: Command }
  | { event: "delete-command"; id: string }
  | { event: "refresh-rewards" }
  | { event: "create-reward"; reward: RewardDraft }
  | { event: "update-reward"; id: string; reward: RewardDraft }
  | { event: "delete-reward"; id: string };

/**
 * A message the sidecar sends to its editors.
 *
 * A refused Reward write gets its own message rather than a field on the
 * status: Twitch is the one refusing, its reason belongs to the one edit that
 * caused it, and a snapshot everybody receives is the wrong place to carry it.
 */
export type PluginMessage =
  | { event: "status"; status: PluginStatus }
  | { event: "reward-refused"; message: string };

/**
 * Narrows a value that arrived over the wire. Both sides receive `unknown`
 * JSON, so neither should trust the other's shape.
 */
export function isEditorMessage(value: unknown): value is EditorMessage {
  if (!hasEvent(value)) {
    return false;
  }

  switch (value.event) {
    case "get-status":
      return true;
    case "connect-account":
    case "cancel-authorization":
    case "disconnect-account":
      return isAccountRole((value as { role?: unknown }).role);
    case "save-command":
      return CommandSchema.safeParse((value as { command?: unknown }).command).success;
    case "delete-command":
    case "delete-reward":
      return typeof (value as { id?: unknown }).id === "string";
    case "refresh-rewards":
      return true;
    case "create-reward":
      return RewardDraftSchema.safeParse((value as { reward?: unknown }).reward).success;
    case "update-reward":
      return (
        typeof (value as { id?: unknown }).id === "string" &&
        RewardDraftSchema.safeParse((value as { reward?: unknown }).reward).success
      );
    default:
      return false;
  }
}

export function isPluginMessage(value: unknown): value is PluginMessage {
  return hasEvent(value) && (value.event === "status" || value.event === "reward-refused");
}

function isAccountRole(value: unknown): value is AccountRole {
  return value === "broadcaster" || value === "bot";
}

function hasEvent(value: unknown): value is { event: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "event" in value &&
    typeof (value as { event: unknown }).event === "string"
  );
}
