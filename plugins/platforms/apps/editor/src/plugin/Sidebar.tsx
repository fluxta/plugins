import type { AccountsState, EventSubState } from "platforms-protocol";
import type { ReactNode } from "react";

export type Section = "account" | "commands" | "rewards";

type Props = {
  active: Section;
  onSelect: (section: Section) => void;
  accounts: AccountsState;
  events: EventSubState;
  commandCount: number;
  rewardCount: number;
  /** A reward write Twitch just refused, still unread on the Rewards section. */
  rewardsNeedAttention: boolean;
  version: string;
};

export function Sidebar({
  active,
  onSelect,
  accounts,
  events,
  commandCount,
  rewardCount,
  rewardsNeedAttention,
  version,
}: Props) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-muted/30 p-3">
      <div className="px-3 py-2 text-base font-medium">Platforms</div>

      <NavItem
        active={active === "account"}
        label="Account"
        onClick={() => onSelect("account")}
        indicator={<StatusDot color={accountsIndicatorColor(accounts, events)} />}
      />
      <NavItem
        active={active === "commands"}
        label="Commands"
        onClick={() => onSelect("commands")}
        indicator={<Count value={commandCount} />}
      />
      <NavItem
        active={active === "rewards"}
        label="Rewards"
        onClick={() => onSelect("rewards")}
        indicator={
          rewardsNeedAttention ? <StatusDot color="bg-red-500" /> : <Count value={rewardCount} />
        }
      />

      <p className="mt-auto px-3 py-2 text-xs text-muted-foreground">Platforms {version}</p>
    </aside>
  );
}

function NavItem({
  active,
  label,
  indicator,
  onClick,
}: {
  active: boolean;
  label: string;
  indicator?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
      {indicator}
    </button>
  );
}

function Count({ value }: { value: number }) {
  if (value === 0) {
    return null;
  }

  return <span className="ml-auto text-xs text-muted-foreground">{value}</span>;
}

function StatusDot({ color }: { color: string }) {
  return <span className={`ml-auto size-2 shrink-0 rounded-full ${color}`} />;
}

function accountsIndicatorColor(accounts: AccountsState, events: EventSubState): string {
  if (
    accounts.broadcaster.status === "error" ||
    accounts.bot.status === "error" ||
    events.status === "error"
  ) {
    return "bg-red-500";
  }

  if (
    accounts.broadcaster.status === "authorizing" ||
    accounts.bot.status === "authorizing" ||
    accounts.broadcaster.status === "reauthorization-required" ||
    accounts.bot.status === "reauthorization-required"
  ) {
    return "bg-yellow-500";
  }

  if (accounts.broadcaster.status === "connected") {
    return "bg-green-500";
  }

  return "bg-gray-400";
}
