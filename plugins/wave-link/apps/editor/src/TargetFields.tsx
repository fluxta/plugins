import { SelectField } from "@fluxta/sdk/ui";
import type { Snapshot, Target } from "wave-link-protocol";

type Props = {
  target: Partial<Target>;
  status?: Snapshot;
  onChange: (patch: Partial<Target>) => void;
};

export function TargetFields({ target, status, onChange }: Props) {
  const kind = target.targetKind ?? "channel";
  const channel = status?.channels.find(
    (entry) => entry.id === target.channelId,
  );
  const mixes =
    kind === "channelMix"
      ? status?.mixes.filter((mix) =>
          channel?.mixes.some((entry) => entry.id === mix.id),
        )
      : status?.mixes;
  return (
    <>
      <SelectField
        label="Target"
        value={kind}
        options={[
          { value: "channel", label: "Channel" },
          { value: "channelMix", label: "Channel in Mix" },
          { value: "mix", label: "Mix" },
        ]}
        onChange={(value) =>
          onChange({ targetKind: value as Target["targetKind"] })
        }
      />
      {kind !== "mix" ? (
        <SelectField
          label="Channel"
          value={target.channelId}
          options={status?.channels.map((entry) => ({
            value: entry.id,
            label: entry.name,
          }))}
          placeholder="Choose a Channel"
          emptyMessage="No Channels available — check Wave Link."
          missingLabel={(value) =>
            `${value} — unavailable; choose again if deleted`
          }
          onChange={(channelId) => onChange({ channelId })}
        />
      ) : null}
      {kind !== "channel" ? (
        <SelectField
          label="Mix"
          value={target.mixId}
          options={mixes?.map((entry) => ({
            value: entry.id,
            label: entry.name,
          }))}
          placeholder="Choose a Mix"
          emptyMessage="No Mixes available for this Target."
          missingLabel={(value) =>
            `${value} — unavailable; choose again if deleted`
          }
          onChange={(mixId) => onChange({ mixId })}
        />
      ) : null}
    </>
  );
}
