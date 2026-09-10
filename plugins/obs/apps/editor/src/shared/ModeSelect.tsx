import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@fluxta/sdk/ui";

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
    <div className="space-y-2">
      <Label htmlFor="mode">Mode</Label>
      <Select value={value ?? ""} onValueChange={(next: string) => onChange(next as M)}>
        <SelectTrigger id="mode" className="w-full">
          <SelectValue placeholder="Choose a mode" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
