import { Button, Input, Label } from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  DEFAULT_OBS_PORT,
  validateConnectionDraft,
  type Connection,
  type ConnectionDraft,
} from "obs-protocol";

type Props = {
  draft: ConnectionDraft;
  /** Whether the Connection being edited already has a password stored — never the password itself. */
  hasPassword: boolean;
  editingId?: string;
  /** Every other configured Connection, so a clashing name is caught early. */
  others: readonly Connection[];
  onSave: (draft: ConnectionDraft) => void;
  onCancel: () => void;
};

export function ConnectionForm({ draft, hasPassword, editingId, others, onSave, onCancel }: Props) {
  const [name, setName] = useState(draft.name);
  const [host, setHost] = useState(draft.host);
  const [port, setPort] = useState(String(draft.port));
  // Never pre-filled with the stored password — the editor is never sent it.
  // Left blank, an edit keeps the existing one; a new Connection gets none.
  const [password, setPassword] = useState("");
  const [refusal, setRefusal] = useState<string>();

  const save = () => {
    const candidate: ConnectionDraft = {
      name: name.trim(),
      host: host.trim(),
      port: Number(port),
      password: password === "" ? undefined : password,
    };

    const problem = validateConnectionDraft(candidate, others, editingId);

    if (problem) {
      setRefusal(problem);
      return;
    }

    onSave(candidate);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Main PC"
        />
        <p className="text-xs text-muted-foreground">
          Shown wherever an Action, Event, or condition picks this Connection.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="host">Host</Label>
          <Input
            id="host"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="127.0.0.1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">Port</Label>
          <Input
            id="port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(event.target.value || String(DEFAULT_OBS_PORT))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={hasPassword ? "•••• saved — leave blank to keep it" : "Leave blank if OBS has no password set"}
        />
        <p className="text-xs text-muted-foreground">
          From OBS: Tools → obs-websocket Settings. Leave the server's authentication off and this
          can stay empty too.
        </p>
      </div>

      {refusal ? <p className="text-sm text-destructive">{refusal}</p> : null}

      <div className="flex gap-2">
        <Button onClick={save}>Save</Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
