import { EditorPage, SelectField, useActionSettings } from "@fluxta/sdk/ui";
import type { PlaybackSettings } from "song-requests-protocol";

export function PlaybackEditor() {
  const { values, set } = useActionSettings<PlaybackSettings>({
    mode: "toggle",
  });
  return (
    <EditorPage>
      <SelectField
        label="Playback"
        value={values.mode ?? "toggle"}
        onChange={(value) => set("mode")(value as PlaybackSettings["mode"])}
        options={[
          { value: "pause", label: "Pause" },
          { value: "resume", label: "Resume" },
          { value: "toggle", label: "Toggle" },
        ]}
        hint="A pause stays in effect after a restart or when the Player Page reconnects. Later steps can read Is Paused."
      />
    </EditorPage>
  );
}
