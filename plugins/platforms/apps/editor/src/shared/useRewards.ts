import { useEffect, useState } from "react";
import { isPluginMessage, type EditorMessage, type RewardsState } from "platforms-protocol";

import type { ActionEditor } from "@fluxta/sdk/api";

/**
 * The Channel's Rewards, as the sidecar last saw them.
 *
 * An Action editor picks a Reward from this list rather than asking an author
 * to paste an id no screen shows them.
 *
 * @param connected The editor's own `connect()`, so nothing is sent before the
 * handshake completes.
 */
export function useRewards(editor: ActionEditor, connected: Promise<void>): RewardsState {
  // Loading, not idle: the list is not empty, it has not arrived yet.
  const [rewards, setRewards] = useState<RewardsState>({ status: "loading" });

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (isPluginMessage(incoming) && incoming.event === "status") {
        setRewards(incoming.status.rewards);
      }
    });

    void connected.then(() => {
      editor.sendToPlugin({ event: "get-status" } satisfies EditorMessage);
    });

    return unsubscribe;
  }, [editor, connected]);

  return rewards;
}
