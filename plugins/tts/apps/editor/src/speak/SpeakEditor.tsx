import {
  Button,
  EditorPage,
  Field,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { Position, SpeakSettings } from "tts-protocol";

import { useStatus } from "../shared/useStatus";
import { OverrideDefaults } from "./OverrideDefaults";

const POSITIONS: { value: Position; label: string; hint: string }[] = [
  {
    value: "in-turn",
    label: "In turn",
    hint: "At the end of the queue, after every Phrase already waiting.",
  },
  {
    value: "next",
    label: "Next",
    hint: "Ahead of every In turn Phrase, behind other Next ones. The Phrase being spoken is heard to the end.",
  },
  {
    value: "now",
    label: "Now",
    hint: "Cuts off the Phrase being spoken, which is not repeated, and is spoken at once. The queue goes on after it.",
  },
];

export function SpeakEditor() {
  const { values, set, update } = useActionSettings<SpeakSettings>({
    text: "",
    position: "in-turn",
    tags: [],
  });
  const status = useStatus();

  const position =
    POSITIONS.find(({ value }) => value === values.position) ?? POSITIONS[0];
  const tags = values.tags ?? [];

  return (
    <EditorPage>
      <TemplateField
        label="Text"
        multiline
        value={values.text ?? ""}
        onChange={set("text")}
        placeholder="A chat message, for example"
        hint="Read aloud in this computer’s voice. The step does not wait for it to be spoken; text that comes out empty is not spoken."
      />

      <SelectField
        label="Position"
        options={POSITIONS}
        value={position.value}
        onChange={(value) => update({ position: value as Position })}
        hint={position.hint}
      />

      <Field
        label="Tags"
        hint="What Stop Speech can find this Phrase by — a viewer’s user id, a chat message’s id. Compared exactly; a Tag that comes out empty is left out."
      >
        <div className="tags">
          {tags.map((tag, index) => (
            <div key={index} className="tag">
              <TemplateField
                value={tag}
                onChange={(value) =>
                  update({
                    tags: tags.map((other, i) => (i === index ? value : other)),
                  })
                }
                placeholder={`Tag ${index + 1}`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update({ tags: tags.filter((_, i) => i !== index) })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ tags: [...tags, ""] })}
          >
            + Add Tag
          </Button>
        </div>
      </Field>

      <OverrideDefaults values={values} update={update} status={status} />
    </EditorPage>
  );
}
