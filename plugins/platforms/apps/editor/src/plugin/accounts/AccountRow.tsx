import { Button, ListRow, StatusBadge, type StatusTone } from "@fluxta/sdk/ui";
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
    <ListRow
      title={title}
      description={description}
      badges={<StateBadge state={state} />}
      actions={<Action role={role} state={state} send={send} />}
      detail={<Detail state={state} />}
    />
  );
}

const TONE: Record<Exclude<AccountState["status"], "disconnected">, StatusTone> = {
  connected: "ok",
  authorizing: "pending",
  "reauthorization-required": "idle",
  error: "error",
};

const LABEL: Record<Exclude<AccountState["status"], "disconnected">, string> = {
  connected: "Connected",
  authorizing: "Waiting for Twitch",
  "reauthorization-required": "Signed out",
  error: "Failed",
};

function StateBadge({ state }: { state: AccountState }) {
  if (state.status === "disconnected") {
    return null;
  }

  return <StatusBadge tone={TONE[state.status]}>{LABEL[state.status]}</StatusBadge>;
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
        <p className="text-xs/relaxed">
          {state.displayName}{" "}
          <span className="text-muted-foreground">@{state.login}</span>
        </p>
      );

    case "reauthorization-required":
      return (
        <p className="text-muted-foreground text-xs/relaxed">
          Twitch signed <span className="text-foreground">@{state.login}</span> out. This happens
          after 30 days without use — sign in again to restore it.
        </p>
      );

    case "authorizing":
      return (
        <div className="text-muted-foreground space-y-1 text-xs/relaxed">
          <p>
            Confirm the sign-in in your browser. If it did not open, visit{" "}
            <span className="text-foreground">{state.verificationUri}</span>
          </p>
          <p>
            and enter the code <span className="text-foreground font-mono">{state.userCode}</span>.
          </p>
        </div>
      );

    case "error":
      return <p className="text-destructive text-xs/relaxed">{state.message}</p>;

    case "disconnected":
      return null;
  }
}
