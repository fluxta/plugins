import { ListRow, StatusBadge } from "@fluxta/sdk/ui";
import type { EventSubState } from "platforms-protocol";

export function EventSubStatus({ state }: { state: EventSubState }) {
  return (
    <ListRow
      title="Twitch events"
      badges={<StateBadge state={state} />}
      description={<Detail state={state} />}
    />
  );
}

function StateBadge({ state }: { state: EventSubState }) {
  switch (state.status) {
    case "listening":
      return <StatusBadge tone="ok">Listening</StatusBadge>;
    case "connecting":
      return <StatusBadge tone="pending">Connecting</StatusBadge>;
    case "error":
      return <StatusBadge tone="error">Failed</StatusBadge>;
    case "idle":
      return null;
  }
}

function Detail({ state }: { state: EventSubState }) {
  switch (state.status) {
    case "listening":
      return <>Chat and channel point redemptions in #{state.channel} can trigger Events.</>;
    case "connecting":
      return <>Subscribing to the channel…</>;
    case "error":
      return <span className="text-destructive">{state.message}</span>;
    case "idle":
      return <>Connect the broadcaster account to start receiving events.</>;
  }
}
