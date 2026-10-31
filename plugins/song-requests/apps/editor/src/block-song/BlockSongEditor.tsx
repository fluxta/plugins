import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { BlockSongSettings } from "song-requests-protocol";

export function BlockSongEditor() {
  const { values, set } = useActionSettings<BlockSongSettings>({
    target: "current",
    kind: "track",
    songId: "",
  });
  const target = values.target ?? "current";
  return (
    <EditorPage>
      <SelectField
        label="Song"
        value={target}
        onChange={(value) =>
          set("target")(value as BlockSongSettings["target"])
        }
        options={[
          { value: "current", label: "Current Song" },
          { value: "songId", label: "Song by ID" },
        ]}
      />
      {target === "songId" && (
        <TemplateField
          label="Song ID"
          value={values.songId ?? ""}
          onChange={set("songId")}
          hint="The Current Song or a waiting Song."
        />
      )}
      <SelectField
        label="Block"
        value={values.kind ?? "track"}
        onChange={(value) => set("kind")(value as BlockSongSettings["kind"])}
        options={[
          { value: "track", label: "This track" },
          { value: "channel", label: "This channel" },
        ]}
        hint="Adds to the Blocklist, skips a covered Current Song and drops covered waiting Songs with blocked. Later steps can read Title."
      />
    </EditorPage>
  );
}
