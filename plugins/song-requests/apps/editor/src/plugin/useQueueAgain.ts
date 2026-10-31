import { usePluginEditor } from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import {
  isPluginMessage,
  type EditorMessage,
  type StreamerRequestAnswer,
} from "song-requests-protocol";

/**
 * The layout unmounts inactive sections, so the answers to the History's
 * Queue again live with the Plugin Editor, above the History (#14). Keyed
 * by the History entry's Song id, so each row shows what became of its own
 * Request; a row that is queued again leaves its earlier answer behind.
 */
export function useQueueAgain() {
  const editor = usePluginEditor();
  const pending = useRef(new Set<string>());
  const [answers, setAnswers] = useState<
    Record<string, StreamerRequestAnswer | { kind: "pending" }>
  >({});

  useEffect(() => {
    return editor.onReceiveFromPlugin((message: unknown) => {
      if (isPluginMessage(message) && message.event === "queue-again-answer") {
        pending.current.delete(message.songId);
        setAnswers((answers) => ({
          ...answers,
          [message.songId]: message.answer,
        }));
      }
    });
  }, [editor]);

  return {
    answers,
    queueAgain(songId: string) {
      // Guard before React renders the disabled button: overlapping
      // Requests for this row could answer out of order.
      if (pending.current.has(songId)) return;
      pending.current.add(songId);
      setAnswers((answers) => ({ ...answers, [songId]: { kind: "pending" } }));
      void editor
        .sendToPlugin({
          event: "queue-again",
          songId,
        } satisfies EditorMessage)
        .catch(() => {
          pending.current.delete(songId);
          setAnswers((answers) => {
            const next = { ...answers };
            delete next[songId];
            return next;
          });
        });
    },
  };
}

export type QueueAgain = ReturnType<typeof useQueueAgain>;
