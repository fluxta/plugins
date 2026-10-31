import { usePluginEditor } from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";
import {
  isPluginMessage,
  type EditorMessage,
  type PluginStatus,
} from "song-requests-protocol";

/**
 * How long to wait for the sidecar's answer before saying the plugin process
 * itself is not responding — distinct from the Editor's own link to Fluxta,
 * which `<PluginEditorProvider>` already watches and reports on its own.
 */
const SIDECAR_TIMEOUT_MS = 3000;

export function usePluginStatus() {
  const editor = usePluginEditor();
  const [status, setStatus] = useState<PluginStatus>();
  const [sidecarSilent, setSidecarSilent] = useState(false);

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((message: unknown) => {
      if (isPluginMessage(message) && message.event === "status") {
        setStatus(message.status);
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

  return { status, sidecarSilent };
}
