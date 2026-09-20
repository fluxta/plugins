import { EditorPage, SelectField, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import {
  ENABLEMENTS,
  ENABLEMENT_LABELS,
  type Enablement,
  type UpdateRewardSettings,
} from "platforms-protocol";

import { RewardSelect } from "../shared/RewardSelect";
import { useRewards } from "../shared/useRewards";

const ENABLEMENT_OPTIONS = ENABLEMENTS.map((choice) => ({
  value: choice,
  label: ENABLEMENT_LABELS[choice],
}));

export function UpdateRewardEditor() {
  // Toggling is what a single deck button is usually for; the other choices
  // are for a program that knows which way it wants the reward to end up.
  const { values, set } = useActionSettings<Required<UpdateRewardSettings>>({
    rewardId: "",
    enablement: "toggle",
    cost: "",
  });
  const rewards = useRewards();

  return (
    <EditorPage>
      <RewardSelect rewards={rewards} value={values.rewardId} onChange={set("rewardId")} />

      <SelectField
        label="Shown to viewers"
        value={values.enablement}
        onChange={(value) => set("enablement")(value as Enablement)}
        options={ENABLEMENT_OPTIONS}
        hint="A disabled reward stays on the channel but viewers cannot redeem it."
      />

      <TemplateField
        label="Cost"
        value={values.cost}
        onChange={set("cost")}
        placeholder="Leave empty to keep the current cost"
        hint="Channel points a redemption costs. A whole number, or a reference that resolves to one."
      />
    </EditorPage>
  );
}
