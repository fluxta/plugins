import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { RequestSongSettings } from "song-requests-protocol";

import { OverridesSection } from "./OverridesSection";

export function RequestSongEditor() {
  const { values, set } = useActionSettings<RequestSongSettings>({
    request: "",
    requesterPlatform: "",
    requesterId: "",
    requesterName: "",
    reference: "",
    position: "inTurn",
  });

  return (
    <EditorPage>
      <TemplateField
        label="Request"
        value={values.request ?? ""}
        onChange={set("request")}
        placeholder="https://youtu.be/…"
        hint="A YouTube link — usually what a viewer typed after the command. Later steps can read whether it was accepted, the Song's title and its place in the Song Queue, and — once they are known — how long it is and when it should start."
      />
      <TemplateField
        label="Requester Platform"
        value={values.requesterPlatform ?? ""}
        onChange={set("requesterPlatform")}
        hint="Optional. The streaming Platform the Request came from, such as twitch. Together with the Requester ID, it identifies who asked."
      />
      <TemplateField
        label="Requester ID"
        value={values.requesterId ?? ""}
        onChange={set("requesterId")}
        hint="Optional. The Requester's id on that Platform."
      />
      <TemplateField
        label="Requester Name"
        value={values.requesterName ?? ""}
        onChange={set("requesterName")}
        hint="Optional. The name shown for the Requester. Leave all three Requester fields empty for the streamer's own Request."
      />
      <TemplateField
        label="Reference"
        value={values.reference ?? ""}
        onChange={set("reference")}
        hint="Optional. An opaque label, such as a Redemption's or donation's id. Every Event about the Song hands it back unchanged."
      />
      <SelectField
        label="Position"
        value={values.position ?? "inTurn"}
        onChange={(value) =>
          set("position")(value as RequestSongSettings["position"])
        }
        options={[
          { value: "inTurn", label: "In turn" },
          { value: "next", label: "Next" },
        ]}
        hint="In turn adds to the end. Next adds to the beginning, before every waiting Song. The Current Song plays on."
      />
      <OverridesSection
        values={values.overrides ?? {}}
        onChange={(overrides) => set("overrides")(overrides)}
      />
    </EditorPage>
  );
}
