import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  Section,
  StatusBadge,
  useConfirm,
} from "@fluxta/sdk/ui";
import {
  blankRewardDraft,
  toRewardDraft,
  type EditorMessage,
  type Reward,
  type RewardDraft,
  type RewardsState,
} from "platforms-protocol";
import { useState } from "react";

import { RewardForm } from "./RewardForm";

type Props = {
  rewards: RewardsState;
  /** Why Twitch turned the last write down, if it did. */
  refusal?: string;
  send: (message: EditorMessage) => void;
};

/** The Reward being edited, or the one being created when there is no id yet. */
type Editing = { id?: string; draft: RewardDraft };

export function RewardsCard({ rewards, refusal, send }: Props) {
  const [editing, setEditing] = useState<Editing>();

  const listed = rewards.status === "ready" ? rewards.rewards : [];

  const save = (draft: RewardDraft) => {
    send(
      editing?.id
        ? { event: "update-reward", id: editing.id, reward: draft }
        : { event: "create-reward", reward: draft },
    );
    setEditing(undefined);
  };

  return (
    <Section
      title="Channel point rewards"
      description="Twitch lets an app change only the rewards it created itself, so a reward added in the Twitch dashboard is listed here but stays read-only. Rewards created here can be edited, switched on and off from the deck, and have their redemptions fulfilled or refunded."
      actions={
        <>
          <Button
            variant="outline"
            disabled={rewards.status !== "ready"}
            onClick={() => setEditing({ draft: blankRewardDraft() })}
          >
            Add a reward
          </Button>
          <Button
            variant="outline"
            disabled={rewards.status === "idle"}
            onClick={() => send({ event: "refresh-rewards" })}
          >
            Refresh
          </Button>
        </>
      }
    >
      {refusal ? <p className="text-destructive text-xs/relaxed">{refusal}</p> : null}

      {rewards.status === "idle" ? (
        <EmptyState>Connect the broadcaster account to see this channel's rewards.</EmptyState>
      ) : null}

      {rewards.status === "loading" ? (
        <p className="text-muted-foreground text-xs/relaxed">Reading the channel's rewards…</p>
      ) : null}

      {rewards.status === "error" ? (
        <p className="text-destructive text-xs/relaxed">{rewards.message}</p>
      ) : null}

      {rewards.status === "ready" && listed.length === 0 ? (
        <EmptyState>This channel has no rewards yet.</EmptyState>
      ) : null}

      {listed.map((reward) =>
        editing?.id === reward.id ? (
          <RewardForm
            key={reward.id}
            draft={editing.draft}
            others={listed.filter((other) => other.id !== reward.id)}
            onSave={save}
            onCancel={() => setEditing(undefined)}
          />
        ) : (
          <RewardRow
            key={reward.id}
            reward={reward}
            onEdit={() =>
              setEditing({ id: reward.id, draft: toRewardDraft(reward) })
            }
            onDelete={() => send({ event: "delete-reward", id: reward.id })}
          />
        ),
      )}

      {editing && !editing.id ? (
        <RewardForm
          draft={editing.draft}
          others={listed}
          onSave={save}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
    </Section>
  );
}

function RewardRow({
  reward,
  onEdit,
  onDelete,
}: {
  reward: Reward;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();

  const handleDelete = async () => {
    // Deleting a reward on Twitch takes its redemption history with it, and
    // nothing brings it back, so the confirmation is the click that means it.
    const sure = await confirm({
      title: `Delete "${reward.title}"?`,
      description: "Its redemption history goes with it, for good.",
      confirmLabel: "Delete for good",
      destructive: true,
    });

    if (sure) {
      onDelete();
    }
  };

  return (
    <ListRow
      title={reward.title}
      leading={
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: reward.backgroundColor }}
        />
      }
      badges={
        <>
          {reward.managed ? null : <Badge variant="outline">Unmanaged</Badge>}
          {reward.enabled ? null : <StatusBadge tone="idle">Disabled</StatusBadge>}
          {reward.paused ? <StatusBadge tone="pending">Paused</StatusBadge> : null}
          <Badge variant="secondary">{reward.cost.toLocaleString()} points</Badge>
        </>
      }
      actions={
        reward.managed ? (
          <>
            <Button variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="outline" onClick={handleDelete}>
              Delete
            </Button>
          </>
        ) : null
      }
    />
  );
}
