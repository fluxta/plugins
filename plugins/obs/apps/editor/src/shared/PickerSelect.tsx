import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@fluxta/sdk/ui";
import type { PickerOption } from "obs-protocol";

type Props = {
  id: string;
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: string;
};

/**
 * A live Scene/Source/Input/Filter picker — the same shape for all four,
 * fed by one of the `useLiveLists` hooks.
 *
 * Keeps a saved choice visible even once it drops out of `options` (OBS
 * closed, the Connection unreachable, the thing renamed or removed) rather
 * than silently emptying the field.
 */
export function PickerSelect({ id, label, placeholder, options, value, onChange, hint }: Props) {
  const missing = !!value && !options.some((option) => option.value === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {missing ? (
            <SelectItem value={value}>{value} — not found right now</SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
