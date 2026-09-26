import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { ResolvePredictionSettings } from "platforms-protocol";

export function ResolvePredictionEditor() {
  const { values, set } = useActionSettings<Required<ResolvePredictionSettings>>({
    outcome: "",
  });

  return (
    <EditorPage>
      <TemplateField
        label="Winning outcome"
        value={values.outcome}
        onChange={set("outcome")}
        placeholder="1, or the outcome's exact title"
        hint={
          "Type the outcome's number (as configured in Start Prediction, e.g. \"2\") or its " +
          "exact title. There is no id to type — the plugin looks it up from the prediction " +
          "that is currently running, so there is only one to resolve."
        }
      />
    </EditorPage>
  );
}
