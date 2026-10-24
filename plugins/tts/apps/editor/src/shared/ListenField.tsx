import {
  Button,
  Field,
  Input,
  SelectField,
  type MissingLabel,
  type SelectOption,
} from "@fluxta/sdk/ui";
import { useId, useState, type ReactNode } from "react";
import { LISTEN_TEXT, type ListenSettings } from "tts-protocol";

import { useListen } from "./useListen";

type ListenFieldProps = {
  label: string;
  options: SelectOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: ReactNode;
  /** Why there is nothing to choose from: the Provider's reason. */
  error?: string;
  loading?: boolean;
  placeholder?: string;
  missingLabel?: MissingLabel;
  /**
   * What Listen speaks with — the form as it stands, unsaved — or nothing
   * while there is nothing to listen to.
   */
  listen: ListenSettings | undefined;
};

/**
 * A select of what speaks — a Voice, a Preset — with Listen under it: the
 * text typed beside the button, spoken as the form stands. The text is the
 * editor's alone — never saved — and starts as the greeting. Why a Listen
 * could not be heard takes the place of the field's error.
 */
export function ListenField({
  label,
  hint,
  error,
  listen: settings,
  ...select
}: ListenFieldProps) {
  const [text, setText] = useState(LISTEN_TEXT);
  const { listen, problem } = useListen(text, settings ?? {});
  // The label sits on the outer Field, over the select and Listen alike: it
  // names the select, which has no label of its own.
  const id = useId();

  return (
    <Field label={label} hint={hint} error={problem ?? error} htmlFor={id}>
      <div className="listen-field">
        <SelectField {...select} id={id} />
        <div className="with-listen">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Not the Enter that ends an input method's composition.
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                // Inside a dialog's form, Enter would save it as well.
                event.preventDefault();
                if (settings) {
                  listen();
                }
              }
            }}
            placeholder={LISTEN_TEXT}
            aria-label="What Listen says"
          />
          <Button
            // Inside a dialog's form, a button submits it unless told not to.
            type="button"
            variant="outline"
            disabled={!settings}
            onClick={listen}
          >
            Listen
          </Button>
        </div>
      </div>
    </Field>
  );
}
