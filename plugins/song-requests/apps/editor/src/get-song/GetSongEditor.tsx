import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { GetSongSettings } from "song-requests-protocol";

import { RequesterFields } from "../queue/RequesterFields";

export function GetSongEditor() {
  const { values, set } = useActionSettings<GetSongSettings>({
    target: "current",
    position: "1",
    requesterPlatform: "",
    requesterId: "",
  });
  const target = values.target ?? "current";
  return (
    <EditorPage>
      <SelectField
        label="Get"
        value={target}
        onChange={(value) => set("target")(value as GetSongSettings["target"])}
        options={[
          { value: "current", label: "Current Song" },
          { value: "position", label: "Song at a position" },
          { value: "requesterNext", label: "Requester's next waiting Song" },
        ]}
        hint="Later steps can read the Song's fields, Position and Starts In. The Current Song has position 0. A missing Song produces no values; an unknown duration or Starts In is empty."
      />
      {target === "position" && (
        <TemplateField
          label="Position"
          value={values.position ?? "1"}
          onChange={set("position")}
          hint="1 is the first waiting Song."
        />
      )}
      {target === "requesterNext" && (
        <RequesterFields
          platform={values.requesterPlatform ?? ""}
          id={values.requesterId ?? ""}
          onPlatformChange={set("requesterPlatform")}
          onIdChange={set("requesterId")}
        />
      )}
    </EditorPage>
  );
}
