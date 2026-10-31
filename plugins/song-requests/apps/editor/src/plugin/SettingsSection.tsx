import {
  Button,
  ExternalLink,
  Section,
  SelectField,
  StatusBadge,
  TextField,
  usePluginEditor,
  type StatusTone,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  REGIONS,
  type ApiKeyStatus,
  type EditorMessage,
  type PluginStatus,
} from "song-requests-protocol";

const GETTING_STARTED =
  "https://developers.google.com/youtube/v3/getting-started";

const SYSTEM = "system";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const nameOf = (region: string) => regionNames.of(region) ?? region;

const REGION_OPTIONS = REGIONS.map((region) => ({
  value: region,
  label: nameOf(region),
})).sort((a, b) => a.label.localeCompare(b.label));

function resetTime(resetsAt: number | undefined): string {
  return resetsAt === undefined
    ? "midnight Pacific time"
    : new Date(resetsAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * What the Plugin Editor says of the API Key: a badge, and what it means for
 * Requests — which of the ways without a usable key applies.
 */
function stateOf(apiKey: ApiKeyStatus): {
  tone: StatusTone;
  badge: string;
  detail?: string;
} {
  switch (apiKey.state) {
    case "none":
      return {
        tone: "idle",
        badge: "No API Key",
        detail: "Links are checked without one.",
      };
    case "unchecked":
      return { tone: "pending", badge: "Not checked by YouTube yet" };
    case "accepted":
      return { tone: "ok", badge: "YouTube accepts this key" };
    case "refused":
      return {
        tone: "error",
        badge: "YouTube refuses this key",
        detail:
          "Links are checked without it. Check the key, and that its project has the YouTube Data API v3 enabled and no website or app restriction, then save it again.",
      };
    case "spent":
      return {
        tone: "pending",
        badge: "Today's units are spent",
        detail: `Links are checked without the key until YouTube resets them at ${resetTime(apiKey.resetsAt)}.`,
      };
  }
}

/**
 * The API Key, optional (ADR-0005), and the Region. The key is never sent to
 * the editor: it shows the sidecar's masked form, and a key typed here goes
 * to the sidecar, which keeps it.
 */
export function SettingsSection({ status }: { status: PluginStatus }) {
  const editor = usePluginEditor();
  const [apiKey, setApiKey] = useState("");
  const [playlist, setPlaylist] = useState("");
  const keyState = stateOf(status.apiKey);
  const hasKey = status.apiKey.state !== "none";
  const savedPlaylist = status.fallbackPlaylist;

  function send(message: EditorMessage) {
    void editor.sendToPlugin(message);
  }

  function saveKey(next: string) {
    send({ event: "set-api-key", apiKey: next });
    setApiKey("");
  }

  function savePlaylist(next: string) {
    send({ event: "set-fallback-playlist", playlist: next });
    setPlaylist("");
  }

  return (
    <>
      <Section
        title="YouTube API Key"
        description="Optional. Without it, a link is checked through YouTube's public page data, and what only the player can tell — a live stream, how long the Song is — is found when its turn comes, before anything of it is heard. With it, every Request is checked before it is accepted, so an accepted Song will play, and the answer says how long it is and when it should start."
      >
        <div className="flex items-center gap-2">
          <StatusBadge tone={keyState.tone}>{keyState.badge}</StatusBadge>
        </div>
        {keyState.detail ? (
          <p className="text-muted-foreground text-xs/relaxed">
            {keyState.detail}
          </p>
        ) : null}
        <TextField
          label="API Key"
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder={
            hasKey
              ? `${status.apiKey.masked} saved — type a new one to replace it`
              : "AIza…"
          }
          hint={
            <>
              Your own key from a Google Cloud project with the YouTube Data API
              v3 enabled. Its daily quota is yours; YouTube resets it at
              midnight Pacific time.{" "}
              <ExternalLink href={GETTING_STARTED}>How to get one</ExternalLink>
            </>
          }
        />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!apiKey.trim()}
            onClick={() => saveKey(apiKey)}
          >
            Save
          </Button>
          {hasKey ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => saveKey("")}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </Section>
      <Section
        title="Region"
        description="The country a Song's Playability is checked for — whether YouTube lets it play there. Yours, since this computer plays it."
      >
        <SelectField
          label="Region"
          value={status.region.chosen ?? SYSTEM}
          options={[
            {
              value: SYSTEM,
              label: `This computer's — ${nameOf(status.region.system)}`,
            },
            ...REGION_OPTIONS,
          ]}
          onChange={(value) =>
            send({
              event: "set-region",
              region: value === SYSTEM ? null : value,
            })
          }
          hint="Taken from this computer's language settings until you pick another."
        />
      </Section>
      <Section
        title="Fallback Playlist"
        description="A YouTube playlist whose tracks play shuffled, one at a time, while the Song Queue is empty — so the stream is never silent. With the API Key its tracks are checked before they play; without it, what cannot play is skipped when its turn comes. A Song always waits for the Fallback Track on air to end."
      >
        <TextField
          label="Playlist link"
          value={playlist}
          onChange={setPlaylist}
          placeholder={
            savedPlaylist
              ? `${savedPlaylist} saved — paste a new one to replace it`
              : "https://www.youtube.com/playlist?list=…"
          }
          hint="The whole link, from a YouTube playlist's Share or address bar."
        />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!playlist.trim()}
            onClick={() => savePlaylist(playlist)}
          >
            Save
          </Button>
          {savedPlaylist ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => savePlaylist("")}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </Section>
    </>
  );
}
