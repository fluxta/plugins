import { Badge, Button } from "@fluxta/sdk/ui";
import type { AccountRole, AccountState, EditorMessage } from "platforms-protocol";

type Props = {
  role: AccountRole;
  title: string;
  description: string;
  state: AccountState;
  send: (message: EditorMessage) => void;
};

export function AccountRow({ role, title, description, state, send }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-muted/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{title}</span>
            <StateBadge state={state} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Action role={role} state={state} send={send} />
      </div>

      <Detail state={state} />
    </div>
  );
}

function StateBadge({ state }: { state: AccountState }) {
  switch (state.status) {
    case "connected":
      return <Badge variant="secondary">Connected</Badge>;
    case "authorizing":
      return <Badge variant="outline">Waiting for Twitch</Badge>;
    case "reauthorization-required":
      return <Badge variant="outline">Signed out</Badge>;
    case "error":
      return <Badge variant="destructive">Failed</Badge>;
    case "disconnected":
      return null;
  }
}

function Action({
  role,
  state,
  send,
}: {
  role: AccountRole;
  state: AccountState;
  send: (message: EditorMessage) => void;
}) {
  if (state.status === "authorizing") {
    return (
      <Button variant="outline" onClick={() => send({ event: "cancel-authorization", role })}>
        Cancel
      </Button>
    );
  }

  if (state.status === "connected") {
    return (
      <Button variant="outline" onClick={() => send({ event: "disconnect-account", role })}>
        Disconnect
      </Button>
    );
  }

  return (
    <Button onClick={() => send({ event: "connect-account", role })}>
      {state.status === "reauthorization-required" ? "Sign in again" : "Sign in"}
    </Button>
  );
}

function Detail({ state }: { state: AccountState }) {
  switch (state.status) {
    case "connected":
      return (
        <p className="text-sm">
          {state.displayName}{" "}
          <span className="text-muted-foreground">@{state.login}</span>
        </p>
      );

    case "reauthorization-required":
      return (
        <p className="text-sm text-muted-foreground">
          Twitch signed <span className="text-foreground">@{state.login}</span> out. This happens
          after 30 days without use — sign in again to restore it.
        </p>
      );

    case "authorizing":
      return (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Confirm the sign-in in your browser. If it did not open, visit{" "}
            <span className="text-foreground">{state.verificationUri}</span>
          </p>
          <p>
            and enter the code <span className="font-mono text-foreground">{state.userCode}</span>.
          </p>
        </div>
      );

    case "error":
      return <p className="text-sm text-destructive">{state.message}</p>;

    case "disconnected":
      return null;
  }
}
