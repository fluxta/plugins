import { referenceTo, type RunVariableDescriptor } from "@fluxta/sdk/api";
import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionEditor,
  useActionSettings,
} from "@fluxta/sdk/ui";
import { useEffect, useRef } from "react";
import {
  RESOLUTIONS,
  RESOLUTION_LABELS,
  type Resolution,
  type ResolveRedemptionSettings,
} from "platforms-protocol";

const RESOLUTION_OPTIONS = RESOLUTIONS.map((choice) => ({
  value: choice,
  label: RESOLUTION_LABELS[choice],
}));

export function ResolveRedemptionEditor() {
  const editor = useActionEditor();
  const { values, set, update, loaded } = useActionSettings<
    Required<ResolveRedemptionSettings>
  >({ redemptionId: "", rewardId: "", resolution: "fulfill" });

  // Read through a ref rather than closed over: the effect below only
  // re-runs once settings finish loading, but the prefill it registers must
  // always see the latest values, not whatever was on screen at that moment.
  const latest = useRef(values);
  latest.current = values;

  useEffect(() => {
    /**
     * Points the fields at the Event that carried the Redemption.
     *
     * Only ever fills an empty field, so it cannot undo a choice — and it
     * runs on every push, because the list arrives after the first render and
     * changes again whenever the surrounding program does.
     */
    const prefill = (variables: RunVariableDescriptor[]) => {
      const patch: Partial<ResolveRedemptionSettings> = {};

      if (!latest.current.redemptionId) {
        patch.redemptionId = reference(variables, "redemptionId");
      }

      if (!latest.current.rewardId) {
        patch.rewardId = reference(variables, "rewardId");
      }

      if (Object.keys(patch).length > 0) {
        update(patch);
      }
    };

    const stop = editor.onRunVariablesChange(prefill);

    // Waits for the saved settings to land first, so this only fills what the
    // author actually left empty rather than racing the load.
    if (loaded) {
      prefill(editor.getRunVariables());
    }

    return stop;
  }, [editor, update, loaded]);

  return (
    <EditorPage>
      <SelectField
        label="What to do"
        value={values.resolution}
        onChange={(value) => set("resolution")(value as Resolution)}
        options={RESOLUTION_OPTIONS}
        hint="Either way the redemption leaves the channel's request queue on Twitch. Refunding gives the viewer their channel points back."
      />

      <TemplateField
        label="Redemption"
        value={values.redemptionId}
        onChange={set("redemptionId")}
        placeholder="The redemption id from the event"
        hint="Filled in from the Reward Redeemed event when this action sits under one."
      />

      <TemplateField
        label="Reward"
        value={values.rewardId}
        onChange={set("rewardId")}
        placeholder="The reward id from the event"
        hint="Twitch needs the reward the redemption belongs to, alongside the redemption itself."
      />
    </EditorPage>
  );
}

/** The reference an author would have picked for an Event Field, if it is offered. */
function reference(variables: RunVariableDescriptor[], key: string): string {
  const match = variables.find((variable) => variable.address.endsWith(`.${key}`));
  return match ? referenceTo(match) : "";
}
