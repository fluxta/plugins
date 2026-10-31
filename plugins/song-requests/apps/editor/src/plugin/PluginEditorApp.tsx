import { EditorPage, PluginEditorLayout } from "@fluxta/sdk/ui";

import { HistorySection } from "./HistorySection";
import { NowSection } from "./NowSection";
import { PlayerPageSection } from "./PlayerPageSection";
import { QueueSection } from "./QueueSection";
import { RulesSection } from "./RulesSection";
import { SettingsSection } from "./SettingsSection";
import { usePluginStatus } from "./usePluginStatus";
import { useQueueAgain } from "./useQueueAgain";
import { useSongRequest } from "./useSongRequest";

export function PluginEditorApp() {
  const { status, sidecarSilent } = usePluginStatus();
  const request = useSongRequest();
  const again = useQueueAgain();

  if (!status) {
    return (
      <EditorPage>
        {sidecarSilent ? (
          <p className="text-muted-foreground text-xs/relaxed">
            The plugin process is not answering. Fluxta does not restart a
            crashed process — start the plugin again from the settings list, and
            check its log if it keeps failing.
          </p>
        ) : null}
      </EditorPage>
    );
  }

  return (
    <PluginEditorLayout
      title="Song Requests"
      sections={[
        ...(status.stateFile.recovered
          ? [
              {
                id: "state-file",
                label: "Song Queue",
                tone: "error" as const,
                content: (
                  <p className="text-muted-foreground text-xs/relaxed">
                    The saved Song Queue could not be read — the file was
                    damaged. It was moved aside, next to where it lived, and the
                    plugin started with an empty Song Queue.
                  </p>
                ),
              },
            ]
          : []),
        {
          id: "now",
          label: "Now",
          tone:
            status.playback.current || status.playback.isPaused
              ? status.playback.isPlaying
                ? ("ok" as const)
                : ("idle" as const)
              : undefined,
          content: <NowSection playback={status.playback} />,
        },
        {
          id: "player",
          label: "Player",
          tone: status.playerConnected ? "ok" : "idle",
          content: <PlayerPageSection status={status} />,
        },
        {
          id: "queue",
          label: "Song Queue",
          count: status.playback.waiting.length,
          content: (
            <QueueSection playback={status.playback} request={request} />
          ),
        },
        {
          id: "history",
          label: "History",
          count: status.history.length,
          content: <HistorySection history={status.history} again={again} />,
        },
        {
          id: "rules",
          label: "Rules",
          content: <RulesSection status={status} />,
        },
        {
          id: "settings",
          label: "Settings",
          tone: status.apiKey.state === "refused" ? "error" : undefined,
          content: <SettingsSection status={status} />,
        },
      ]}
    />
  );
}
