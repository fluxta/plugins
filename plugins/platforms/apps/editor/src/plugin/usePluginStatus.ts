import { usePluginData, usePluginEditor } from "@fluxta/sdk/ui";
import { useCallback, useEffect, useState } from "react";
import { isPluginMessage, type EditorMessage, type PluginStatus } from "platforms-protocol";

/** How long to wait for the sidecar before saying it is not answering. */
const SIDECAR_TIMEOUT_MS = 3000;

export function usePluginStatus() {
  const editor = usePluginEditor();
  const { data: status } = usePluginData<PluginStatus>(
    { event: "get-status" },
    "status",
  );
  const [refusal, setRefusal] = useState<string>();
  const [sidecarSilent, setSidecarSilent] = useState(false);

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((message: unknown) => {
      if (isPluginMessage(message) && message.event === "reward-refused") {
        setRefusal(message.message);
      }
    });

    const timer = setTimeout(() => setSidecarSilent(true), SIDECAR_TIMEOUT_MS);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [editor]);

  const send = useCallback(
    (message: EditorMessage) => {
      // Every send is a fresh attempt, so what was refused last time has had its
      // say and must not outlive it.
      setRefusal(undefined);
      editor.sendToPlugin(message);
    },
    [editor],
  );

  return { status, refusal, sidecarSilent, send };
}
