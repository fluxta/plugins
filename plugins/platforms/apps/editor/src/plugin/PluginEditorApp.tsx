import { useState } from "react";

import { AccountsCard } from "./accounts/AccountsCard";
import { CommandsCard } from "./commands/CommandsCard";
import { RewardsCard } from "./rewards/RewardsCard";
import { Sidebar, type Section } from "./Sidebar";
import { usePluginStatus, type Connection } from "./usePluginStatus";

export function PluginEditorApp() {
  const { connection, status, refusal, sidecarSilent, send } =
    usePluginStatus();
  const [section, setSection] = useState<Section>("account");

  if (!status) {
    return (
      <main className="h-full p-4 text-foreground">
        <SidecarHint connection={connection} sidecarSilent={sidecarSilent} />
      </main>
    );
  }

  return (
    <div className="flex h-full text-foreground bg-background">
      <Sidebar
        active={section}
        onSelect={setSection}
        accounts={status.accounts}
        events={status.events}
        commandCount={status.commands.length}
        rewardCount={
          status.rewards.status === "ready" ? status.rewards.rewards.length : 0
        }
        rewardsNeedAttention={!!refusal}
        version={status.version}
      />
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {section === "account" ? (
          <AccountsCard
            accounts={status.accounts}
            events={status.events}
            send={send}
          />
        ) : section === "commands" ? (
          <CommandsCard commands={status.commands} send={send} />
        ) : (
          <RewardsCard rewards={status.rewards} refusal={refusal} send={send} />
        )}
      </main>
    </div>
  );
}

function SidecarHint(props: {
  connection: Connection;
  sidecarSilent: boolean;
}) {
  if (props.connection === "failed") {
    return (
      <p className="text-sm text-muted-foreground">
        This editor lost its connection to Fluxta. Reopen the settings page.
      </p>
    );
  }

  if (props.sidecarSilent) {
    return (
      <p className="text-sm text-muted-foreground">
        The plugin process is not answering. Fluxta does not restart a crashed
        process — start the plugin again from the settings list, and check its
        log if it keeps failing.
      </p>
    );
  }

  return null;
}
