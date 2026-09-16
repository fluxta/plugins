import { ActionEditor } from "@fluxta/sdk/api";
import { Button, Input, Label, TemplateField } from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import {
  PREDICTION_DURATION_MAX,
  PREDICTION_DURATION_MIN,
  PREDICTION_MAX_OUTCOMES,
  PREDICTION_MIN_OUTCOMES,
  PREDICTION_OUTCOME_TITLE_MAX,
  PREDICTION_TITLE_MAX,
  type StartPredictionSettings,
} from "platforms-protocol";

const editor = new ActionEditor();
const connected = editor.connect();

const BLANK_OUTCOMES = Array.from({ length: PREDICTION_MIN_OUTCOMES }, () => "");

export function StartPredictionEditor() {
  const [title, setTitle] = useState("");
  const [outcomes, setOutcomes] = useState<string[]>(BLANK_OUTCOMES);
  const [duration, setDuration] = useState("120");

  // The save handler is re-registered whenever the form changes, since only
  // one is active at a time and it must return the latest values.
  const latest = useRef<StartPredictionSettings>({});
  latest.current = { title, outcomes, duration };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as StartPredictionSettings | null;

      if (saved) {
        setTitle(saved.title ?? "");
        setOutcomes(
          saved.outcomes && saved.outcomes.length >= PREDICTION_MIN_OUTCOMES
            ? saved.outcomes
            : BLANK_OUTCOMES,
        );
        setDuration(saved.duration ?? "120");
      }
    });

    return off;
  }, []);

  const updateOutcome = (index: number, value: string) => {
    setOutcomes((current) => current.map((outcome, i) => (i === index ? value : outcome)));
  };

  const addOutcome = () => {
    setOutcomes((current) =>
      current.length >= PREDICTION_MAX_OUTCOMES ? current : [...current, ""],
    );
  };

  const removeOutcome = (index: number) => {
    setOutcomes((current) =>
      current.length <= PREDICTION_MIN_OUTCOMES ? current : current.filter((_, i) => i !== index),
    );
  };

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <TemplateField
        id="title"
        label="Title"
        value={title}
        onChange={setTitle}
        editor={editor}
        placeholder="Do we win this game?"
        hint={`Shown to viewers on Twitch. Up to ${PREDICTION_TITLE_MAX} characters.`}
      />

      <div className="space-y-2">
        <Label>Outcomes</Label>
        <div className="space-y-2">
          {outcomes.map((outcome, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={outcome}
                maxLength={PREDICTION_OUTCOME_TITLE_MAX}
                onChange={(event) => updateOutcome(index, event.target.value)}
                placeholder={`Outcome ${index + 1}`}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={outcomes.length <= PREDICTION_MIN_OUTCOMES}
                onClick={() => removeOutcome(index)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={outcomes.length >= PREDICTION_MAX_OUTCOMES}
          onClick={addOutcome}
        >
          Add an outcome
        </Button>
        <p className="text-xs text-muted-foreground">
          Twitch allows between {PREDICTION_MIN_OUTCOMES} and {PREDICTION_MAX_OUTCOMES} outcomes.
          Resolve Prediction addresses one later by its number here or its exact title.
        </p>
      </div>

      <TemplateField
        id="duration"
        label="Betting window, seconds"
        value={duration}
        onChange={setDuration}
        editor={editor}
        placeholder="120"
        hint={`Between ${PREDICTION_DURATION_MIN} and ${PREDICTION_DURATION_MAX} seconds, unless Lock Prediction closes it early.`}
      />
    </main>
  );
}
