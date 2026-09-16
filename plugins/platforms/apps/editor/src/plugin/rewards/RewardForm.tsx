import { Button, Checkbox, Input, Label, Textarea } from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  REWARD_PROMPT_MAX,
  REWARD_TITLE_MAX,
  validateRewardDraft,
  type Reward,
  type RewardDraft,
} from "platforms-protocol";

type Props = {
  draft: RewardDraft;
  /** Every other Reward on the channel, so a clashing title is caught early. */
  others: readonly Reward[];
  onSave: (draft: RewardDraft) => void;
  onCancel: () => void;
};

export function RewardForm({ draft, others, onSave, onCancel }: Props) {
  const [current, setCurrent] = useState<RewardDraft>(draft);
  const [refusal, setRefusal] = useState<string>();

  const patch = (changes: Partial<RewardDraft>) => {
    setCurrent((reward) => ({ ...reward, ...changes }));
    setRefusal(undefined);
  };

  const save = () => {
    const candidate: RewardDraft = {
      ...current,
      title: current.title.trim(),
      prompt: current.prompt.trim(),
    };

    const problem = validateRewardDraft(candidate, others);

    if (problem) {
      setRefusal(problem);
      return;
    }

    onSave(candidate);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={current.title}
          maxLength={REWARD_TITLE_MAX}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="Hydrate!"
        />
        <p className="text-xs text-muted-foreground">
          What viewers see on the reward. Every reward on the channel needs its own.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cost">Cost</Label>
        <Input
          id="cost"
          type="number"
          min={1}
          value={current.cost}
          onChange={(event) => patch({ cost: Number(event.target.value) || 0 })}
        />
        <p className="text-xs text-muted-foreground">Channel points, at least one.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">Description</Label>
        <Textarea
          id="prompt"
          value={current.prompt}
          maxLength={REWARD_PROMPT_MAX}
          onChange={(event) => patch({ prompt: event.target.value })}
          placeholder="Optional"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={current.userInputRequired}
          onCheckedChange={(checked: boolean) => patch({ userInputRequired: checked })}
        />
        Ask the viewer to type something
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">
        What they type arrives as the User Input field of the Reward Redeemed event.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="max-per-stream">Per stream</Label>
          <Input
            id="max-per-stream"
            type="number"
            min={0}
            value={current.maxPerStream}
            onChange={(event) => patch({ maxPerStream: Number(event.target.value) || 0 })}
          />
          <p className="text-xs text-muted-foreground">0 for no limit.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="max-per-viewer">Per viewer, per stream</Label>
          <Input
            id="max-per-viewer"
            type="number"
            min={0}
            value={current.maxPerUserPerStream}
            onChange={(event) => patch({ maxPerUserPerStream: Number(event.target.value) || 0 })}
          />
          <p className="text-xs text-muted-foreground">0 for no limit.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reward-cooldown">Cooldown, seconds</Label>
        <Input
          id="reward-cooldown"
          type="number"
          min={0}
          value={current.cooldown}
          onChange={(event) => patch({ cooldown: Number(event.target.value) || 0 })}
        />
        <p className="text-xs text-muted-foreground">
          How long the reward stays unavailable after someone redeems it. 0 for none.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={current.enabled}
          onCheckedChange={(checked: boolean) => patch({ enabled: checked })}
        />
        Shown to viewers
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
