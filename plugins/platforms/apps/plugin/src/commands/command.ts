import { PERMISSION_LEVELS, type PermissionLevel } from "platforms-protocol";

export type { Command, PermissionLevel } from "platforms-protocol";

/** A viewer's standing in the channel, as the chat message reported it. */
export type Standing = {
  isBroadcaster: boolean;
  isModerator: boolean;
  isVip: boolean;
  isSubscriber: boolean;
};

/** The highest level a viewer holds. */
export function standingOf(standing: Standing): PermissionLevel {
  if (standing.isBroadcaster) return "broadcaster";
  if (standing.isModerator) return "moderator";
  if (standing.isVip) return "vip";
  if (standing.isSubscriber) return "subscriber";
  return "everyone";
}

/** Whether a viewer's standing meets a Command's requirement. */
export function satisfies(standing: Standing, required: PermissionLevel): boolean {
  return PERMISSION_LEVELS.indexOf(standingOf(standing)) >= PERMISSION_LEVELS.indexOf(required);
}
