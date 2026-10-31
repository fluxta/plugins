import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { RemoveSongSettings } from "song-requests-protocol";

import { RequesterFields } from "../queue/RequesterFields";

export function RemoveSongEditor() {
  const { values, set } = useActionSettings<RemoveSongSettings>({
    target: "requesterLatest",
    requesterPlatform: "",
    requesterId: "",
    position: "1",
    songId: "",
  });
  const target = values.target ?? "requesterLatest";
  return (
    <EditorPage>
      <SelectField
        label="Remove"
        value={target}
        onChange={(value) =>
          set("target")(value as RemoveSongSettings["target"])
        }
        options={[
          {
            value: "requesterLatest",
            label: "Requester's latest waiting Song",
          },
          {
            value: "requesterAll",
            label: "All of a Requester's waiting Songs",
          },
          { value: "position", label: "Song at a position" },
          { value: "songId", label: "Song by ID" },
        ]}
        hint="Removes waiting Songs and fires Song Dropped with removed for each. Later steps can read Removed and Title."
      />
      {(target === "requesterLatest" || target === "requesterAll") && (
        <RequesterFields
          platform={values.requesterPlatform ?? ""}
          id={values.requesterId ?? ""}
          onPlatformChange={set("requesterPlatform")}
          onIdChange={set("requesterId")}
        />
      )}
      {target === "position" && (
        <TemplateField
          label="Position"
          value={values.position ?? "1"}
          onChange={set("position")}
          hint="1 is the first waiting Song. The Current Song cannot be removed."
        />
      )}
      {target === "songId" && (
        <TemplateField
          label="Song ID"
          value={values.songId ?? ""}
          onChange={set("songId")}
        />
      )}
    </EditorPage>
  );
}
