import { TemplateField } from "@fluxta/sdk/ui";
import type { VolumeSettings } from "wave-link-protocol";

const fields = {
  volume: {
    label: "Volume",
    placeholder: "100",
    hint: "Percent, from 0 to 100. Values outside the range are clamped.",
  },
  adjustment: {
    label: "Adjustment",
    placeholder: "5",
    hint: "Percentage points: 5 is louder, -5 is quieter. The result stays within 0–100%.",
  },
};

type Props = {
  kind: keyof typeof fields;
  value: VolumeSettings["volumePercent"];
  onChange: (value: string) => void;
};

export function VolumeField({ kind, value, onChange }: Props) {
  return (
    <TemplateField
      {...fields[kind]}
      value={String(value ?? "")}
      onChange={onChange}
    />
  );
}
