import { Alert, EditorPage } from "@fluxta/sdk/ui";
import type { ReactNode } from "react";
import type { LevelState, Snapshot, Target } from "wave-link-protocol";
import { TargetFields } from "./TargetFields";

type Props = {
  target: Target;
  onTargetChange: (target: Partial<Target>) => void;
  status?: Snapshot;
  field: keyof LevelState;
  children: ReactNode;
};

export function ActionEditorPage({
  target,
  onTargetChange,
  status,
  field,
  children,
}: Props) {
  let unsupported = false;
  if (status?.status === "connected") {
    const channel = status.channels.find(
      (entry) => entry.id === target.channelId,
    );
    const selected =
      target.targetKind === "mix"
        ? status.mixes.find((entry) => entry.id === target.mixId)
        : target.targetKind === "channelMix"
          ? channel?.mixes.find((entry) => entry.id === target.mixId)
          : channel;
    unsupported = selected ? selected[field] === null : false;
  }
  return (
    <EditorPage>
      {status?.status === "error" ? (
        <Alert title="Wave Link unavailable" variant="destructive">
          {status.message}
        </Alert>
      ) : null}
      <TargetFields target={target} status={status} onChange={onTargetChange} />
      {children}
      {unsupported ? (
        <Alert variant="destructive">
          This Wave Link version does not expose{" "}
          {field === "muted" ? "mute" : "volume"} for the selected Target.
        </Alert>
      ) : null}
      <p className="wave-link-hint">
        Returns success and error for later steps. Unavailable commands are not
        queued.
      </p>
    </EditorPage>
  );
}
