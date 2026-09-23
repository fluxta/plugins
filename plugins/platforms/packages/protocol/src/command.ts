import { z } from "zod";

/**
 * A chat Command, as it is stored and as the editor edits it.
 *
 * The shape lives here because both sides need it: the sidecar parses it out
 * of the settings, and the editor renders and validates it. One definition
 * means they cannot drift apart.
 */

/**
 * How much standing a viewer needs for a Command to fire.
 *
 * Ordered: a higher standing satisfies every lower requirement, so a moderator
 * can use a subscriber-only Command without also being a subscriber.
 */
export const PERMISSION_LEVELS = [
  "everyone",
  "subscriber",
  "vip",
  "moderator",
  "broadcaster",
] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: "Everyone",
  subscriber: "Subscribers",
  vip: "VIPs",
  moderator: "Moderators",
  broadcaster: "Broadcaster only",
};

export const CommandSchema = z.object({
  /** Stable across edits, so the editor can address a Command it is changing. */
  id: z.string(),
  /**
   * The word that fires the Command, prefix and all. A Command named `!roll`
   * fires on `!roll`; one named `roll` fires whenever someone says `roll` on
   * its own, which is allowed and occasionally what people want.
   */
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  permission: z.enum(PERMISSION_LEVELS).default("everyone"),
  /** Seconds before anyone may use it again. Zero means no cooldown. */
  globalCooldown: z.number().min(0).default(0),
  /** Seconds before the same viewer may use it again. */
  userCooldown: z.number().min(0).default(0),
});

export type Command = z.infer<typeof CommandSchema>;

/**
 * Why a Command cannot be saved, or nothing if it can.
 *
 * Shared so the editor can refuse before sending and the sidecar can refuse on
 * arrival, by the very same rule.
 */
export function validateCommand(
  command: Command,
  others: readonly Command[],
): string | undefined {
  const words = [command.name, ...command.aliases].map((word) => word.trim());

  if (!words[0]) {
    return "Give the command a name.";
  }

  if (words.some((word) => !word)) {
    return "An alias cannot be blank.";
  }

  if (words.some((word) => /\s/.test(word))) {
    return "A command word cannot contain spaces — only the first word of a message is matched.";
  }

  const seen = new Set<string>();

  for (const word of words) {
    const key = word.toLowerCase();

    if (seen.has(key)) {
      return `"${word}" is listed twice.`;
    }

    seen.add(key);
  }

  // Recognition takes the first Command whose word matches, so two Commands
  // sharing a word would leave one of them permanently unreachable.
  for (const other of others) {
    if (other.id === command.id) {
      continue;
    }

    const clash = [other.name, ...other.aliases].find((word) =>
      seen.has(word.trim().toLowerCase()),
    );

    if (clash) {
      return `"${clash}" is already used by "${other.name}".`;
    }
  }

  return undefined;
}
