import { Badge, Button } from "@fluxta/sdk/ui";
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
    <div>
      <div className="bg-background/30 text-base font-semibold">
        Channel point rewards
      </div>
      <p className="text-muted-foreground mt-2 mb-5 text-xs">
        Twitch lets an app change only the rewards it created itself, so a
        reward added in the Twitch dashboard is listed here but stays read-only.
        Rewards created here can be edited, switched on and off from the deck,
        and have their redemptions fulfilled or refunded.
      </p>
      <div className="space-y-3">
        {refusal ? <p className="text-sm text-destructive">{refusal}</p> : null}

        {rewards.status === "idle" ? (
          <p className="text-sm text-muted-foreground">
            Connect the broadcaster account to see this channel's rewards.
          </p>
        ) : null}

        {rewards.status === "loading" ? (
          <p className="text-sm text-muted-foreground">
            Reading the channel's rewards…
          </p>
        ) : null}

        {rewards.status === "error" ? (
          <p className="text-sm text-destructive">{rewards.message}</p>
        ) : null}

        {rewards.status === "ready" && listed.length === 0 && !editing ? (
          <p className="text-sm text-muted-foreground">
            This channel has no rewards yet.
          </p>
        ) : null}

        {editing && !editing.id ? (
          <RewardForm
            draft={editing.draft}
            others={listed}
            onSave={save}
            onCancel={() => setEditing(undefined)}
          />
        ) : null}

        {editing ? null : (
          <div className="flex gap-2">
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
          </div>
        )}

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
      </div>
    </div>
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
  // Deleting a reward on Twitch takes its redemption history with it, and
  // nothing brings it back, so the second click is the one that means it.
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 bg-muted/30">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: reward.backgroundColor }}
          />
          <span className="font-medium">{reward.title}</span>
          {reward.managed ? null : <Badge variant="outline">Unmanaged</Badge>}
          {reward.enabled ? null : <Badge variant="outline">Disabled</Badge>}
          {reward.paused ? <Badge variant="outline">Paused</Badge> : null}
          <Badge variant="secondary">
            {reward.cost.toLocaleString()} points
          </Badge>
        </div>
      </div>

      {reward.managed && (
        <div className="flex shrink-0 gap-2">
          {confirming ? (
            <>
              <Button variant="outline" onClick={onDelete}>
                Delete for good
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onEdit}>
                Edit
              </Button>
              <Button variant="outline" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
