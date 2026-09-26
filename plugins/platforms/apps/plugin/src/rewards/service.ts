import type { HelixUpdateCustomRewardData } from "@twurple/api";
import {
  resolveEnablement,
  type Enablement,
  type Resolution,
  type Reward,
  type RewardDraft,
  type RewardsState,
} from "platforms-protocol";

import { explainTwitchError } from "../twitch/errors";

import type { ChannelPointsApi } from "./api";
import { toReward, toRewardData } from "./reward";

/** What an Action asks to happen to the Reward it points at. */
export type RewardChange = {
  /** Whether viewers should see the Reward. */
  enablement: Enablement;
  /** The new cost, or nothing to leave it alone. */
  cost?: number;
};

const NO_BROADCASTER = "Connect the broadcaster account to manage channel point rewards.";

/**
 * Owns the Channel's Rewards: the list the editors render and pick from, and
 * every write that changes one.
 *
 * Only Rewards this plugin created can be changed at all, and Twitch says so
 * in terms of client ids. Every write therefore checks the list
 * first and refuses in the plugin's own words, so a streamer reads why rather
 * than reading Twitch's header documentation.
 */
export class RewardsService {
  private state: RewardsState = { status: "idle" };
  /** The channel the current list belongs to. */
  private listed?: string;
  /** The refresh in flight, so a burst of Actions does not fetch per Action. */
  private loading?: Promise<void>;

  /**
   * @param channelId The Broadcaster Account's Twitch id, read on every call
   * rather than held, since an Account can be connected and dropped while the
   * plugin runs.
   * @param api Passed in rather than reached for, so every path through this
   * service can be exercised without a live connection.
   */
  constructor(
    private readonly channelId: () => string | undefined,
    private readonly api: ChannelPointsApi,
    private readonly onChange: () => void,
  ) {}

  snapshot(): RewardsState {
    return this.state;
  }

  /**
   * Brings the list in line with the connected Accounts. Safe to call on every
   * Account change — it does nothing when the broadcaster has not changed.
   */
  sync(): void {
    const broadcasterId = this.channelId();

    if (broadcasterId === this.listed) {
      return;
    }

    this.listed = broadcasterId;

    if (!broadcasterId) {
      this.set({ status: "idle" });
      return;
    }

    void this.refresh();
  }

