import { referenceTo, type RunVariableDescriptor } from "@fluxta/sdk/api";
import { EditorPage, TemplateField, useActionEditor, useActionSettings } from "@fluxta/sdk/ui";
import { useEffect, useRef } from "react";
import type { DeleteMessageSettings } from "platforms-protocol";

export function DeleteMessageEditor() {
  const editor = useActionEditor();
  const { values, set, loaded } = useActionSettings<Required<DeleteMessageSettings>>({
    messageId: "",
  });

  // Read through a ref rather than closed over: the effect below only
  // re-runs once settings finish loading, but the prefill it registers must
  // always see the latest value, not whatever was on screen at that moment.
  const latest = useRef(values.messageId);
  latest.current = values.messageId;

  useEffect(() => {
    /**
     * Points the field at the Event that carried the message.
     *
     * Only ever fills an empty field, so it cannot undo a choice — and it
     * runs on every push, because the list arrives after the first render
     * and changes again whenever the surrounding program does.
     */
    const prefill = (variables: RunVariableDescriptor[]) => {
      if (latest.current) {
        return;
      }

      const match = variables.find((variable) => variable.address.endsWith(".messageId"));

      if (match) {
        set("messageId")(referenceTo(match));
      }
    };

    const stop = editor.onRunVariablesChange(prefill);

    // Waits for the saved settings to land first, so this only fills what the
    // author actually left empty rather than racing the load.
    if (loaded) {
      prefill(editor.getRunVariables());
    }

    return stop;
  }, [editor, set, loaded]);

  return (
    <EditorPage>
      <TemplateField
        label="Message"
        value={values.messageId}
        onChange={set("messageId")}
        placeholder="The message id from the event"
        hint="Filled in from the Chat Message or Command Triggered event when this action sits under one."
      />
    </EditorPage>
  );
}
