import {
  Button,
  EmptyState,
  ListRow,
  NumberField,
  Section,
  SelectField,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import {
  type BlocklistEntry,
  type EditorMessage,
  type PluginStatus,
  type RuleDefaults,
} from "song-requests-protocol";

/**
 * The Rules' Defaults and the Blocklist. A Default applies to every Request
 * Song step that does not Override it; the Blocklist refuses the tracks and
 * channels in it wherever it is enforced (#1's table).
 */
export function RulesSection({ status }: { status: PluginStatus }) {
  const editor = usePluginEditor();

  function send(message: EditorMessage) {
    void editor.sendToPlugin(message);
  }

  return (
    <>
      <DefaultsSection
        defaults={status.defaults}
        send={(change) =>
          send({ event: "set-rule-defaults", defaults: change })
        }
      />
      <BlocklistSection
        blocklist={status.blocklist}
        send={(entry) => send({ event: "remove-blocklist-entry", entry })}
      />
    </>
  );
}

function DefaultsSection({
  defaults,
  send,
}: {
  defaults: RuleDefaults;
  send: (change: Partial<RuleDefaults>) => void;
}) {
  return (
    <Section
      title="Defaults"
      description="What every Request must pass to become a Song, unless its Request Song step Overrides it."
    >
      <SelectField
        label="Requests Open"
        value={defaults.requestsOpen ? "open" : "closed"}
        options={[
          { value: "open", label: "Open" },
          { value: "closed", label: "Closed" },
        ]}
        onChange={(value) => send({ requestsOpen: value === "open" })}
      />
      <NumberField
        label="Longest Duration (Minutes)"
        min={0}
        value={defaults.longestDurationSeconds / 60}
        onChange={(minutes) =>
          send({ longestDurationSeconds: Math.round((minutes ?? 0) * 60) })
        }
        hint="A longer Song is refused as too-long. Without the API Key the check waits for its Start Check, before anything of it is heard."
      />
      <NumberField
        label="Shortest Duration (Minutes)"
        min={0}
        value={
          defaults.shortestDurationSeconds === undefined
            ? undefined
            : defaults.shortestDurationSeconds / 60
        }
        onChange={(minutes) =>
          send({ shortestDurationSeconds: Math.round((minutes ?? 0) * 60) })
        }
        hint="Empty or 0 for none — the Default is no shortest bound."
      />
      <NumberField
        label="Songs Waiting per Requester"
        min={1}
        value={defaults.waitingPerRequester}
        onChange={(value) =>
          send({ waitingPerRequester: Math.max(1, Math.round(value ?? 1)) })
        }
        hint="By platform and id; a Request without an id is not counted."
      />
      <NumberField
        label="Song Queue Size"
        min={1}
        value={defaults.queueSize}
        onChange={(value) =>
          send({ queueSize: Math.max(1, Math.round(value ?? 1)) })
        }
      />
      <SelectField
        label="Already in the Song Queue or on Air"
        value={defaults.alreadyQueued}
        options={[
          { value: "refuse", label: "Refuse" },
          { value: "allow", label: "Allow" },
        ]}
        onChange={(value) =>
          send({ alreadyQueued: value as "refuse" | "allow" })
        }
      />
      <NumberField
        label="Played Within (Minutes)"
        min={0}
        value={defaults.playedWithinSeconds / 60}
        onChange={(minutes) =>
          send({ playedWithinSeconds: Math.round((minutes ?? 0) * 60) })
        }
        hint="0 — a track may be requested again at once. Checked against the History."
      />
      <SelectField
        label="Music Only"
        value={defaults.musicOnly ? "on" : "off"}
        options={[
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
        ]}
        onChange={(value) => send({ musicOnly: value === "on" })}
        hint="Checked only with the API Key, which alone knows YouTube's category; without it this is not checked."
      />
    </Section>
  );
}

function BlocklistSection({
  blocklist,
  send,
}: {
  blocklist: BlocklistEntry[];
  send: (entry: BlocklistEntry) => void;
}) {
  return (
    <Section
      title="Blocklist"
      description="Tracks and channels refused wherever the Blocklist is enforced. Removing an entry applies at once."
    >
      {blocklist.length === 0 ? (
        <EmptyState>
          Nothing is blocked. Block Song — one of the plugin's Actions — adds
          the Current Song or one found by id, its track or its channel.
        </EmptyState>
      ) : (
        blocklist.map((entry, index) => (
          <ListRow
            key={`${entry.kind}-${index}`}
            title={entry.kind === "track" ? "Track" : "Channel"}
            description={
              entry.kind === "track"
                ? `${entry.provider} · ${entry.trackId}`
                : entry.channelUrl ||
                  `${entry.provider ?? ""} · ${entry.channelId ?? ""}`
            }
            actions={
              <Button
                type="button"
                variant="secondary"
                onClick={() => send(entry)}
              >
                Remove
              </Button>
            }
          />
        ))
      )}
    </Section>
  );
}
