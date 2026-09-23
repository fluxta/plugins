/**
 * The Is Live Changed Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own way of
 * reporting live status, so a shared shape would be mostly guesswork.
 *
 * Fires only when Twitch's own EventSub push settles the state one way or
 * the other; disconnecting the Broadcaster Account leaves nothing definite
 * to report and fires nothing.
 */
export const IS_LIVE_CHANGED_EVENT = "twitch-is-live-changed";

/** Every field declared for `twitch-is-live-changed` in the manifest. */
export type IsLiveChangedPayload = {
  isLive: boolean;
};

export function toIsLiveChangedPayload(
  isLive: boolean,
): IsLiveChangedPayload {
  return {
    isLive,
  };
}
