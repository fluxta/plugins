import {
  Button,
  EmptyState,
  ListRow,
  Section,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import type { EditorMessage, HistoryEntry } from "song-requests-protocol";

import { formatSeconds, formatTimestamp } from "./format";
import { refusalText } from "./refusalText";
import type { QueueAgain } from "./useQueueAgain";

/**
 * The History: the Songs that left the air, newest first, with when, the
 * Requester and how each ended (#14). Queue again puts a Song in the Song
 * Queue as the streamer's own Request — checked with the Defaults, so a
 * Refusal's reason shows here — and Block adds its track or its channel to
 * the Blocklist, exactly what Block Song does.
 */
export function HistorySection({
  history,
  again,
}: {
  history: HistoryEntry[];
  again: QueueAgain;
}) {
  const editor = usePluginEditor();

  function send(message: EditorMessage) {
    void editor.sendToPlugin(message);
  }

  return (
    <Section
      title="History"
      description="Songs that left the air, newest first. Queue one again as your own Request — checked with the Defaults — or block its track or its whole channel; blocking drops waiting Songs it covers, as Block Song does."
    >
      {history.length === 0 ? (
        <EmptyState>
          Nothing has played yet. Songs leave the air played to the end, skipped
          or failed, and appear here.
        </EmptyState>
      ) : (
        history.map((entry) => (
          <HistoryRow
            key={entry.id}
            entry={entry}
            answer={again.answers[entry.id]}
            send={send}
            onQueueAgain={() => again.queueAgain(entry.id)}
          />
        ))
      )}
    </Section>
  );
}

function HistoryRow({
  entry,
  answer,
  send,
  onQueueAgain,
}: {
  entry: HistoryEntry;
  answer: QueueAgain["answers"][string] | undefined;
  send: (message: EditorMessage) => void;
  onQueueAgain: () => void;
}) {
  return (
    <div>
      <ListRow
        title={entry.title}
        description={`${entry.channel}${entry.requesterName ? ` — ${entry.requesterName}` : ""} · ${entry.duration === null ? "—" : formatSeconds(entry.duration)} · ${entry.how} · ${formatTimestamp(entry.at)}`}
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={answer?.kind === "pending"}
              onClick={onQueueAgain}
            >
              {answer?.kind === "pending" ? "Queueing…" : "Queue again"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                send({
                  event: "block-history-song",
                  songId: entry.id,
                  kind: "track",
                })
              }
            >
              Block
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                send({
                  event: "block-history-song",
                  songId: entry.id,
                  kind: "channel",
                })
              }
            >
              Block channel
            </Button>
          </div>
        }
      />
      {answer?.kind === "accepted" ? (
        <p className="text-muted-foreground text-xs/relaxed">
          {answer.position === 0
            ? "On air now"
            : `Queued #${answer.position} — starts in ${answer.eta === null ? "—" : formatSeconds(answer.eta)}`}
        </p>
      ) : null}
      {answer?.kind === "refused" ? (
        <p className="text-muted-foreground text-xs/relaxed">
          Refused — {refusalText(answer.reason)}.
        </p>
      ) : null}
    </div>
  );
}
