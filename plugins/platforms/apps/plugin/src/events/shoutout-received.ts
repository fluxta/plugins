/**
 * The Shoutout Received Event Source.
 *
 * Fires when another channel shouts this one out with Twitch's own Shoutout
 * feature — not when a viewer merely says a name in chat.
 */
export const SHOUTOUT_RECEIVED_EVENT = "twitch-shoutout-received";

/** Every field declared for `twitch-shoutout-received` in the manifest. */
export type ShoutoutReceivedPayload = {
  fromUserId: string;
  fromUserLogin: string;
  fromUserName: string;
  /** How many viewers were watching the shouting-out channel at the time. */
  viewerCount: number;
};

/**
 * The parts of twurple's shoutout-receive event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type ShoutoutReceivedSource = {
  shoutingOutBroadcasterId: string;
  shoutingOutBroadcasterName: string;
  shoutingOutBroadcasterDisplayName: string;
  viewerCount: number;
};

export function toShoutoutReceivedPayload(
  event: ShoutoutReceivedSource,
): ShoutoutReceivedPayload {
  return {
    fromUserId: event.shoutingOutBroadcasterId,
    fromUserLogin: event.shoutingOutBroadcasterName,
    fromUserName: event.shoutingOutBroadcasterDisplayName,
    viewerCount: event.viewerCount,
  };
}
