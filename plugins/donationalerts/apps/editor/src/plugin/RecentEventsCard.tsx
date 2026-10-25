import { Badge, EmptyState, ListRow, Section } from "@fluxta/sdk/ui";
import type { RecentEvent } from "donationalerts-protocol";

type Props = {
  recent: RecentEvent[];
};

export function RecentEventsCard({ recent }: Props) {
  return (
    <Section
      title="Recent events"
      description="What the plugin fired in this run, newest first — whether or not an Event Filter let it through. Kept in memory only: a restart empties it."
    >
      {recent.length === 0 ? (
        <EmptyState>
          Nothing yet in this run. Donations and goal updates appear here as the
          plugin fires them.
        </EmptyState>
      ) : (
        recent.map((entry, index) => (
          <RecentEventRow key={`${entry.at}-${index}`} entry={entry} />
        ))
      )}
    </Section>
  );
}

function RecentEventRow({ entry }: { entry: RecentEvent }) {
  const time = new Date(entry.at).toLocaleTimeString();

  if (entry.kind === "goal") {
    const { title, raisedAmount, goalAmount, currency, isActive, goalId } =
      entry.fields;

    return (
      <ListRow
        title={`Goal · ${title || "Untitled"}`}
        description={`${raisedAmount} of ${goalAmount} ${currency}`}
        badges={
          <>
            {raisedAmount >= goalAmount ? <Badge>Reached</Badge> : null}
            {isActive ? null : <Badge variant="outline">Closed</Badge>}
          </>
        }
        detail={<Detail>{`Goal Updated · ${time} · goal ${goalId}`}</Detail>}
      />
    );
  }

  const { username, amount, currency, message, messageType, donationId } =
    entry.fields;

  return (
    <ListRow
      title={`${username || "Anonymous"} · ${amount} ${currency}`}
      description={
        message || (messageType === "audio" ? "Audio message" : "No message")
      }
      badges={
        entry.delivery === "test" ? (
          <Badge variant="secondary">Test</Badge>
        ) : entry.delivery === "catch-up" ? (
          <Badge variant="outline">Caught up</Badge>
        ) : null
      }
      detail={
        <Detail>
          {entry.delivery === "test"
            ? `Donation Received · ${time} · test`
            : `Donation Received · ${time} · donation ${donationId}`}
        </Detail>
      }
    />
  );
}

function Detail({ children }: { children: string }) {
  return <p className="text-muted-foreground text-xs/relaxed">{children}</p>;
}
