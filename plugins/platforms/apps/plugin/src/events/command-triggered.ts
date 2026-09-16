import type { Command } from "../commands/command";

import type { ChatMessagePayload } from "./chat-message";

/**
 * The Command Triggered Event Source.
 *
 * There is one Source for every Command, because the manifest is fixed at
 * build time and cannot declare a kind per user-defined Command. Events tell
 * Commands apart by filtering the `command` field.
 *
 * Deliberately platform-neutral, unlike the platform-specific
 * `twitch-chat-message` it is built from: the payload carries a `platform`
 * field, so a Command's scenario keeps working once a second platform starts
 * triggering it too.
 */
export const COMMAND_TRIGGERED_EVENT = "command-triggered";

/**
 * Every platform a Command can fire from. Twitch-only for now, but YouTube
 * and Kick are expected to follow, so this is the one place a new
 * platform's id and label get added — the `platform` filter's dropdown
 * (`registerOptions("platforms")` in `index.ts`) reads straight off it.
 */
export const PLATFORMS = [{ value: "twitch", label: "Twitch" }] as const;

export type Platform = (typeof PLATFORMS)[number]["value"];

/** Every field declared for `command-triggered` in the manifest. */
export type CommandTriggeredPayload = ChatMessagePayload & {
  /** The Command's canonical name, whichever alias was actually typed. */
  command: string;
  /**
   * The Command's stable id. Filters bind to this, not `command`: a Command
   * can be renamed, but its id survives the rename, so a filter set up
   * against it keeps matching afterwards.
   */
  commandId: string;
  /** The word the viewer typed, which may be an alias. */
  alias: string;
  /** Everything after the command word, unsplit. */
  args: string;
  /** Which platform's chat fired the Command — always `"twitch"` for now. */
  platform: Platform;
};

export function toCommandTriggeredPayload(
  message: ChatMessagePayload,
  command: Command,
  alias: string,
  args: string,
): CommandTriggeredPayload {
  return {
    ...message,
    command: command.name,
    commandId: command.id,
    alias,
    args,
    platform: "twitch",
  };
}
