export const RECORD_STATE_CHANGED_EVENT = "record-state-changed";

/**
 * Every field declared for `record-state-changed` in the manifest.
 *
 * `isRecordingPaused` is its own field rather than a third `isRecording`
 * value, because OBS has no separate Event for a pause/resume — only this
 * one, with `outputState` telling the two apart — and folding it into one
 * boolean would make a paused Recording indistinguishable from a running one.
 */
export type RecordStateChangedPayload = {
  connection: string;
  isRecording: boolean;
  isRecordingPaused: boolean;
};

export function toRecordStateChangedPayload(
  connectionId: string,
  isRecording: boolean,
  isPaused: boolean,
): RecordStateChangedPayload {
  return {
    connection: connectionId,
    isRecording,
    isRecordingPaused: isPaused,
  };
}
