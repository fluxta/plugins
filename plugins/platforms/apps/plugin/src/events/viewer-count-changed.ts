/**
 * The Viewer Count Changed Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own way of
 * reporting a viewer count, so a shared shape would be mostly guesswork.
 *
 * Fires only while the channel is live and the number actually moved from
 * what it last reported. Twitch has no push for this, so it is read on the
 * regular poll — see `StreamStatusService` for why that poll runs only while
 * live.
 */
export const VIEWER_COUNT_CHANGED_EVENT = "twitch-viewer-count-changed";

/** Every field declared for `twitch-viewer-count-changed` in the manifest. */
export type ViewerCountChangedPayload = {
  viewerCount: number;
};

export function toViewerCountChangedPayload(
  viewerCount: number,
): ViewerCountChangedPayload {
  return {
    viewerCount,
  };
}
