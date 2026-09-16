import { Badge, Button } from "@fluxta/sdk/ui";
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
    <div>
      <div className="bg-background/30 text-base font-semibold">Commands</div>
      <p className="text-muted-foreground mt-2 mb-5 text-xs">
        A command only announces that it fired. Choose what happens on the
        Events tab: react to Command Triggered and filter by the command name.
      </p>
      <div className="space-y-3">
        {editing && !commands.some((command) => command.id === editing.id) ? (
          <CommandForm
            command={editing}
            others={commands}
            onSave={save}
            onCancel={() => setEditing(undefined)}
          />
        ) : null}

        {editing ? null : (
          <Button variant="outline" onClick={() => setEditing(blankCommand())}>
            Add a command
          </Button>
        )}

        {commands.map((command) =>
          editing?.id === command.id ? (
            <CommandForm
              key={command.id}
              command={command}
              others={commands}
              onSave={save}
              onCancel={() => setEditing(undefined)}
            />
          ) : (
            <CommandRow
              key={command.id}
              command={command}
              onEdit={() => setEditing(command)}
              onDelete={() => send({ event: "delete-command", id: command.id })}
            />
          ),
        )}
      </div>
    </div>
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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{command.name}</span>
          {command.enabled ? null : <Badge variant="outline">Disabled</Badge>}
          <Badge variant="secondary">
            {PERMISSION_LABELS[command.permission]}
          </Badge>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="outline" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
