import {
  Alert,
  Button,
  ListRow,
  PluginEditorLayout,
  Section,
  StatusBadge,
} from "@fluxta/sdk/ui";
import { useStatus } from "./use-status";

export function PluginEditor() {
  const { data: status, loading, refresh } = useStatus();
  return (
    <PluginEditorLayout
      title="Wave Link"
      sections={[
        {
          id: "connection",
          label: "Connection",
          content: (
            <Section
              title="Connection"
              description="Controls Wave Link 3 on this computer. Reconnects automatically when Wave Link starts."
            >
              <ListRow
                title="Wave Link"
                description={
                  status?.status === "error"
                    ? undefined
                    : (status?.message ?? "Waiting for the plugin…")
                }
                badges={
                  <StatusBadge
                    tone={
                      status?.status === "connected"
                        ? "ok"
                        : status?.status === "error"
                          ? "error"
                          : "pending"
                    }
                  >
                    {status?.status === "connected"
                      ? "Connected"
                      : status?.status === "error"
                        ? "Unavailable"
                        : "Connecting…"}
                  </StatusBadge>
                }
                actions={
                  <Button variant="outline" onClick={refresh}>
                    {loading ? "Waiting…" : "Refresh"}
                  </Button>
                }
              />
              {status?.status === "error" ? (
                <Alert title="Wave Link unavailable" variant="destructive">
                  {status.message}
                </Alert>
              ) : null}
              {status?.lastError ? (
                <Alert title="Last Action failed" variant="destructive">
                  {status.lastError}
                </Alert>
              ) : null}
            </Section>
          ),
        },
      ]}
    />
  );
}
