import {
  PluginEditorLayout,
  type PluginEditorSection,
  type StatusTone,
} from "@fluxta/sdk/ui";
import type { AccountsState, EventSubState } from "platforms-protocol";

import { AccountsCard } from "./accounts/AccountsCard";
import { CommandsCard } from "./commands/CommandsCard";
import { RewardsCard } from "./rewards/RewardsCard";
import { usePluginStatus } from "./usePluginStatus";

export function PluginEditorApp() {
  const { status, refusal, sidecarSilent, send } = usePluginStatus();

  if (!status) {
    return (
      <main className="h-full p-4 text-foreground">
        <SidecarHint sidecarSilent={sidecarSilent} />
      </main>
    );
  }

  const sections: PluginEditorSection[] = [
    {
      id: "account",
      label: "Account",
      tone: accountsTone(status.accounts, status.events),
      content: (
        <AccountsCard
          accounts={status.accounts}
          events={status.events}
          send={send}
        />
      ),
    },
    {
      id: "commands",
      label: "Commands",
      count: status.commands.length,
      content: <CommandsCard commands={status.commands} send={send} />,
    },
    {
      id: "rewards",
      label: "Rewards",
      tone: refusal ? "error" : undefined,
      count:
        status.rewards.status === "ready" ? status.rewards.rewards.length : 0,
      content: (
        <RewardsCard rewards={status.rewards} refusal={refusal} send={send} />
      ),
    },
  ];

  return (
    <PluginEditorLayout
      title="Platforms"
      version={status.version}
      sections={sections}
    />
  );
}

function SidecarHint(props: { sidecarSilent: boolean }) {
  if (!props.sidecarSilent) {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground">
      The plugin process is not answering. Fluxta does not restart a crashed
      process — start the plugin again from the settings list, and check its
      log if it keeps failing.
    </p>
  );
}

function accountsTone(
  accounts: AccountsState,
  events: EventSubState,
): StatusTone {
  if (
    accounts.broadcaster.status === "error" ||
    accounts.bot.status === "error" ||
    events.status === "error"
  ) {
    return "error";
  }

  if (
    accounts.broadcaster.status === "authorizing" ||
    accounts.bot.status === "authorizing" ||
    accounts.broadcaster.status === "reauthorization-required" ||
    accounts.bot.status === "reauthorization-required"
  ) {
    return "pending";
  }

  if (accounts.broadcaster.status === "connected") {
    return "ok";
  }

  return "idle";
}
