import { SelectField } from "@fluxta/sdk/ui";
import type { PickerOption } from "obs-protocol";

type Props = {
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: string;
};

/**
 * A live Scene/Source/Input/Filter/Group picker — the same shape for all of
 * them, fed by one of the `useLiveLists` hooks.
 *
 * Keeps a saved choice visible even once it drops out of `options` (OBS
 * closed, the Connection unreachable, the thing renamed or removed) rather
 * than silently emptying the field.
 */
export function PickerSelect({ label, placeholder, options, value, onChange, hint }: Props) {
  return (
    <SelectField
      label={label}
      hint={hint}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={onChange}
      missingLabel={(missing) => `${missing} — not found right now`}
    />
  );
}
