import { EditorPage, PluginEditorLayout } from "@fluxta/sdk/ui";

import { AccountCard } from "./AccountCard";
import { RecentEventsCard } from "./RecentEventsCard";
import { TestDonationCard } from "./TestDonationCard";
import { usePluginStatus } from "./usePluginStatus";

export function PluginEditorApp() {
  const { status, sidecarSilent, testSent, send } = usePluginStatus();

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
      sections={[
        {
          id: "account",
          label: "Account",
          content: (
            <AccountCard
              account={status.account}
              realtime={status.realtime}
              send={send}
            />
          ),
        },
        {
          id: "test-donation",
          label: "Test donation",
          content: <TestDonationCard testSent={testSent} send={send} />,
        },
        {
          id: "recent-events",
          label: "Recent events",
          content: <RecentEventsCard recent={status.recent} />,
        },
      ]}
    />
  );
}
