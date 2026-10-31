import {
  Button,
  EmptyState,
  ListRow,
  Section,
  StatusBadge,
  TextField,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import type {
  EditorMessage,
  PlaybackStatus,
  WaitingSong,
} from "song-requests-protocol";

import { refusalText } from "./refusalText";
import { formatSeconds } from "./format";
import type { SongRequest } from "./useSongRequest";

function etaText(eta: number | null): string {
  return eta === null ? "—" : formatSeconds(eta);
}

/**
 * The Song Queue: every waiting Song with its Requester, duration and eta,
 * drag to reorder — the new order is the queue's from then on, kept across
 * restarts — and Move to next, Block and Remove per Song. Removing fires
 * Song Dropped `removed` and blocking acts as Block Song, exactly as the
 * Actions do. Below, the streamer's own field adds a Song, checked as
 * Request Song with the Defaults; its Refusal's reason is shown here.
 */
export function QueueSection({
  playback,
  request,
}: {
  playback: PlaybackStatus;
  request: SongRequest;
}) {
  const editor = usePluginEditor();
  const { draft, answer } = request;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<number | null>(null);

  function send(message: EditorMessage) {
    void editor.sendToPlugin(message);
  }

  function drop(toPosition: number) {
    if (draggingId)
      send({ event: "reorder-song", songId: draggingId, toPosition });
    setDraggingId(null);
    setOverPosition(null);
  }

  return (
    <Section
      title="Song Queue"
      description="What plays after the Current Song, in order. Drag a Song to another place, or act on it — the same Events fire as for the Actions run from chat or the deck."
    >
      {playback.waiting.length === 0 ? (
        <EmptyState>
          Nothing is waiting. Songs requested from chat and the deck appear here
          as they arrive.
        </EmptyState>
      ) : (
        playback.waiting.map((song, index) => (
          <QueueRow
            key={song.id}
            song={song}
            position={index + 1}
            dragging={draggingId !== null}
            over={overPosition === index + 1}
            onDragStart={() => {
              setDraggingId(song.id);
              setOverPosition(index + 1);
            }}
            onDragOverPosition={(toPosition) => setOverPosition(toPosition)}
            onDrop={drop}
            onDragEnd={() => {
              setDraggingId(null);
              setOverPosition(null);
            }}
            send={send}
          />
        ))
      )}
      <TextField
        label="Add a Song"
        value={draft}
        onChange={request.changeDraft}
        placeholder="A YouTube link or search words"
        hint="Checked as Request Song with the Defaults: the Rules and the Blocklist apply, and what needs the API Key is refused without it."
      />
      <div className="flex items-center gap-2">
        <Button type="button" disabled={!draft.trim()} onClick={request.submit}>
          Add
        </Button>
        {answer?.kind === "accepted" ? (
          <StatusBadge tone="ok">
            {answer.position === 0
              ? "On air now"
              : `Queued #${answer.position} — starts in ${etaText(answer.eta)}`}
          </StatusBadge>
        ) : null}
      </div>
      {answer?.kind === "refused" ? (
        <p className="text-muted-foreground text-xs/relaxed">
          Refused — {refusalText(answer.reason)}.
        </p>
      ) : null}
    </Section>
  );
}

function QueueRow({
  song,
  position,
  dragging,
  over,
  onDragStart,
  onDragOverPosition,
  onDrop,
  onDragEnd,
  send,
}: {
  song: WaitingSong;
  /** Its 1-based place among the waiting Songs — where a drop lands. */
  position: number;
  dragging: boolean;
  over: boolean;
  onDragStart: () => void;
  onDragOverPosition: (toPosition: number) => void;
  onDrop: (toPosition: number) => void;
  onDragEnd: () => void;
  send: (message: EditorMessage) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => {
        // Without preventing the default, dropping is not offered.
        event.preventDefault();
        onDragOverPosition(position);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(position);
      }}
      onDragEnd={onDragEnd}
      className={over && dragging ? "rounded-md bg-muted/60" : undefined}
    >
      <ListRow
        leading={
          <span
            aria-hidden
            className="text-muted-foreground cursor-grab select-none"
            title="Drag to reorder"
          >
            ⠿
          </span>
        }
        title={song.title}
        description={`${song.channel}${song.requesterName ? ` — ${song.requesterName}` : ""} · ${song.duration === null ? "—" : formatSeconds(song.duration)} · starts in ${etaText(song.eta)}`}
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => send({ event: "move-song-next", songId: song.id })}
            >
              Move to next
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => send({ event: "block-song", songId: song.id })}
            >
              Block
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => send({ event: "remove-song", songId: song.id })}
            >
              Remove
            </Button>
          </div>
        }
      />
    </div>
  );
}
