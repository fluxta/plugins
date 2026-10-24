import { useEditor } from "@fluxta/sdk/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { isListenFailed, type ListenSettings } from "tts-protocol";

import { sendToPlugin } from "./sendToPlugin";

/** A Listen sent: its id, and what it asked for. */
type Asked = { id: string; request: string };

/**
 * Listen: asks the sidecar to speak `text` as `settings` stand, and keeps why
 * the last Listen could not be heard. The sidecar tells every open editor, so
 * each Listen carries an id and only the latest one's answer is taken.
 * `problem` clears with the next Listen, and while the text or the settings
 * differ from the ones it was about — a reason about another voice would
 * mislead.
 */
export function useListen(
  text: string,
  settings: ListenSettings,
): {
  listen: () => void;
  problem: string | undefined;
} {
  const editor = useEditor();
  const latest = useRef<Asked | undefined>(undefined);
  const [failed, setFailed] = useState<{ asked: Asked; problem: string }>();
  const request = JSON.stringify({ text, settings });

  useEffect(
    () =>
      editor.onReceiveFromPlugin((message: unknown) => {
        const asked = latest.current;
        if (isListenFailed(message) && message.id === asked?.id) {
          setFailed({ asked, problem: message.problem });
        }
      }),
    [editor],
  );

  const listen = useCallback(() => {
    // Unique enough among the editors open at once; `crypto.randomUUID`
    // needs a secure context.
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    latest.current = { id, request };
    setFailed(undefined);
    sendToPlugin(editor, {
      event: "listen",
      id,
      ...(JSON.parse(request) as { text: string; settings: ListenSettings }),
    });
  }, [editor, request]);

  return {
    listen,
    problem: failed?.asked.request === request ? failed.problem : undefined,
  };
}
