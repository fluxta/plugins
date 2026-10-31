import {
  Button,
  Section,
  StatusBadge,
  TextField,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import type { EditorMessage, PluginStatus } from "song-requests-protocol";

import { CopyField } from "./CopyField";

/**
 * The Player Page's address, for an OBS Browser Source, and whether a page is
 * playing. The address holds the Player Key; it is shown here only to be
 * copied into OBS. The streamer changes the port and replaces the Player Key
 * here; a replaced key stops every open page, so the new address goes into
 * OBS at once.
 */
export function PlayerPageSection({ status }: { status: PluginStatus }) {
  const editor = usePluginEditor();
  const [port, setPort] = useState("");
  const savedPort = String(status.playerPort);
  const portNumber = Number(port);

  function send(message: EditorMessage) {
    void editor.sendToPlugin(message);
  }

  return (
    <Section
      title="Player Page"
      description="Add this address to OBS as a Browser Source on this computer, and keep the source in view on stream: YouTube does not allow a player that is not shown."
    >
      <div className="flex items-center gap-2">
        {status.playerConnected ? (
          <StatusBadge tone="ok">Playing in a Player Page</StatusBadge>
        ) : (
          <StatusBadge tone="idle">No Player Page open</StatusBadge>
        )}
      </div>
      <CopyField
        label="Address"
        hint="Songs wait in the queue while no Player Page is open."
        value={status.playerUrl}
      />
      <TextField
        label="Port"
        value={port}
        onChange={setPort}
        placeholder={`${savedPort} — the page answers on this port`}
        hint="The page listens on this computer only — loopback. After a change, copy the address into OBS again."
      />
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={
            !port.trim() ||
            !Number.isInteger(portNumber) ||
            portNumber < 1 ||
            portNumber > 65535
          }
          onClick={() => {
            send({ event: "set-player-port", port: portNumber });
            setPort("");
          }}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => send({ event: "replace-player-key" })}
        >
          Replace Player Key
        </Button>
      </div>
      <p className="text-muted-foreground text-xs/relaxed">
        Replace the key if you think someone else knows it: every open Player
        Page stops, and the address above changes — copy it into OBS again.
      </p>
    </Section>
  );
}
