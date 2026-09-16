import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@fluxta/sdk/ui";
import type { Reward, RewardsState } from "platforms-protocol";

type Props = {
  rewards: RewardsState;
  value: string;
  onChange: (rewardId: string) => void;
};

/**
 * Picks one of the Rewards this plugin can drive.
 *
 * Rewards created elsewhere are left out entirely: Twitch refuses every change
 * to them, so listing what cannot be chosen would only be a longer
 * list. That they exist is said below it instead, since a streamer who cannot
 * find a reward they can see on Twitch deserves an answer.
 */
export function RewardSelect({ rewards, value, onChange }: Props) {
  const listed = manageable(rewards);
  const chosen = onChannel(rewards).find((reward) => reward.id === value);
  const missing = value.length > 0 && !listed.some((reward) => reward.id === value);

  return (
    <div className="space-y-2">
      <Label htmlFor="reward">Reward</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="reward" className="w-full">
          <SelectValue placeholder="Choose a reward" />
        </SelectTrigger>
        <SelectContent>
          {missing ? (
            // Keep a saved choice visible rather than silently emptying the
            // field: the reward may be gone, the accounts may be signed out,
            // or the reward may have been recreated outside the plugin.
            <SelectItem value={value}>
              {chosen
                ? `${chosen.title} — created outside the plugin`
                : "A reward that is no longer on the channel"}
            </SelectItem>
          ) : null}
          {listed.map((reward) => (
            <SelectItem key={reward.id} value={reward.id}>
              {reward.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Hint rewards={rewards} />
    </div>
  );
}

function Hint({ rewards }: { rewards: RewardsState }) {
  switch (rewards.status) {
    case "idle":
      return (
        <p className="text-xs text-muted-foreground">
          Connect the broadcaster account in the plugin settings to see the channel's rewards.
        </p>
      );

    case "loading":
      return <p className="text-xs text-muted-foreground">Reading the channel's rewards…</p>;

    case "error":
      return <p className="text-xs text-destructive">{rewards.message}</p>;

    case "ready": {
      const listed = manageable(rewards);

      if (listed.length === 0) {
        return (
          <p className="text-xs text-muted-foreground">
            {rewards.rewards.length === 0
              ? "This channel has no rewards yet. Create one in the plugin settings."
              : "None of this channel's rewards were created by the plugin, and Twitch lets it change no others. Create one in the plugin settings."}
          </p>
        );
      }

      return listed.length === rewards.rewards.length ? null : (
        <p className="text-xs text-muted-foreground">
          Rewards created in the Twitch dashboard are not listed: Twitch only lets the plugin
          change the ones it created itself.
        </p>
      );
    }
  }
}

function onChannel(rewards: RewardsState): Reward[] {
  return rewards.status === "ready" ? rewards.rewards : [];
}

function manageable(rewards: RewardsState): Reward[] {
  return onChannel(rewards).filter((reward) => reward.managed);
}
