import { Button, ListRow, StatusBadge, useConfirm, type StatusTone } from "@fluxta/sdk/ui";
import { useState } from "react";
import type { Connection, ConnectionDraft, ConnectionEntry, EditorMessage } from "obs-protocol";

import { ConnectionDialog } from "./ConnectionDialog";

type Props = {
  connection: ConnectionEntry;
  others: readonly Connection[];
  send: (message: EditorMessage) => void;
};

export function ConnectionRow({ connection, others, send }: Props) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();

  return (
    <>
      <ListRow
        title={connection.name}
        badges={<StatusBadge tone={statusTone(connection.status)}>{statusLabel(connection.status)}</StatusBadge>}
        description={`${connection.host}:${connection.port}`}
        detail={
          connection.status.status === "error" ? (
            <p role="alert" className="text-destructive text-xs/relaxed">
              {connection.status.message}
            </p>
          ) : null
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete "${connection.name}"?`,
                  description: "Every Action or Event pointed at this Connection will need a new one.",
                  confirmLabel: "Delete",
                  destructive: true,
                });

                if (sure) {
                  send({ event: "delete-connection", id: connection.id });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <ConnectionDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit Connection"
        draft={{ name: connection.name, host: connection.host, port: connection.port }}
        hasPassword={connection.hasPassword}
        editingId={connection.id}
        others={others}
        onSave={(draft: ConnectionDraft) => {
          send({ event: "update-connection", id: connection.id, connection: draft });
        }}
      />
    </>
  );
}

function statusTone(status: ConnectionEntry["status"]): StatusTone {
  switch (status.status) {
    case "connected":
      return "ok";
    case "connecting":
      return "pending";
    case "error":
      return "error";
  }
}

function statusLabel(status: ConnectionEntry["status"]): string {
  switch (status.status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "error":
      return "Unreachable";
  }
}
