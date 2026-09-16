import { ActionEditor } from "@fluxta/sdk/api";
import { TemplateField } from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import type { ResolvePredictionSettings } from "platforms-protocol";

const editor = new ActionEditor();
const connected = editor.connect();

export function ResolvePredictionEditor() {
  const [outcome, setOutcome] = useState("");

  // The save handler is re-registered whenever the form changes, since only
  // one is active at a time and it must return the latest values.
  const latest = useRef<ResolvePredictionSettings>({});
  latest.current = { outcome };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as ResolvePredictionSettings | null;

      if (saved) {
        setOutcome(saved.outcome ?? "");
      }
    });

    return off;
  }, []);

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <TemplateField
        id="outcome"
        label="Winning outcome"
        value={outcome}
        onChange={setOutcome}
        editor={editor}
        placeholder="1, or the outcome's exact title"
        hint={
          "Type the outcome's number (as configured in Start Prediction, e.g. \"2\") or its " +
          "exact title. There is no id to type — the plugin looks it up from the prediction " +
          "that is currently running, so there is only one to resolve."
        }
      />
    </main>
  );
}
