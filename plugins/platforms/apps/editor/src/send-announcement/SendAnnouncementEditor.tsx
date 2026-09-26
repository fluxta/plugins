import { EditorPage, SelectField, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import {
  ANNOUNCEMENT_COLORS,
  ANNOUNCEMENT_COLOR_LABELS,
  ANNOUNCEMENT_MESSAGE_MAX,
  type AnnouncementColor,
  type SendAnnouncementSettings,
} from "platforms-protocol";

const COLOR_OPTIONS = ANNOUNCEMENT_COLORS.map((color) => ({
  value: color,
  label: ANNOUNCEMENT_COLOR_LABELS[color],
}));

export function SendAnnouncementEditor() {
  const { values, set } = useActionSettings<Required<SendAnnouncementSettings>>({
    message: "",
    color: "primary",
  });

  return (
    <EditorPage>
      <TemplateField
        label="Message"
        value={values.message}
        onChange={set("message")}
        placeholder="What to announce"
        multiline
        hint={`Highlighted in chat, unlike a plain Send Chat Message. Twitch's cap is ${ANNOUNCEMENT_MESSAGE_MAX} characters.`}
      />

      <SelectField
        label="Colour"
        value={values.color}
        onChange={(value) => set("color")(value as AnnouncementColor)}
        options={COLOR_OPTIONS}
      />
    </EditorPage>
  );
}
