import { usePluginEditor } from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";
import {
  isPluginMessage,
  type EditorMessage,
  type StreamerRequestAnswer,
} from "song-requests-protocol";

/**
 * The layout unmounts inactive sections, so the add field's state and
 * answer subscription live with the Plugin Editor, above the Song Queue.
 */
export function useSongRequest() {
  const editor = usePluginEditor();
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<StreamerRequestAnswer | undefined>();

  useEffect(() => {
    return editor.onReceiveFromPlugin((message: unknown) => {
      if (isPluginMessage(message) && message.event === "request-answer") {
        setAnswer(message.answer);
        if (message.answer.kind === "accepted") setDraft("");
      }
    });
  }, [editor]);

  return {
    draft,
    answer,
    changeDraft(value: string) {
      setDraft(value);
      setAnswer(undefined);
    },
    submit() {
      const request = draft.trim();
      if (!request) return;
      setAnswer(undefined);
      void editor.sendToPlugin({
        event: "request-song",
        request,
      } satisfies EditorMessage);
    },
  };
}

export type SongRequest = ReturnType<typeof useSongRequest>;
