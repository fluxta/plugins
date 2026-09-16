import { ActionEditor, referenceTo, type RunVariableDescriptor } from "@fluxta/sdk/api";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TemplateField,
} from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import {
  RESOLUTIONS,
  RESOLUTION_LABELS,
  type Resolution,
  type ResolveRedemptionSettings,
} from "platforms-protocol";

const editor = new ActionEditor();
const connected = editor.connect();

export function ResolveRedemptionEditor() {
  const [redemptionId, setRedemptionId] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [resolution, setResolution] = useState<Resolution>("fulfill");

  // The save handler is re-registered whenever the form changes, since only
  // one is active at a time and it must return the latest values.
  const latest = useRef<ResolveRedemptionSettings>({});
  latest.current = { redemptionId, rewardId, resolution };

  useEffect(() => {
    /**
     * Points the fields at the Event that carried the Redemption.
     *
     * Only ever fills an empty field, so it cannot undo a choice — and it
     * runs on every push, because the list arrives after the first render and
     * changes again whenever the surrounding program does.
     */
    const prefill = (variables: RunVariableDescriptor[]) => {
      setRedemptionId((current) => current || reference(variables, "redemptionId"));
      setRewardId((current) => current || reference(variables, "rewardId"));
    };

    const off = editor.onActionSave(() => latest.current);
    const stop = editor.onRunVariablesChange(prefill);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as ResolveRedemptionSettings | null;

      // Assigned one by one rather than as a block: a field the author left
      // empty stays open to the prefill below.
      if (saved?.redemptionId) {
        setRedemptionId(saved.redemptionId);
      }

      if (saved?.rewardId) {
        setRewardId(saved.rewardId);
      }

      if (saved?.resolution) {
        setResolution(saved.resolution);
      }

      prefill(editor.getRunVariables());
    });

    return () => {
      off();
      stop();
    };
  }, []);

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <div className="space-y-2">
        <Label htmlFor="resolution">What to do</Label>
        <Select
          value={resolution}
          onValueChange={(value: string) => setResolution(value as Resolution)}
        >
          <SelectTrigger id="resolution" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTIONS.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {RESOLUTION_LABELS[choice]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Either way the redemption leaves the channel's request queue on Twitch. Refunding gives
          the viewer their channel points back.
        </p>
      </div>

      <TemplateField
        id="redemption"
        label="Redemption"
        value={redemptionId}
        onChange={setRedemptionId}
        editor={editor}
        placeholder="The redemption id from the event"
        hint="Filled in from the Reward Redeemed event when this action sits under one."
      />

      <TemplateField
        id="reward"
        label="Reward"
        value={rewardId}
        onChange={setRewardId}
        editor={editor}
        placeholder="The reward id from the event"
        hint="Twitch needs the reward the redemption belongs to, alongside the redemption itself."
      />
    </main>
  );
}

/** The reference an author would have picked for an Event Field, if it is offered. */
function reference(variables: RunVariableDescriptor[], key: string): string {
  const match = variables.find((variable) => variable.address.endsWith(`.${key}`));
  return match ? referenceTo(match) : "";
}
