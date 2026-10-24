import type { BaseEditor } from "@fluxta/sdk/api";
import type { EditorMessage } from "tts-protocol";

/**
 * Sends the sidecar one of the messages it understands. The SDK takes only
 * JSON values, and an optional key (`voice?`) does not read as one to
 * TypeScript although it serializes as one.
 */
export function sendToPlugin(editor: BaseEditor, message: EditorMessage): void {
  void editor.sendToPlugin(
    message as unknown as Parameters<BaseEditor["sendToPlugin"]>[0],
  );
}
