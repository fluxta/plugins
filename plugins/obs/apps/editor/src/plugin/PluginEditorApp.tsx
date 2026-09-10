import { ConnectionsCard } from "./ConnectionsCard";
import { usePluginStatus, type EditorLink } from "./usePluginStatus";

export function PluginEditorApp() {
  const { link, status, refusal, sidecarSilent, send } = usePluginStatus();

  if (!status) {
    return (
      <main className="h-full p-4 text-foreground">
        <SidecarHint link={link} sidecarSilent={sidecarSilent} />
      </main>
    );
  }

  return (
    <div className="h-full text-foreground bg-background">
      <main className="min-w-0 p-6">
        {refusal ? <p className="mb-4 text-sm text-destructive">{refusal}</p> : null}
        <ConnectionsCard connections={status.connections} send={send} />
        <p className="mt-6 text-xs text-muted-foreground">OBS {status.version}</p>
      </main>
    </div>
  );
}

function SidecarHint(props: { link: EditorLink; sidecarSilent: boolean }) {
  if (props.link === "failed") {
    return (
      <p className="text-sm text-muted-foreground">
        This editor lost its connection to Fluxta. Reopen the settings page.
      </p>
    );
  }

  if (props.sidecarSilent) {
    return (
      <p className="text-sm text-muted-foreground">
        The plugin process is not answering. Fluxta does not restart a crashed process — start
        the plugin again from the settings list, and check its log if it keeps failing.
      </p>
    );
  }

  return null;
}
