import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

export function CommandForm({ command, others, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Command>(command);
  const [aliases, setAliases] = useState(command.aliases.join(", "));
  const [refusal, setRefusal] = useState<string>();

  const patch = (changes: Partial<Command>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setRefusal(undefined);
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
      setRefusal(problem);
      return;
    }

    onSave(candidate);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="space-y-2">
        <Label htmlFor="name">Command</Label>
        <Input
          id="name"
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="!roll"
        />
        <p className="text-xs text-muted-foreground">
          Matched against the first word of a message, ignoring case.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="aliases">Aliases</Label>
        <Input
          id="aliases"
          value={aliases}
          onChange={(event) => {
            setAliases(event.target.value);
            setRefusal(undefined);
          }}
          placeholder="!r, !dice"
        />
        <p className="text-xs text-muted-foreground">Separated by commas. Optional.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="permission">Who can use it</Label>
        <Select
          value={draft.permission}
          onValueChange={(value: string) => patch({ permission: value as PermissionLevel })}
        >
          <SelectTrigger id="permission" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERMISSION_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {PERMISSION_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Anyone with a higher standing can use it too.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="global-cooldown">Cooldown, seconds</Label>
          <Input
            id="global-cooldown"
            type="number"
            min={0}
            value={draft.globalCooldown}
            onChange={(event) => patch({ globalCooldown: Number(event.target.value) || 0 })}
          />
          <p className="text-xs text-muted-foreground">For everyone.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-cooldown">Per viewer, seconds</Label>
          <Input
            id="user-cooldown"
            type="number"
            min={0}
            value={draft.userCooldown}
            onChange={(event) => patch({ userCooldown: Number(event.target.value) || 0 })}
          />
          <p className="text-xs text-muted-foreground">For one viewer.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={draft.enabled}
          onCheckedChange={(checked: boolean) => patch({ enabled: checked })}
        />
        Enabled
      </label>

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
