export const INPUT_MUTE_CHANGED_EVENT = "input-mute-changed";

/** Every field declared for `input-mute-changed` in the manifest. */
export type InputMuteChangedPayload = {
  connection: string;
  input_name: string;
  muted: boolean;
};

export function toInputMuteChangedPayload(
  connectionId: string,
  inputName: string,
  muted: boolean,
): InputMuteChangedPayload {
  return {
    connection: connectionId,
    input_name: inputName,
    muted,
  };
}
