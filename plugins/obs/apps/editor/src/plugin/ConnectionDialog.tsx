import { Dialog, NumberField, TextField } from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";
import {
  DEFAULT_OBS_PORT,
  validateConnectionDraft,
  type Connection,
  type ConnectionDraft,
} from "obs-protocol";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  draft: ConnectionDraft;
  /** Whether the Connection being edited already has a password stored — never the password itself. */
  hasPassword: boolean;
  editingId?: string;
  /** Every other configured Connection, so a clashing name is caught early. */
  others: readonly Connection[];
  onSave: (draft: ConnectionDraft) => void;
};

export function ConnectionDialog(props: Props) {
  const { open, onOpenChange, title, draft, hasPassword, editingId, others, onSave } = props;

  const [name, setName] = useState(draft.name);
  const [host, setHost] = useState(draft.host);
  const [port, setPort] = useState<number | undefined>(draft.port);
  // Never pre-filled with the stored password — the editor is never sent it.
  // Left blank, an edit keeps the existing one; a new Connection gets none.
  const [password, setPassword] = useState("");

  useEffect(() => {
    // A reopened dialog reflects the Connection as it stands now, not
    // whatever was last typed into it.
    if (open) {
      setName(draft.name);
      setHost(draft.host);
      setPort(draft.port);
      setPassword("");
    }
  }, [open, draft]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={() => {
        const candidate: ConnectionDraft = {
          name: name.trim(),
          host: host.trim(),
          port: port ?? DEFAULT_OBS_PORT,
          password: password === "" ? undefined : password,
        };

        const problem = validateConnectionDraft(candidate, others, editingId);

        if (problem) {
          return problem;
        }

        onSave(candidate);
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Main PC"
        hint="Shown wherever an Action, Event, or condition picks this Connection."
      />
      <div className="grid grid-cols-3 gap-3">
        <TextField
          className="col-span-2"
          label="Host"
          value={host}
          onChange={setHost}
          placeholder="127.0.0.1"
        />
        <NumberField label="Port" min={1} max={65535} value={port} onChange={setPort} />
      </div>
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={
          hasPassword ? "•••• saved — leave blank to keep it" : "Leave blank if OBS has no password set"
        }
        hint="From OBS: Tools → obs-websocket Settings. Leave the server's authentication off and this can stay empty too."
      />
    </Dialog>
  );
}
