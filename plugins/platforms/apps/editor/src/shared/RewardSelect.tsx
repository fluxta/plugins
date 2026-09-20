import { SelectField } from "@fluxta/sdk/ui";
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

  return (
    <SelectField
      label="Reward"
      options={listed.map((reward) => ({ value: reward.id, label: reward.title }))}
      value={value}
      onChange={onChange}
      placeholder="Choose a reward"
      loading={rewards.status === "loading"}
      missingLabel={() =>
        chosen ? `${chosen.title} — created outside the plugin` : "A reward that is no longer on the channel"
      }
      hint={<Hint rewards={rewards} />}
    />
  );
}

function Hint({ rewards }: { rewards: RewardsState }) {
  switch (rewards.status) {
    case "idle":
      return "Connect the broadcaster account in the plugin settings to see the channel's rewards.";

    case "loading":
      return null;

    case "error":
      return <span className="text-destructive">{rewards.message}</span>;

    case "ready": {
      const listed = manageable(rewards);

      if (listed.length === 0) {
        return rewards.rewards.length === 0
          ? "This channel has no rewards yet. Create one in the plugin settings."
          : "None of this channel's rewards were created by the plugin, and Twitch lets it change no others. Create one in the plugin settings.";
      }

      return listed.length === rewards.rewards.length
        ? null
        : "Rewards created in the Twitch dashboard are not listed: Twitch only lets the plugin change the ones it created itself.";
    }
  }
}

function onChannel(rewards: RewardsState): Reward[] {
  return rewards.status === "ready" ? rewards.rewards : [];
}

function manageable(rewards: RewardsState): Reward[] {
  return onChannel(rewards).filter((reward) => reward.managed);
}
