import type { Command } from "./command";

/**
 * Tracks when each Command last fired, globally and per viewer.
 *
 * Only an actual firing starts a cooldown — a rejected attempt must not
 * extend it, or a viewer spamming a command they may not use would keep it
 * locked for everyone else.
 *
 * State lives in memory: a cooldown that outlived a restart of the plugin
 * would be surprising, and losing one is harmless.
 */
export class Cooldowns {
  private readonly lastFired = new Map<string, number>();
  /** Command id to viewer id to when it last fired for that viewer. */
  private readonly lastFiredForUser = new Map<string, Map<string, number>>();

  /** Whether the Command is still cooling down for this viewer. */
  isCoolingDown(command: Command, userId: string, now = Date.now()): boolean {
    const forUser = this.lastFiredForUser.get(command.id)?.get(userId);

    return (
      isWithin(this.lastFired.get(command.id), command.globalCooldown, now) ||
      isWithin(forUser, command.userCooldown, now)
    );
  }

  /** Records a firing, starting both cooldowns. */
  record(command: Command, userId: string, now = Date.now()): void {
    this.lastFired.set(command.id, now);

    let forCommand = this.lastFiredForUser.get(command.id);

    if (!forCommand) {
      forCommand = new Map();
      this.lastFiredForUser.set(command.id, forCommand);
    }

    forCommand.set(userId, now);
  }

  /** Drops everything remembered about a Command that no longer exists. */
  forget(commandId: string): void {
    this.lastFired.delete(commandId);
    this.lastFiredForUser.delete(commandId);
  }
}

function isWithin(lastFiredAt: number | undefined, seconds: number, now: number): boolean {
  if (lastFiredAt === undefined || seconds <= 0) {
    return false;
  }

  return lastFiredAt + seconds * 1000 > now;
}
