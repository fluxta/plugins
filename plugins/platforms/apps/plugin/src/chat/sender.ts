import { ApiClient } from "@twurple/api";
import type { AccountRole } from "platforms-protocol";

import type { AccountsService } from "../accounts/service";

import type { OutgoingMessages } from "./outgoing";
import { ELEVATED_LIMIT, REGULAR_LIMIT } from "./rate-limiter";
import { SendQueue } from "./send-queue";

export type SendRequest = {
  message: string;
  /** The message to reply to, if this should be a threaded reply. */
  replyToMessageId?: string;
};

/** Sends chat messages on behalf of the connected Accounts. */
export class ChatSender {
  private readonly queues = new Map<AccountRole, SendQueue>();

  constructor(
    private readonly accounts: AccountsService,
    private readonly outgoing: OutgoingMessages,
  ) {}

  /**
   * Queues a message and returns at once.
   *
   * Nothing waits for Twitch: an Action that blocked until its message went
   * out would hold up every later step of the run for as long as the rate
   * limit says to wait. Failures are reported to the log instead.
   */
  send(role: AccountRole, request: SendRequest): void {
    const senderId = this.accounts.userId(role);
    const channelId = this.accounts.userId("broadcaster");

    if (!senderId) {
      console.error(`Cannot send a chat message: the ${role} account is not connected`);
      return;
    }

    if (!channelId) {
      console.error("Cannot send a chat message: the broadcaster account is not connected");
      return;
    }

    // Recorded before sending, because the message can come back over EventSub
    // before the send's own response arrives.
    this.outgoing.remember(senderId, request.message);

    void this.queueFor(role).enqueue(() => this.deliver(senderId, channelId, request));
  }

  private async deliver(
    senderId: string,
    channelId: string,
    request: SendRequest,
  ): Promise<void> {
    const api = new ApiClient({ authProvider: this.accounts.authProvider });

    try {
      const sent = await api.asUser(senderId, (ctx) =>
        ctx.chat.sendChatMessage(channelId, request.message, {
          replyParentMessageId: request.replyToMessageId,
        }),
      );

      // Twitch accepts the request and then reports separately that it dropped
      // the message — for AutoMod, duplicate text, or a channel restriction.
      if (!sent.isSent) {
        this.failed(senderId, request, sent.dropReasonMessage ?? "Twitch dropped the message");
      }
    } catch (error) {
      this.failed(senderId, request, error instanceof Error ? error.message : String(error));
    }
  }

  private failed(senderId: string, request: SendRequest, reason: string): void {
    // The message never reached chat, so the record must go: otherwise it
    // would go on to suppress a real message with the same text.
    this.outgoing.discard(senderId, request.message);
    console.error(`The chat message was not sent: ${reason}`);
  }

  private queueFor(role: AccountRole): SendQueue {
    let queue = this.queues.get(role);

    if (!queue) {
      // The broadcaster owns the channel, so they always get the larger
      // allowance. A bot might be a moderator and get it too, but there is no
      // way to know from here, so it takes the safe floor.
      queue = new SendQueue(role === "broadcaster" ? ELEVATED_LIMIT : REGULAR_LIMIT);
      this.queues.set(role, queue);
    }

    return queue;
  }
}
