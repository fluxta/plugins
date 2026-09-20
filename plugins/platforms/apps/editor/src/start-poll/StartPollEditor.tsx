import { Button, EditorPage, Field, Input, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import {
  POLL_CHOICE_TITLE_MAX,
  POLL_DURATION_MAX,
  POLL_DURATION_MIN,
  POLL_MAX_CHOICES,
  POLL_MIN_CHOICES,
  POLL_TITLE_MAX,
  type StartPollSettings,
} from "platforms-protocol";

const BLANK_CHOICES = Array.from({ length: POLL_MIN_CHOICES }, () => "");

export function StartPollEditor() {
  const { values, set, update } = useActionSettings<Required<StartPollSettings>>({
    title: "",
    choices: BLANK_CHOICES,
    duration: "60",
  });

  const choices = values.choices.length >= POLL_MIN_CHOICES ? values.choices : BLANK_CHOICES;

  const updateChoice = (index: number, value: string) => {
    update({ choices: choices.map((choice, i) => (i === index ? value : choice)) });
  };

  const addChoice = () => {
    if (choices.length < POLL_MAX_CHOICES) {
      update({ choices: [...choices, ""] });
    }
  };

  const removeChoice = (index: number) => {
    if (choices.length > POLL_MIN_CHOICES) {
      update({ choices: choices.filter((_, i) => i !== index) });
    }
  };

  return (
    <EditorPage>
      <TemplateField
        label="Title"
        value={values.title}
        onChange={set("title")}
        placeholder="Who wins the next game?"
        hint={`Shown to viewers on Twitch. Up to ${POLL_TITLE_MAX} characters.`}
      />

      <Field
        label="Choices"
        hint={`Twitch allows between ${POLL_MIN_CHOICES} and ${POLL_MAX_CHOICES} choices.`}
      >
        <div className="flex flex-col gap-2">
          {choices.map((choice, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={choice}
                maxLength={POLL_CHOICE_TITLE_MAX}
                onChange={(event) => updateChoice(index, event.target.value)}
                placeholder={`Choice ${index + 1}`}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={choices.length <= POLL_MIN_CHOICES}
                onClick={() => removeChoice(index)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={choices.length >= POLL_MAX_CHOICES}
            onClick={addChoice}
          >
            Add a choice
          </Button>
        </div>
      </Field>

      <TemplateField
        label="Duration, seconds"
        value={values.duration}
        onChange={set("duration")}
        placeholder="60"
        hint={`Between ${POLL_DURATION_MIN} and ${POLL_DURATION_MAX} seconds.`}
      />
    </EditorPage>
  );
}
