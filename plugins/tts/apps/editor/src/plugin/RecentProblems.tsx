import { Badge, EmptyState, ListRow, Section } from "@fluxta/sdk/ui";
import { RECENT_PROBLEMS_KEPT, type RecentProblem } from "tts-protocol";

/**
 * The Phrases dropped since the plugin started, newest first: the run that
 * spoke one returned long ago, so this is where the streamer learns of it.
 */
export function RecentProblems({
  problems,
}: {
  problems: readonly RecentProblem[];
}) {
  return (
    <Section
      title="Recent problems"
      description={`Phrases that could not be spoken since the plugin started, newest first — the last ${RECENT_PROBLEMS_KEPT}. Each is in the plugin’s log too. A restart of the plugin clears the list.`}
    >
      {problems.length === 0 ? (
        <EmptyState>
          No Phrase has been dropped since the plugin started.
        </EmptyState>
      ) : (
        problems.map(({ id, at, kind, reason, text }) => (
          <ListRow
            key={id}
            title={reason}
            badges={<Badge variant="outline">{kind}</Badge>}
            description={text ? `${when(at)} · “${text}”` : when(at)}
          />
        ))
      )}
    </Section>
  );
}

/** The time, with the date when it was not today. */
function when(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString()} ${time}`;
}
