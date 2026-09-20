import { Button, EmptyState, Section } from "@fluxta/sdk/ui";
import { useState } from "react";
import { DEFAULT_OBS_PORT, type ConnectionDraft, type EditorMessage, type PluginStatus } from "obs-protocol";

import { ConnectionDialog } from "./ConnectionDialog";
import { ConnectionRow } from "./ConnectionRow";

type Props = {
  connections: PluginStatus["connections"];
  send: (message: EditorMessage) => void;
};

const BLANK_DRAFT: ConnectionDraft = { name: "", host: "127.0.0.1", port: DEFAULT_OBS_PORT };

export function ConnectionsCard({ connections, send }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Connections"
      description="Each Connection is one OBS Studio instance to control — usually just one, for a streamer running everything on this machine. Add another only if a second OBS (a capture PC, a co-streamer's own setup) needs its own."
      actions={
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add Connection
        </Button>
      }
    >
      {connections.length === 0 ? (
        <EmptyState>No Connection configured yet.</EmptyState>
      ) : (
        connections.map((connection) => (
          <ConnectionRow
            key={connection.id}
            connection={connection}
            others={connections.filter((other) => other.id !== connection.id)}
            send={send}
          />
        ))
      )}

      <ConnectionDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Connection"
        draft={BLANK_DRAFT}
        hasPassword={false}
        others={connections}
        onSave={(draft) => send({ event: "create-connection", connection: draft })}
      />
    </Section>
  );
}
