import type {
  AccountsState,
  EditorMessage,
  EventSubState,
} from "platforms-protocol";

import { AccountRow } from "./AccountRow";
import { EventSubStatus } from "./EventSubStatus";

type Props = {
  accounts: AccountsState;
  events: EventSubState;
  send: (message: EditorMessage) => void;
};

export function AccountsCard({ accounts, events, send }: Props) {
  return (
    <div>
      <div className="bg-background/30 text-base font-semibold">
        Twitch accounts
      </div>
      <p className="text-muted-foreground mt-2 mb-5 text-xs">
        The broadcaster account is required. Connect a bot account as well to
        have messages appear under its name instead.
      </p>
      <div className="space-y-3">
        <AccountRow
          role="broadcaster"
          title="Broadcaster"
          description="Reads chat and drives rewards, polls and predictions."
          state={accounts.broadcaster}
          send={send}
        />
        <AccountRow
          role="bot"
          title="Bot"
          description="Optional. Sends chat messages under its own name."
          state={accounts.bot}
          send={send}
        />
        <EventSubStatus state={events} />
      </div>
    </div>
  );
}
