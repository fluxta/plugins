import { Button, EditorPage, Field, Input, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import {
  PREDICTION_DURATION_MAX,
  PREDICTION_DURATION_MIN,
  PREDICTION_MAX_OUTCOMES,
  PREDICTION_MIN_OUTCOMES,
  PREDICTION_OUTCOME_TITLE_MAX,
  PREDICTION_TITLE_MAX,
  type StartPredictionSettings,
} from "platforms-protocol";

const BLANK_OUTCOMES = Array.from({ length: PREDICTION_MIN_OUTCOMES }, () => "");

export function StartPredictionEditor() {
  const { values, set, update } = useActionSettings<Required<StartPredictionSettings>>({
    title: "",
    outcomes: BLANK_OUTCOMES,
    duration: "120",
  });

  const outcomes =
    values.outcomes.length >= PREDICTION_MIN_OUTCOMES ? values.outcomes : BLANK_OUTCOMES;

  const updateOutcome = (index: number, value: string) => {
    update({ outcomes: outcomes.map((outcome, i) => (i === index ? value : outcome)) });
  };

  const addOutcome = () => {
    if (outcomes.length < PREDICTION_MAX_OUTCOMES) {
      update({ outcomes: [...outcomes, ""] });
    }
  };

  const removeOutcome = (index: number) => {
    if (outcomes.length > PREDICTION_MIN_OUTCOMES) {
      update({ outcomes: outcomes.filter((_, i) => i !== index) });
    }
  };

  return (
    <EditorPage>
      <TemplateField
        label="Title"
        value={values.title}
        onChange={set("title")}
        placeholder="Do we win this game?"
        hint={`Shown to viewers on Twitch. Up to ${PREDICTION_TITLE_MAX} characters.`}
      />

      <Field
        label="Outcomes"
        hint={`Twitch allows between ${PREDICTION_MIN_OUTCOMES} and ${PREDICTION_MAX_OUTCOMES} outcomes. Resolve Prediction addresses one later by its number here or its exact title.`}
      >
        <div className="flex flex-col gap-2">
          {outcomes.map((outcome, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="flex-1"
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
          <Button
            variant="outline"
            size="sm"
            disabled={outcomes.length >= PREDICTION_MAX_OUTCOMES}
            onClick={addOutcome}
          >
            Add an outcome
          </Button>
        </div>
      </Field>

      <TemplateField
        label="Betting window, seconds"
        value={values.duration}
        onChange={set("duration")}
        placeholder="120"
        hint={`Between ${PREDICTION_DURATION_MIN} and ${PREDICTION_DURATION_MAX} seconds, unless Lock Prediction closes it early.`}
      />
    </EditorPage>
  );
}
