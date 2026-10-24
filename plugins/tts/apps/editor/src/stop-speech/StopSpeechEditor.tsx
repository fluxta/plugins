import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { StopReach, StopSpeechSettings } from "tts-protocol";

const REACHES: { value: StopReach; label: string; hint: string }[] = [
  {
    value: "current",
    label: "Current Phrase",
    hint: "Cuts off the Phrase being spoken; the queue goes on with the next one.",
  },
  {
    value: "everything",
    label: "Everything",
    hint: "Cuts off the Phrase being spoken and empties the queue, Next Phrases included.",
  },
  {
    value: "tag",
    label: "Tag",
    hint: "Takes every waiting Phrase carrying the Tag out of the queue, and cuts off the one being spoken if it carries it too.",
  },
];

export function StopSpeechEditor() {
  const { values, set, update } = useActionSettings<
    Required<StopSpeechSettings>
  >({ what: "current", tag: "" });

  const reach =
    REACHES.find(({ value }) => value === values.what) ?? REACHES[0];

  return (
    <EditorPage>
      <SelectField
        label="What"
        options={REACHES}
        value={reach.value}
        onChange={(value) => update({ what: value as StopReach })}
        hint={reach.hint}
      />

      {reach.value === "tag" && (
        <TemplateField
          label="Tag"
          value={values.tag}
          onChange={set("tag")}
          placeholder="A viewer’s user id, for example"
          hint="Compared exactly with the Tags of Speak. A Tag that comes out empty stops nothing — never everything."
        />
      )}
    </EditorPage>
  );
}
