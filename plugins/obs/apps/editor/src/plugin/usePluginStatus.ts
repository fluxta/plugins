import { usePluginEditor } from "@fluxta/sdk/ui";
import { useCallback, useEffect, useState } from "react";
import { isPluginMessage, type EditorMessage, type PluginStatus } from "obs-protocol";

/**
 * How long to wait for the sidecar's answer before saying the plugin process
 * itself is not responding — distinct from the Editor's own link to Fluxta,
 * which `<PluginEditorProvider>` already watches and reports on its own.
 */
const SIDECAR_TIMEOUT_MS = 3000;

export function usePluginStatus() {
  const editor = usePluginEditor();
  const [status, setStatus] = useState<PluginStatus>();
  const [refusal, setRefusal] = useState<string>();
  const [sidecarSilent, setSidecarSilent] = useState(false);

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((message: unknown) => {
      if (!isPluginMessage(message)) {
        return;
      }

      if (message.event === "status") {
        setStatus(message.status);
      } else if (message.event === "connection-refused") {
        setRefusal(message.message);
      }
    });

    // `sendToPlugin` queues internally until the Editor Connection the
    // provider already opened comes up — no need to wait on it here.
    editor.sendToPlugin({ event: "get-status" } satisfies EditorMessage);

    const timer = setTimeout(() => setSidecarSilent(true), SIDECAR_TIMEOUT_MS);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [editor]);

  const send = useCallback(
    (message: EditorMessage) => {
      // Every send is a fresh attempt, so what was refused last time has had
      // its say and must not outlive it.
      setRefusal(undefined);
      editor.sendToPlugin(message);
    },
    [editor],
  );

  return { status, refusal, sidecarSilent, send };
}
