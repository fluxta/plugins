import { NumberField, type NumberFieldProps } from "@fluxta/sdk/ui";
import { useRef, useState } from "react";

type SavedNumberFieldProps = Omit<
  NumberFieldProps,
  "value" | "onChange" | "onBlur"
> & {
  /** The value as saved. */
  saved: number | undefined;
  /** Called once the field is left with a different value. */
  onSave: (value: number | undefined) => void;
};

/**
 * A NumberField that saves when it is left, not on every keystroke: each
 * save is a write to Plugin Settings, and `2`, `20` on the way to `200` are
 * not values anyone chose.
 */
export function SavedNumberField({
  saved,
  onSave,
  ...props
}: SavedNumberFieldProps) {
  // What is typed, with the saved value it was typed over: once the saved
  // value changes — this edit has been saved, or another editor's — the
  // draft has had its say.
  const [draft, setDraft] = useState<{
    value: number | undefined;
    over: number | undefined;
  }>();
  // Read on blur, after NumberField's own last `onChange` — it brings an
  // out-of-range value back into range just before calling `onBlur`.
  const latest = useRef<number | undefined>(undefined);
  const editing = useRef(false);

  const shown = draft && draft.over === saved ? draft.value : saved;

  return (
    <NumberField
      {...props}
      value={shown}
      onChange={(value) => {
        editing.current = true;
        latest.current = value;
        setDraft({ value, over: saved });
      }}
      onBlur={() => {
        if (!editing.current) {
          return;
        }
        editing.current = false;
        if (latest.current === saved) {
          setDraft(undefined);
        } else {
          onSave(latest.current);
        }
      }}
    />
  );
}
