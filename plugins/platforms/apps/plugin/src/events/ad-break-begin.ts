/**
 * The Ad Break Begin Event Source.
 *
 * Fires for every ad break regardless of who requested it — the dashboard's
 * "Run Ads" button, Twitch's own automatic scheduling, or this plugin's own
 * Run Commercial Action — `isAutomatic` is how a Run tells them apart.
 */
export const AD_BREAK_BEGIN_EVENT = "twitch-ad-break-begin";

/** Every field declared for `twitch-ad-break-begin` in the manifest. */
export type AdBreakBeginPayload = {
  durationSeconds: number;
  isAutomatic: boolean;
};

/**
 * The parts of twurple's ad-break-begin event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type AdBreakBeginSource = {
  durationSeconds: number;
  isAutomatic: boolean;
};

export function toAdBreakBeginPayload(event: AdBreakBeginSource): AdBreakBeginPayload {
  return {
    durationSeconds: event.durationSeconds,
    isAutomatic: event.isAutomatic,
  };
}
