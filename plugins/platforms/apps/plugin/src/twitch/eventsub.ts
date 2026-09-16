import { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import type { EventSubState } from "platforms-protocol";

import type { AccountsService } from "../accounts/service";
import type { OutgoingMessages } from "../chat/outgoing";
import type { CommandService } from "../commands/service";
import { CHAT_MESSAGE_EVENT, toChatMessagePayload } from "../events/chat-message";
import { POLL_BEGIN_EVENT, toPollBeginPayload } from "../events/poll-begin";
import { POLL_END_EVENT, toPollEndPayload } from "../events/poll-end";
import { PREDICTION_BEGIN_EVENT, toPredictionBeginPayload } from "../events/prediction-begin";
import { PREDICTION_END_EVENT, toPredictionEndPayload } from "../events/prediction-end";
import { PREDICTION_LOCK_EVENT, toPredictionLockPayload } from "../events/prediction-lock";
import { REWARD_REDEEMED_EVENT, toRewardRedeemedPayload } from "../events/reward-redeemed";
import { plugin } from "../plugin";
import type { StreamStatusService } from "../stream/service";

/**
 * Receives everything the plugin listens to on Twitch and emits it as Events.
 *
 * One WebSocket carries every subscription — chat, redemptions, and whatever
 * comes later — because a listener per topic would open a socket per topic for
 * no gain.
 *
 * Subscriptions follow the Broadcaster Account: they appear when one is
 * connected and go away when it is not. With no Broadcaster Account there is
 * nothing to subscribe with, so the plugin stays quiet rather than retrying
 * against a token it does not have.
 */
export class EventSubService {
  private listener?: EventSubWsListener;
  // Derived rather than imported: the subscription type lives in
  // `@twurple/eventsub-base`, which is only a transitive dependency here.
  private subscriptions: ReturnType<EventSubWsListener["onChannelChatMessage"]>[] = [];
  /** The broadcaster the current subscription belongs to. */
  private subscribedTo?: string;
  /** Kept alongside `subscribedTo`, so `shutdown` can clean up without the Accounts. */
  private apiClient?: ApiClient;
  private state: EventSubState = { status: "idle" };
  /** Reset with the socket, so a reconnect confirms chat is flowing again. */
  private seenAMessage = false;

  constructor(
    private readonly accounts: AccountsService,
    private readonly outgoing: OutgoingMessages,
    private readonly commands: CommandService,
    private readonly stream: StreamStatusService,
    private readonly onChange: () => void,
  ) {}

  snapshot(): EventSubState {
    return this.state;
  }

  /**
   * Brings the subscription in line with the connected Accounts. Safe to call
   * on every Account change — it does nothing when the broadcaster has not
   * changed.
   */
  sync(): void {
    const broadcasterId = this.accounts.userId("broadcaster");

    if (broadcasterId === this.subscribedTo) {
      return;
    }

    this.stop();

    if (!broadcasterId) {
      this.set({ status: "idle" });
      return;
    }

    this.subscribedTo = broadcasterId;
    this.set({ status: "connecting" });
    this.listen(broadcasterId);
  }

  /** Drops every subscription and the socket. */
  stop(): void {
    for (const subscription of this.subscriptions) {
      subscription.stop();
    }

    this.subscriptions = [];
    this.seenAMessage = false;
    this.listener?.stop();
    this.listener = undefined;
    this.subscribedTo = undefined;
    this.apiClient = undefined;
  }

  /**
   * Deletes every subscription Twitch still has for the broadcaster, then
   * calls {@link stop}. Call this before the process exits.
   *
   * `stop()` alone is not enough: `subscription.stop()` fires its DELETE at
   * Twitch without waiting for it, so a killed process leaves whatever Twitch
   * had not gotten around to deleting yet still enabled. Those survive the
   * restart and count against the per-type-and-condition limit, so repeated
   * restarts (a `tsdown --watch` session, a crash loop) eventually make every
   * subscription attempt fail with 429 "maximum subscriptions with type and
   * condition exceeded" — this is what breaks that build-up.
   */
  async shutdown(): Promise<void> {
    const broadcasterId = this.subscribedTo;
    const apiClient = this.apiClient;

    this.stop();

    if (!broadcasterId || !apiClient) {
      return;
    }

    try {
      await apiClient.asUser(broadcasterId, async (ctx) => {
        for await (const subscription of ctx.eventSub.getSubscriptionsForUserPaginated(
          broadcasterId,
        )) {
          await ctx.eventSub.deleteSubscription(subscription.id);
        }
      });
    } catch (error) {
      // Best-effort: the process is on its way out either way, and the next
      // start's subscriptions will fail loudly if this really mattered.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Could not clean up Twitch subscriptions on exit: ${message}`);
    }
  }

  private listen(broadcasterId: string): void {
    const apiClient = new ApiClient({ authProvider: this.accounts.authProvider });
    this.apiClient = apiClient;
    const listener = new EventSubWsListener({ apiClient });
    this.listener = listener;

    // twurple reconnects on its own, including on Twitch's reconnect message.
    // These only mirror what it is doing into the editor.
    listener.onUserSocketReady(() => {
      this.set({
        status: "listening",
        channel: this.accounts.login("broadcaster") ?? broadcasterId,
      });
    });

    listener.onUserSocketDisconnect((_userId, error) => {
      if (error) {
        this.set({ status: "error", message: error.message });
      } else {
        this.set({ status: "connecting" });
      }
    });

    listener.onSubscriptionCreateFailure((_subscription, error) => {
      this.set({ status: "error", message: error.message });
    });

    listener.onRevoke(() => {
      // Twitch drops a subscription when its authorization goes away. The
      // Accounts will notice the same thing and ask for a new sign-in.
      this.set({ status: "error", message: "Twitch revoked the chat subscription" });
    });

    listener.start();

    // Read chat as the broadcaster: it is their `user:read:chat` that the
    // subscription is authorized by, and it works whether or not a Bot
    // Account is connected.
    this.subscriptions.push(
      // Read chat as the broadcaster: it is their `user:read:chat` that the
      // subscription is authorized by, and it works whether or not a Bot
      // Account is connected.
      listener.onChannelChatMessage(broadcasterId, broadcasterId, (event) => {
        this.onChatMessage(event);
      }),
      // Every redemption on the channel, including Rewards the plugin did not
      // create and cannot manage.
      listener.onChannelRedemptionAdd(broadcasterId, (event) => {
        plugin.emitEvent(REWARD_REDEEMED_EVENT, toRewardRedeemedPayload(event));
      }),
      // Every Poll on the channel, including one started from the Twitch
      // dashboard rather than the Start Poll action.
      listener.onChannelPollBegin(broadcasterId, (event) => {
        plugin.emitEvent(POLL_BEGIN_EVENT, toPollBeginPayload(event));
      }),
      listener.onChannelPollEnd(broadcasterId, (event) => {
        plugin.emitEvent(POLL_END_EVENT, toPollEndPayload(event));
      }),
      // Every Prediction on the channel, including one started from the
      // Twitch dashboard rather than the Start Prediction action.
      listener.onChannelPredictionBegin(broadcasterId, (event) => {
        plugin.emitEvent(PREDICTION_BEGIN_EVENT, toPredictionBeginPayload(event));
      }),
      listener.onChannelPredictionLock(broadcasterId, (event) => {
        plugin.emitEvent(PREDICTION_LOCK_EVENT, toPredictionLockPayload(event));
      }),
      listener.onChannelPredictionEnd(broadcasterId, (event) => {
        plugin.emitEvent(PREDICTION_END_EVENT, toPredictionEndPayload(event));
      }),
      // Feeds the `is-live` and `viewer-count` Value Sources — no Event of
      // its own, since a condition reads these directly rather than reacting
      // to a stream starting or stopping.
      listener.onStreamOnline(broadcasterId, () => {
        this.stream.wentLive();
      }),
      listener.onStreamOffline(broadcasterId, () => {
        this.stream.wentOffline();
      }),
    );
  }

  private onChatMessage(event: {
    chatterId: string;
    messageText: string;
    messageId: string;
    chatterName: string;
    chatterDisplayName: string;
    badges: Record<string, string>;
  }): void {
    // A message the plugin sent itself must not fire the Event that sent it,
    // or an Event answering chat answers its own answer, forever.
    if (this.outgoing.claim(event.chatterId, event.messageText)) {
      return;
    }

    if (!this.seenAMessage) {
      // Once per subscription: enough to confirm chat is flowing, without
      // turning a busy channel into a log of itself.
      this.seenAMessage = true;
      console.log("Received the first chat message; the Chat Message event is live");
    }

    const payload = toChatMessagePayload(event);

    plugin.emitEvent(CHAT_MESSAGE_EVENT, payload);
    // Every message is both a Chat Message and a candidate Command, so a
    // single message can drive two Events.
    this.commands.handle(payload);
  }

  private set(state: EventSubState): void {
    if (state.status !== this.state.status) {
      log(state);
    }

    this.state = state;
    this.onChange();
  }
}

/** One line per state change, so the log shows whether chat is actually live. */
function log(state: EventSubState): void {
  switch (state.status) {
    case "listening":
      console.log(`Listening to chat in #${state.channel}`);
      return;
    case "connecting":
      console.log("Connecting to chat");
      return;
    case "error":
      console.error(`Chat is not being received: ${state.message}`);
      return;
    case "idle":
      console.log("Not listening to chat: no broadcaster account");
      return;
  }
}
