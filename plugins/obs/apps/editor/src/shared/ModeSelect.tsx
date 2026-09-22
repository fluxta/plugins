import { SelectField } from "@fluxta/sdk/ui";

type Props<M extends string> = {
  value: M | undefined;
  options: readonly { value: M; label: string }[];
  onChange: (mode: M) => void;
};

/**
 * The show/hide/toggle (or enable/disable/toggle) picker shared by Set
 * Source Visibility and Set Source Filter — these two ship a toggle mode
 * when Stream/Record/Mute deliberately do not.
 */
export function ModeSelect<M extends string>({ value, options, onChange }: Props<M>) {
  return (
    <SelectField
      label="Mode"
      placeholder="Choose a mode"
      options={options}
      value={value}
      onChange={(next) => onChange(next as M)}
    />
  );
}
