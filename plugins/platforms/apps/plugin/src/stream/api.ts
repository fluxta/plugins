/**
 * The parts of twurple's `HelixStream` this service reads.
 *
 * Narrowed to an own type so the service can be exercised without a live
 * stream, which is the only thing twurple's class can be built from.
 */
export type StreamSource = {
  /** The number of viewers Twitch currently reports. */
  viewers: number;
};

/**
 * The parts of twurple's streams API the plugin uses.
 *
 * Narrowed to an own type so the service can be exercised without a live
 * `ApiClient`, which only a connected Account can produce. twurple's own
 * Stream satisfies `StreamSource`, so the real client fits without an
 * adapter.
 */
export interface StreamsApi {
  /** `null` when the channel is not currently live. */
  getStreamByUserId(userId: string): Promise<StreamSource | null>;
}
