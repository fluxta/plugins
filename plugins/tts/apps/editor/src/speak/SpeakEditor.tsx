import {
  Button,
  EditorPage,
  Field,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { PluginStatus, Position, SpeakSettings } from "tts-protocol";

import { ListenField } from "../shared/ListenField";
import {
  missingPreset,
  presetLabel,
  presetOptions,
  presetRef,
} from "../shared/presets";
import { useStatus } from "../shared/useStatus";
import { DEFAULT, followed } from "./default-option";
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
        hint="Read aloud with this Speak’s Preset. The step does not wait for it to be spoken; text that comes out empty is not spoken."
      />

      <PresetField values={values} update={update} status={status} />

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

/**
 * What this Speak speaks with: Default — the Default Preset, or this
 * computer's voice until there is one — or a Preset of its own, with Listen
 * under it, which speaks it with this Speak's Overrides, unsaved.
 */
function PresetField({
  values,
  update,
  status,
}: {
  values: SpeakSettings;
  update: (changes: Partial<SpeakSettings>) => void;
  status: PluginStatus | undefined;
}) {
  const presets = status?.presets ?? [];
  const chosen = status?.defaults.preset;

  return (
    <ListenField
      label="Preset"
      options={[
        {
          value: DEFAULT,
          label: followed(
            status &&
              (chosen ? presetLabel(chosen, presets) : "this computer’s voice"),
          ),
        },
        ...presetOptions(presets),
      ]}
      value={values.preset?.id ?? DEFAULT}
      // `undefined` drops the key from the saved settings: back to Default.
      onChange={(id) => update({ preset: presetRef(id, presets) })}
      missingLabel={missingPreset(values.preset)}
      loading={!status}
      hint="Presets are made in the plugin’s settings. Listen waits for the Phrase being spoken, then goes ahead of the rest."
      // As the form stands, unsaved; the sidecar lays it over the Defaults.
      listen={{
        preset: values.preset,
        volume: values.volume,
        device: values.device,
      }}
    />
  );
}
