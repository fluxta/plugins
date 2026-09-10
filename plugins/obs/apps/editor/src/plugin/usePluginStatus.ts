import { PluginEditor } from "@fluxta/sdk/api";
import { useCallback, useEffect, useState } from "react";
import { isPluginMessage, type EditorMessage, type PluginStatus } from "obs-protocol";

const editor = new PluginEditor();
const connected = editor.connect();

/** How long to wait for the sidecar before saying it is not answering. */
const SIDECAR_TIMEOUT_MS = 3000;

/**
 * The editor's own WebSocket link to the Fluxta host — distinct from an
 * OBS Connection (this plugin's domain term for a configured OBS Studio
 * instance), which is a completely separate thing this same editor renders
 * a list of.
 */
export type EditorLink = "connecting" | "connected" | "failed";

export function usePluginStatus() {
  const [link, setLink] = useState<EditorLink>("connecting");
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

    connected.then(
      () => {
        setLink("connected");
        editor.sendToPlugin({ event: "get-status" } satisfies EditorMessage);
      },
      (error: unknown) => {
        console.error("Editor connection failed", error);
        setLink("failed");
      },
    );

    const timer = setTimeout(() => setSidecarSilent(true), SIDECAR_TIMEOUT_MS);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const send = useCallback((message: EditorMessage) => {
    // Every send is a fresh attempt, so what was refused last time has had
    // its say and must not outlive it.
    setRefusal(undefined);
    editor.sendToPlugin(message);
  }, []);

  return { link, status, refusal, sidecarSilent, send };
}
