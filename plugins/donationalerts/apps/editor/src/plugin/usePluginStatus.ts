import { usePluginEditor } from "@fluxta/sdk/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPluginMessage,
  type EditorMessage,
  type PluginStatus,
} from "donationalerts-protocol";

/**
 * How long to wait for the sidecar's answer before saying the plugin process
 * itself is not responding — distinct from the Editor's own link to Fluxta,
 * which `<PluginEditorProvider>` already watches and reports on its own.
 */
const SIDECAR_TIMEOUT_MS = 3000;

/** How long "Sent" stays up after the sidecar confirms a Test Donation. */
const TEST_SENT_MS = 3000;

export function usePluginStatus() {
  const editor = usePluginEditor();
  const [status, setStatus] = useState<PluginStatus>();
  const [sidecarSilent, setSidecarSilent] = useState(false);
  /** Whether the sidecar has just confirmed a Test Donation. */
  const [testSent, setTestSent] = useState(false);
  const testSentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((message: unknown) => {
      if (!isPluginMessage(message)) {
        return;
      }

      if (message.event === "status") {
        setStatus(message.status);
      } else if (message.event === "test-donation-sent") {
        setTestSent(true);
        clearTimeout(testSentTimer.current);
        testSentTimer.current = setTimeout(
          () => setTestSent(false),
          TEST_SENT_MS,
        );
      }
    });

    // `sendToPlugin` queues internally until the Editor Connection the
    // provider already opened comes up — no need to wait on it here.
    editor.sendToPlugin({ event: "get-status" } satisfies EditorMessage);

    const timer = setTimeout(() => setSidecarSilent(true), SIDECAR_TIMEOUT_MS);

    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearTimeout(testSentTimer.current);
    };
  }, [editor]);

  const send = useCallback(
    (message: EditorMessage) => editor.sendToPlugin(message),
    [editor],
  );

  return { status, sidecarSilent, testSent, send };
}
