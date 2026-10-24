import {
  Button,
  Field,
  Input,
  SelectField,
  type SelectOption,
} from "@fluxta/sdk/ui";
import { useId, useState, type ReactNode } from "react";
import { LISTEN_TEXT, type ListenSettings } from "tts-protocol";

import { useListen } from "./useListen";

type VoiceFieldProps = {
  label: string;
  options: SelectOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: ReactNode;
  /** Why there are no voices: the Provider's reason. */
  error?: string;
  loading?: boolean;
  placeholder?: string;
  /** What Listen speaks with — the form as it stands, unsaved. */
  listen: ListenSettings;
};

/**
 * The voice field, with Listen under it: the text typed beside the button,
 * spoken with the form's rate, volume and output device. The text is the
 * editor's alone — never saved — and starts as the greeting. Why a
 * Listen could not be heard takes the place of the field's error.
 */
export function VoiceField({
  label,
  hint,
  error,
  listen: settings,
  ...select
}: VoiceFieldProps) {
  const [text, setText] = useState(LISTEN_TEXT);
  const { listen, problem } = useListen(text, settings);
  // The label sits on the outer Field, over the select and Listen alike: it
  // names the select, which has no label of its own.
  const id = useId();

  return (
    <Field label={label} hint={hint} error={problem ?? error} htmlFor={id}>
      <div className="voice-field">
        <SelectField {...select} id={id} />
        <div className="with-listen">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Not the Enter that ends an input method's composition.
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                listen();
              }
            }}
            placeholder={LISTEN_TEXT}
            aria-label="What Listen says"
          />
          <Button variant="outline" onClick={listen}>
            Listen
          </Button>
        </div>
      </div>
    </Field>
  );
}
