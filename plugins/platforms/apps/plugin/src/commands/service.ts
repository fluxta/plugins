import type { ChatMessagePayload } from "../events/chat-message";
import {
  COMMAND_TRIGGERED_EVENT,
  toCommandTriggeredPayload,
  type CommandTriggeredPayload,
} from "../events/command-triggered";

import type { Command, Standing } from "./command";
import { Cooldowns } from "./cooldowns";
import { recognize } from "./recognize";

/**
 * Turns chat messages into Command Triggered Events.
 *
 * The Command itself does nothing further: recognising one only fires the
 * Event, and every reaction — including a plain text answer — is assembled in
 * Fluxta.
 */
export class CommandService {
  private readonly cooldowns = new Cooldowns();

  /**
   * @param commands Read on every message, so an edit takes effect at once.
   * @param emit Passed in rather than reached for, so the whole path from a
   * message to an emitted Event can be exercised without a live connection.
   */
  constructor(
    private readonly commands: () => readonly Command[],
    private readonly emit: (type: string, payload: CommandTriggeredPayload) => void,
  ) {}

  /** Drops what is remembered about a Command that no longer exists. */
  forget(commandId: string): void {
    this.cooldowns.forget(commandId);
  }

  /** Offers a chat message to the Commands. */
  handle(message: ChatMessagePayload): void {
    const result = recognize(message.message, standingOf(message), this.commands());

    if (!result.fired) {
      // Silent by design: a bot that announces every refusal is worse than one
      // that says nothing.
      return;
    }

    if (this.cooldowns.isCoolingDown(result.command, message.userId)) {
      return;
    }

    // Recorded only now, so a refused attempt never extends a cooldown.
    this.cooldowns.record(result.command, message.userId);

    this.emit(
      COMMAND_TRIGGERED_EVENT,
      toCommandTriggeredPayload(message, result.command, result.alias, result.args),
    );
  }
}

function standingOf(message: ChatMessagePayload): Standing {
  return {
    isBroadcaster: message.isBroadcaster,
    isModerator: message.isModerator,
    isVip: message.isVip,
    isSubscriber: message.isSubscriber,
  };
}
