import { EditorPage, PluginEditorLayout } from "@fluxta/sdk/ui";

import { ConnectionsCard } from "./ConnectionsCard";
import { usePluginStatus } from "./usePluginStatus";

export function PluginEditorApp() {
  const { status, refusal, sidecarSilent, send } = usePluginStatus();

  if (!status) {
    return (
      <EditorPage>
        {sidecarSilent ? (
          <p className="text-muted-foreground text-xs/relaxed">
            The plugin process is not answering. Fluxta does not restart a crashed process — start
            the plugin again from the settings list, and check its log if it keeps failing.
          </p>
        ) : null}
      </EditorPage>
    );
  }

  return (
    <PluginEditorLayout
      sections={[
        {
          id: "connections",
          label: "Connections",
          content: (
            <>
              {refusal ? (
                <p role="alert" className="text-destructive mb-4 text-xs/relaxed">
                  {refusal}
                </p>
              ) : null}
              <ConnectionsCard connections={status.connections} send={send} />
            </>
          ),
        },
      ]}
    />
  );
}
