import { CheckboxField, Dialog, NumberField, TextField } from "@fluxta/sdk/ui";
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

  const patch = (changes: Partial<RewardDraft>) => {
    setCurrent((reward) => ({ ...reward, ...changes }));
  };

  const save = () => {
    const candidate: RewardDraft = {
      ...current,
      title: current.title.trim(),
      prompt: current.prompt.trim(),
    };

    const problem = validateRewardDraft(candidate, others);

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
      title="Reward"
      onSubmit={save}
    >
      <TextField
        label="Title"
        value={current.title}
        maxLength={REWARD_TITLE_MAX}
        onChange={(title) => patch({ title })}
        placeholder="Hydrate!"
        hint="What viewers see on the reward. Every reward on the channel needs its own."
      />

      <NumberField
        label="Cost"
        min={1}
        value={current.cost}
        onChange={(cost) => patch({ cost: cost ?? 0 })}
        hint="Channel points, at least one."
      />

      <TextField
        label="Description"
        value={current.prompt}
        maxLength={REWARD_PROMPT_MAX}
        onChange={(prompt) => patch({ prompt })}
        placeholder="Optional"
        multiline
      />

      <CheckboxField
        label="Ask the viewer to type something"
        checked={current.userInputRequired}
        onChange={(userInputRequired) => patch({ userInputRequired })}
        hint="What they type arrives as the User Input field of the Reward Redeemed event."
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Per stream"
          min={0}
          value={current.maxPerStream}
          onChange={(value) => patch({ maxPerStream: value ?? 0 })}
          hint="0 for no limit."
        />
        <NumberField
          label="Per viewer, per stream"
          min={0}
          value={current.maxPerUserPerStream}
          onChange={(value) => patch({ maxPerUserPerStream: value ?? 0 })}
          hint="0 for no limit."
        />
      </div>

      <NumberField
        label="Cooldown, seconds"
        min={0}
        value={current.cooldown}
        onChange={(value) => patch({ cooldown: value ?? 0 })}
        hint="How long the reward stays unavailable after someone redeems it. 0 for none."
      />

      <CheckboxField
        label="Shown to viewers"
        checked={current.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
    </Dialog>
  );
}
