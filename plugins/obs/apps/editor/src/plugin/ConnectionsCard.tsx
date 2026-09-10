import { Button } from "@fluxta/sdk/ui";
import { useState } from "react";
import { DEFAULT_OBS_PORT, type ConnectionDraft, type EditorMessage, type PluginStatus } from "obs-protocol";

import { ConnectionForm } from "./ConnectionForm";
import { ConnectionRow } from "./ConnectionRow";

type Props = {
  connections: PluginStatus["connections"];
  send: (message: EditorMessage) => void;
};

const BLANK_DRAFT: ConnectionDraft = { name: "", host: "127.0.0.1", port: DEFAULT_OBS_PORT };

export function ConnectionsCard({ connections, send }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="bg-background/30 text-base font-semibold">Connections</div>
      <p className="text-muted-foreground mt-2 mb-5 text-xs">
        Each Connection is one OBS Studio instance to control — usually just one, for a streamer
        running everything on this machine. Add another only if a second OBS (a capture PC, a
        co-streamer's own setup) needs its own.
      </p>

      <div className="space-y-3">
        {connections.map((connection) => (
          <ConnectionRow
            key={connection.id}
            connection={connection}
            others={connections.filter((other) => other.id !== connection.id)}
            send={send}
          />
        ))}

        {connections.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No Connection configured yet.</p>
        ) : null}

        {adding ? (
          <ConnectionForm
            draft={BLANK_DRAFT}
            hasPassword={false}
            others={connections}
            onSave={(draft) => {
              send({ event: "create-connection", connection: draft });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            Add Connection
          </Button>
        )}
      </div>
    </div>
  );
}
