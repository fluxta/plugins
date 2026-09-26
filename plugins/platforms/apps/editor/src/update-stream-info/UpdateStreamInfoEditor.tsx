import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import {
  CHANNEL_TAG_MAX,
  CHANNEL_TAGS_MAX,
  type UpdateStreamInfoSettings,
} from "platforms-protocol";

export function UpdateStreamInfoEditor() {
  const { values, set } = useActionSettings<Required<UpdateStreamInfoSettings>>({
    title: "",
    category: "",
    tags: "",
  });

  return (
    <EditorPage>
      <TemplateField
        label="Title"
        value={values.title}
        onChange={set("title")}
        placeholder="Leave empty to keep the current title"
        hint="Shown to viewers on Twitch."
      />

      <TemplateField
        label="Category"
        value={values.category}
        onChange={set("category")}
        placeholder="Leave empty to keep the current category"
        hint="The category's exact name on Twitch, such as Just Chatting."
      />

      <TemplateField
        label="Tags"
        value={values.tags}
        onChange={set("tags")}
        placeholder="Leave empty to keep the current tags"
        hint={`Comma-separated. Twitch allows at most ${CHANNEL_TAGS_MAX}, each up to ${CHANNEL_TAG_MAX} characters.`}
      />
    </EditorPage>
  );
}
