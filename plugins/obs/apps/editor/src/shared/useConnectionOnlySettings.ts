import type { ActionEditor } from "@fluxta/sdk/api";
import { useEffect, useRef, useState } from "react";

type Settings = { connection?: string };

/**
 * Load/save wiring shared by every Action whose only setting is which
 * Connection to act on (Start/Stop Stream, Start/Stop/Pause/Resume Record).
 */
export function useConnectionOnlySettings(editor: ActionEditor, connected: Promise<void>) {
  const [connectionId, setConnectionId] = useState<string>();

  // Re-captured on every render so the save handler below always closes over
  // the latest value, not whatever it was when `onActionSave` first ran.
  const latest = useRef<Settings>({});
  latest.current = { connection: connectionId };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as Settings | null;
      setConnectionId(saved?.connection);
    });

    return off;
  }, [editor, connected]);

  return { connectionId, setConnectionId };
}
