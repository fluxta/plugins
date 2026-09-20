import { ActionEditor } from "@fluxta/sdk/api";
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
  ENABLEMENTS,
  ENABLEMENT_LABELS,
  type Enablement,
  type UpdateRewardSettings,
} from "platforms-protocol";

import { RewardSelect } from "../shared/RewardSelect";
import { useRewards } from "../shared/useRewards";

const editor = new ActionEditor();
const connected = editor.connect();

export function UpdateRewardEditor() {
  const [rewardId, setRewardId] = useState("");
  // Toggling is what a single deck button is usually for; the other choices
  // are for a program that knows which way it wants the reward to end up.
  const [enablement, setEnablement] = useState<Enablement>("toggle");
  const [cost, setCost] = useState("");
  const rewards = useRewards(editor, connected);

  // The save handler is re-registered whenever the form changes, since only
  // one is active at a time and it must return the latest values.
  const latest = useRef<UpdateRewardSettings>({});
  latest.current = { rewardId, enablement, cost: cost || undefined };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as UpdateRewardSettings | null;

      if (saved) {
        setRewardId(saved.rewardId ?? "");
        setEnablement(saved.enablement ?? "toggle");
        setCost(saved.cost ?? "");
      }
    });

    return off;
  }, []);

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <RewardSelect rewards={rewards} value={rewardId} onChange={setRewardId} />

      <div className="space-y-2">
        <Label htmlFor="enablement">Shown to viewers</Label>
        <Select
          value={enablement}
          onValueChange={(value: string) => setEnablement(value as Enablement)}
        >
          <SelectTrigger id="enablement" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENABLEMENTS.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {ENABLEMENT_LABELS[choice]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A disabled reward stays on the channel but viewers cannot redeem it.
        </p>
      </div>

      <TemplateField
        id="cost"
        label="Cost"
        value={cost}
        onChange={setCost}
        editor={editor}
        placeholder="Leave empty to keep the current cost"
        hint="Channel points a redemption costs. A whole number, or a reference that resolves to one."
      />
    </main>
  );
}