  /** Reads the Channel's Rewards from Twitch. */
  refresh(): Promise<void> {
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });

    return this.loading;
  }

  // --- What the plugin editor asks for ------------------------------------

  /** @returns why the Reward was not created, or nothing when it was. */
  async create(draft: RewardDraft): Promise<string | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      return NO_BROADCASTER;
    }

    try {
      const created = await this.api.createCustomReward(channelId, toRewardData(draft));

      // A Reward this plugin just created is managed by definition, so the
      // list can take it without asking Twitch who owns it.
      this.absorb(toReward(created, true));
      console.log(`Created the reward "${created.title}"`);
      return undefined;
    } catch (error) {
      return this.failed(`The reward "${draft.title}" was not created`, error);
    }
  }

  /** @returns why the Reward was not changed, or nothing when it was. */
  async update(id: string, draft: RewardDraft): Promise<string | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      return NO_BROADCASTER;
    }

    const target = await this.target(id);

    if ("refusal" in target) {
      return target.refusal;
    }

    try {
      const updated = await this.api.updateCustomReward(channelId, id, toRewardData(draft));

      this.absorb(toReward(updated, true));
      console.log(`Updated the reward "${updated.title}"`);
      return undefined;
    } catch (error) {
      return this.failed(`The reward "${draft.title}" was not updated`, error);
    }
  }

  /** @returns why the Reward was not deleted, or nothing when it was. */
  async remove(id: string): Promise<string | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      return NO_BROADCASTER;
    }

    const target = await this.target(id);

    if ("refusal" in target) {
      return target.refusal;
    }

    try {
      await this.api.deleteCustomReward(channelId, id);
      this.forget(id);
      console.log(`Deleted the reward "${target.reward.title}"`);
      return undefined;
    } catch (error) {
      return this.failed(`The reward "${target.reward.title}" was not deleted`, error);
    }
  }

  // --- What the Actions ask for -------------------------------------------

  /**
   * Applies an Action's change to one Reward.
   *
   * Nothing is thrown: an Action's outcome is read in the log, never by the
   * program that ran it.
   */
  async change(rewardId: string, change: RewardChange): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    // Read the channel first. The list goes stale the moment the streamer
    // touches the Twitch dashboard, and a toggle that flips the wrong way is
    // worse than one extra request.
    const target = await this.target(rewardId, { reread: true });

    if ("refusal" in target) {
      console.error(target.refusal);
      return;
    }

    const { reward } = target;
    const isEnabled = resolveEnablement(change.enablement, reward.enabled);
    const data: HelixUpdateCustomRewardData = {};

    if (change.cost !== undefined) {
      data.cost = change.cost;
    }

    if (isEnabled !== undefined) {
      data.isEnabled = isEnabled;
    }

    if (Object.keys(data).length === 0) {
      console.warn(`Update Reward ran on "${reward.title}" with nothing to change`);
      return;
    }

    try {
      const updated = await this.api.updateCustomReward(channelId, rewardId, data);

      this.absorb(toReward(updated, true));
      console.log(
        `The reward "${updated.title}" is now ${updated.isEnabled ? "enabled" : "disabled"}` +
          ` and costs ${updated.cost}`,
      );
    } catch (error) {
      console.error(`The reward "${reward.title}" was not changed: ${explainTwitchError(error)}`);
    }
  }

  /** Fulfils a Redemption or gives the viewer their points back. */
  async resolve(rewardId: string, redemptionId: string, resolution: Resolution): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    const target = await this.target(rewardId);

    if ("refusal" in target) {
      console.error(target.refusal);
      return;
    }

    const title = target.reward.title;
    const done = resolution === "fulfill" ? "fulfilled" : "refunded";

    try {
      await this.api.updateRedemptionStatusByIds(
        channelId,
        rewardId,
        [redemptionId],
        resolution === "fulfill" ? "FULFILLED" : "CANCELED",
      );

      console.log(`A redemption of "${title}" was ${done}`);
    } catch (error) {
      // Twitch also refuses a Redemption that someone already resolved, in the
      // dashboard or on an earlier press.
      console.error(`A redemption of "${title}" was not ${done}: ${explainTwitchError(error)}`);
    }
  }

  // -------------------------------------------------------------------------

  private async load(): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      this.set({ status: "idle" });
      return;
    }

    // Only announce loading with nothing to show yet: a refresh must not blank
    // a list the editor is already rendering.
    if (this.state.status !== "ready") {
      this.set({ status: "loading" });
    }

    try {
      // Which Rewards are manageable is a question Twitch only answers as a
      // second, narrower list — it is on no Reward itself.
      const [all, ours] = await Promise.all([
        this.api.getCustomRewards(channelId),
        this.api.getCustomRewards(channelId, true),
      ]);

      const managed = new Set(ours.map((reward) => reward.id));

      this.set({
        status: "ready",
        rewards: sorted(all.map((reward) => toReward(reward, managed.has(reward.id)))),
      });
    } catch (error) {
      const message = explainTwitchError(error);
      console.error(`The channel's rewards could not be read: ${message}`);
      this.set({ status: "error", message });
    }
  }

  /**
   * The Reward a write may act on, or why it may not.
   *
   * Reads the channel again when the Reward is not in the list — an id from a
   * saved Action can be older than anything the plugin has looked at.
   */
  private async target(
    rewardId: string,
    { reread = false }: { reread?: boolean } = {},
  ): Promise<Manageable> {
    if (reread || !this.find(rewardId)) {
      await this.refresh();
    }

    if (this.state.status === "error") {
      // Saying the reward does not exist would be a guess; all that is known
      // is that Twitch would not say what exists.
      return { refusal: `Cannot act on the reward: ${this.state.message}` };
    }

    return manageable(this.find(rewardId), rewardId);
  }

  private find(rewardId: string): Reward | undefined {
    return this.state.status === "ready"
      ? this.state.rewards.find((reward) => reward.id === rewardId)
      : undefined;
  }

  /** Takes a Reward Twitch just handed back into the list. */
  private absorb(reward: Reward): void {
    if (this.state.status !== "ready") {
      void this.refresh();
      return;
    }

    const rest = this.state.rewards.filter((existing) => existing.id !== reward.id);
    this.set({ status: "ready", rewards: sorted([...rest, reward]) });
  }

  private forget(rewardId: string): void {
    if (this.state.status !== "ready") {
      return;
    }

    this.set({
      status: "ready",
      rewards: this.state.rewards.filter((reward) => reward.id !== rewardId),
    });
  }

  private failed(what: string, error: unknown): string {
    const message = `${what}: ${explainTwitchError(error)}`;
    console.error(message);
    return message;
  }

  private set(state: RewardsState): void {
    this.state = state;
    this.onChange();
  }
}

/** The Reward a write may act on, or why it may not. */
type Manageable = { reward: Reward } | { refusal: string };

function manageable(reward: Reward | undefined, rewardId: string): Manageable {
  if (!reward) {
    return { refusal: `The channel has no reward with the id ${rewardId}.` };
  }

  if (!reward.managed) {
    return {
      refusal:
        `The reward "${reward.title}" was created outside this plugin, so Twitch does not ` +
        "let the plugin change it or resolve its redemptions. Create it again in the plugin " +
        "settings to manage it — the new reward starts with an empty redemption history.",
    };
  }

  return { reward };
}

/** Alphabetical, so the editor's list and dropdowns do not reshuffle. */
function sorted(rewards: Reward[]): Reward[] {
  return [...rewards].sort((one, other) => one.title.localeCompare(other.title));
}
