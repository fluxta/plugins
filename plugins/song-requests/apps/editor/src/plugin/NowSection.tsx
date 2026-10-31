import {
  Button,
  CheckboxField,
  NumberField,
  Section,
  StatusBadge,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";
import type { EditorMessage, PlaybackStatus } from "song-requests-protocol";

import { formatSeconds } from "./format";

/**
 * The editor's clock, read in an effect so the render stays pure: once a
 * second while something plays, so the progress moves between the sidecar's
 * republished statuses. Until the first tick the position the status
 * reported stands — it is only a second old.
 */
function useTicker(running: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * What is on air — the Current Song or a Fallback Track — with its progress
 * and the controls that shape it: Pause, Skip, Block and the volume. Each
 * does what the Action of the same name does; a Fallback Track is skipped,
 * not skipped-as-a-Song. The Requests Open switch is the Requests Action's
 * open and close.
 */
export function NowSection({ playback }: { playback: PlaybackStatus }) {
  const editor = usePluginEditor();
  const current = playback.current;
  const paused = playback.isPaused;
  const now = useTicker(playback.isPlaying);

  function send(message: EditorMessage) {
    void editor.sendToPlugin(message);
  }

  // The editor runs on the sidecar's computer, so its clock turns the
  // position the status reported into the position now.
  const elapsed =
    (current?.position ?? 0) +
    (playback.isPlaying && now !== null
      ? Math.max(0, now - playback.now) / 1000
      : 0);

  return (
    <>
      <Section
        title="Now Playing"
        description="What the Player Page plays. Skip ends it, Block Song puts its track into the Blocklist; both are the plugin's Actions, so chat and deck replies see the same Events."
      >
        {current ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{current.title}</span>
              {current.isFallback ? (
                <StatusBadge tone="idle">Fallback Track</StatusBadge>
              ) : null}
              {paused ? (
                <StatusBadge tone="idle">Paused</StatusBadge>
              ) : playback.playerState === "buffering" ? (
                <StatusBadge tone="pending">Buffering</StatusBadge>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs/relaxed">
              {current.channel}
              {current.requesterName
                ? ` — requested by ${current.requesterName}`
                : ""}
            </p>
            {current.duration === null ? (
              <p className="text-muted-foreground text-xs/relaxed">
                How long it is will be known once its Player reports it — until
                then it plays muted at its Start Check.
              </p>
            ) : (
              <>
                <div
                  className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={current.duration}
                  aria-valuenow={Math.min(
                    Math.round(elapsed),
                    current.duration,
                  )}
                >
                  <div
                    className="bg-foreground h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (elapsed / current.duration) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs/relaxed">
                  {formatSeconds(Math.min(elapsed, current.duration))} /{" "}
                  {formatSeconds(current.duration)}
                </p>
              </>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-xs/relaxed">
            {playback.isPaused
              ? "Playback is paused. Resume to play the next Song."
              : "Nothing is on air. The next Song goes on once a Player Page is open — add its address to OBS as a Browser Source."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              send({
                event: "playback",
                mode: paused ? "resume" : "pause",
              })
            }
          >
            {paused ? "Resume" : "Pause"}
          </Button>
          {current ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => send({ event: "skip" })}
              >
                Skip
              </Button>
              {!current.isFallback ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    send({ event: "block-song", songId: current.id })
                  }
                >
                  Block
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        <NumberField
          label="Volume"
          min={0}
          max={100}
          value={playback.volume}
          onChange={(value) => {
            if (value !== undefined)
              send({ event: "set-volume", volume: value });
          }}
          hint="Kept across restarts, like the Volume Action leaves it."
        />
      </Section>
      <Section title="Requests">
        <CheckboxField
          label="Requests Open"
          checked={playback.requestsOpen}
          onChange={(open) => send({ event: "set-requests-open", open })}
          hint="What Request Song refuses as closed when off — the Requests Action sets the same switch."
        />
      </Section>
    </>
  );
}
