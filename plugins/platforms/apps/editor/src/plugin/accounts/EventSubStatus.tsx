import { Badge } from "@fluxta/sdk/ui";
import type { EventSubState } from "platforms-protocol";

export function EventSubStatus({ state }: { state: EventSubState }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">Twitch events</span>
          <StateBadge state={state} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <Detail state={state} />
        </p>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: EventSubState }) {
  switch (state.status) {
    case "listening":
      return <Badge variant="secondary">Listening</Badge>;
    case "connecting":
      return <Badge variant="outline">Connecting</Badge>;
    case "error":
      return <Badge variant="destructive">Failed</Badge>;
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
