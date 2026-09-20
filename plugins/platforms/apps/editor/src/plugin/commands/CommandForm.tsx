import {
  CheckboxField,
  Dialog,
  NumberField,
  SelectField,
  TextField,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  PERMISSION_LABELS,
  PERMISSION_LEVELS,
  validateCommand,
  type Command,
  type PermissionLevel,
} from "platforms-protocol";

type Props = {
  command: Command;
  /** Every other Command, so a clashing word can be caught before saving. */
  others: readonly Command[];
  onSave: (command: Command) => void;
  onCancel: () => void;
};

const PERMISSION_OPTIONS = PERMISSION_LEVELS.map((level) => ({
  value: level,
  label: PERMISSION_LABELS[level],
}));

export function CommandForm({ command, others, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Command>(command);
  const [aliases, setAliases] = useState(command.aliases.join(", "));

  const patch = (changes: Partial<Command>) => {
    setDraft((current) => ({ ...current, ...changes }));
  };

  const save = () => {
    const candidate: Command = {
      ...draft,
      name: draft.name.trim(),
      aliases: aliases
        .split(",")
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0),
    };

    const problem = validateCommand(candidate, others);

    if (problem) {
      return problem;
    }

    onSave(candidate);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Command"
      onSubmit={save}
    >
      <TextField
        label="Command"
        value={draft.name}
        onChange={(name) => patch({ name })}
        placeholder="!roll"
        hint="Matched against the first word of a message, ignoring case."
      />

      <TextField
        label="Aliases"
        value={aliases}
        onChange={setAliases}
        placeholder="!r, !dice"
        hint="Separated by commas. Optional."
      />

      <SelectField
        label="Who can use it"
        options={PERMISSION_OPTIONS}
        value={draft.permission}
        onChange={(value) => patch({ permission: value as PermissionLevel })}
        hint="Anyone with a higher standing can use it too."
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Cooldown, seconds"
          min={0}
          value={draft.globalCooldown}
          onChange={(value) => patch({ globalCooldown: value ?? 0 })}
          hint="For everyone."
        />
        <NumberField
          label="Per viewer, seconds"
          min={0}
          value={draft.userCooldown}
          onChange={(value) => patch({ userCooldown: value ?? 0 })}
          hint="For one viewer."
        />
      </div>

      <CheckboxField
        label="Enabled"
        checked={draft.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
    </Dialog>
  );
}
