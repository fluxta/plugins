import { Badge, Button } from "@fluxta/sdk/ui";
import { useState } from "react";
import type { Connection, ConnectionDraft, ConnectionEntry, EditorMessage } from "obs-protocol";

import { ConnectionForm } from "./ConnectionForm";

type Props = {
  connection: ConnectionEntry;
  others: readonly Connection[];
  send: (message: EditorMessage) => void;
};

export function ConnectionRow({ connection, others, send }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ConnectionForm
        draft={{ name: connection.name, host: connection.host, port: connection.port }}
        hasPassword={connection.hasPassword}
        editingId={connection.id}
        others={others}
        onSave={(draft: ConnectionDraft) => {
          send({ event: "update-connection", id: connection.id, connection: draft });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{connection.name}</span>
          <StatusBadge status={connection.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {connection.host}:{connection.port}
        </p>
        <Detail status={connection.status} />
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="outline"
          onClick={() => send({ event: "delete-connection", id: connection.id })}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectionEntry["status"] }) {
  switch (status.status) {
    case "connected":
      return <Badge variant="secondary">Connected</Badge>;
    case "connecting":
      return <Badge variant="outline">Connecting…</Badge>;
    case "error":
      return <Badge variant="destructive">Unreachable</Badge>;
  }
}

function Detail({ status }: { status: ConnectionEntry["status"] }) {
  if (status.status !== "error") {
    return null;
  }

  return <p className="text-sm text-destructive">{status.message}</p>;
}
