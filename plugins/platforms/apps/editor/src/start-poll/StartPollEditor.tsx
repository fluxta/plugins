import { ActionEditor } from "@fluxta/sdk/api";
import { Button, Input, Label, TemplateField } from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import {
  POLL_CHOICE_TITLE_MAX,
  POLL_DURATION_MAX,
  POLL_DURATION_MIN,
  POLL_MAX_CHOICES,
  POLL_MIN_CHOICES,
  POLL_TITLE_MAX,
  type StartPollSettings,
} from "platforms-protocol";

const editor = new ActionEditor();
const connected = editor.connect();

const BLANK_CHOICES = Array.from({ length: POLL_MIN_CHOICES }, () => "");

export function StartPollEditor() {
  const [title, setTitle] = useState("");
  const [choices, setChoices] = useState<string[]>(BLANK_CHOICES);
  const [duration, setDuration] = useState("60");

  // The save handler is re-registered whenever the form changes, since only
  // one is active at a time and it must return the latest values.
  const latest = useRef<StartPollSettings>({});
  latest.current = { title, choices, duration };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as StartPollSettings | null;

      if (saved) {
        setTitle(saved.title ?? "");
        setChoices(
          saved.choices && saved.choices.length >= POLL_MIN_CHOICES
            ? saved.choices
            : BLANK_CHOICES,
        );
        setDuration(saved.duration ?? "60");
      }
    });

    return off;
  }, []);

  const updateChoice = (index: number, value: string) => {
    setChoices((current) => current.map((choice, i) => (i === index ? value : choice)));
  };

  const addChoice = () => {
    setChoices((current) => (current.length >= POLL_MAX_CHOICES ? current : [...current, ""]));
  };

  const removeChoice = (index: number) => {
    setChoices((current) =>
      current.length <= POLL_MIN_CHOICES ? current : current.filter((_, i) => i !== index),
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
        placeholder="Who wins the next game?"
        hint={`Shown to viewers on Twitch. Up to ${POLL_TITLE_MAX} characters.`}
      />

      <div className="space-y-2">
        <Label>Choices</Label>
        <div className="space-y-2">
          {choices.map((choice, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
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
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={choices.length >= POLL_MAX_CHOICES}
          onClick={addChoice}
        >
          Add a choice
        </Button>
        <p className="text-xs text-muted-foreground">
          Twitch allows between {POLL_MIN_CHOICES} and {POLL_MAX_CHOICES} choices.
        </p>
      </div>

      <TemplateField
        id="duration"
        label="Duration, seconds"
        value={duration}
        onChange={setDuration}
        editor={editor}
        placeholder="60"
        hint={`Between ${POLL_DURATION_MIN} and ${POLL_DURATION_MAX} seconds.`}
      />
    </main>
  );
}
