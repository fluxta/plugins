import { Badge, Button, EmptyState, ListRow, Section, StatusBadge } from "@fluxta/sdk/ui";
import {
  PERMISSION_LABELS,
  type Command,
  type EditorMessage,
} from "platforms-protocol";
import { useState } from "react";

import { CommandForm } from "./CommandForm";

type Props = {
  commands: Command[];
  send: (message: EditorMessage) => void;
};

function blankCommand(): Command {
  return {
    id: crypto.randomUUID(),
    name: "",
    aliases: [],
    enabled: true,
    permission: "everyone",
    globalCooldown: 0,
    userCooldown: 0,
  };
}

export function CommandsCard({ commands, send }: Props) {
  const [editing, setEditing] = useState<Command>();

  const save = (command: Command) => {
    send({ event: "save-command", command });
    setEditing(undefined);
  };

  return (
    <Section
      title="Commands"
      description="A command only announces that it fired. Choose what happens on the Events tab: react to Command Triggered and filter by the command name."
      actions={
        <Button variant="outline" onClick={() => setEditing(blankCommand())}>
          Add a command
        </Button>
      }
    >
      {commands.length === 0 ? (
        <EmptyState>No commands yet.</EmptyState>
      ) : (
        commands.map((command) => (
          <CommandRow
            key={command.id}
            command={command}
            onEdit={() => setEditing(command)}
            onDelete={() => send({ event: "delete-command", id: command.id })}
          />
        ))
      )}

      {editing ? (
        <CommandForm
          command={editing}
          others={commands.filter((command) => command.id !== editing.id)}
          onSave={save}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
    </Section>
  );
}

function CommandRow({
  command,
  onEdit,
  onDelete,
}: {
  command: Command;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ListRow
      title={command.name}
      badges={
        <>
          {command.enabled ? null : <StatusBadge tone="idle">Disabled</StatusBadge>}
          <Badge variant="secondary">{PERMISSION_LABELS[command.permission]}</Badge>
        </>
      }
      actions={
        <>
          <Button variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" onClick={onDelete}>
            Delete
          </Button>
        </>
      }
    />
  );
}
