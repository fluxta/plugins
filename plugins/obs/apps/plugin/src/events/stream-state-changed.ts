export const STREAM_STATE_CHANGED_EVENT = "stream-state-changed";

/**
 * Every field declared for `stream-state-changed` in the manifest.
 *
 * Deliberately a boolean, not OBS's own starting/started/stopping/stopped —
 * simpler for a scenario to branch on, at the cost of the in-between states.
 */
export type StreamStateChangedPayload = {
  connection: string;
  is_streaming: boolean;
};

export function toStreamStateChangedPayload(
  connectionId: string,
  isStreaming: boolean,
): StreamStateChangedPayload {
  return {
    connection: connectionId,
    is_streaming: isStreaming,
  };
}
