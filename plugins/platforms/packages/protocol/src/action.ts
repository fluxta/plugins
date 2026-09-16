/**
 * The settings an Action's editor saves and its Action reads back.
 *
 * These travel through the host rather than over the plugin's own channel, but
 * they are still one shape two sides must agree on, so they are defined once
 * here for the same reason the messages are.
 */

/** What an Action does about a Reward being shown to viewers. */
export const ENABLEMENTS = ["unchanged", "enable", "disable", "toggle"] as const;

export type Enablement = (typeof ENABLEMENTS)[number];

export const ENABLEMENT_LABELS: Record<Enablement, string> = {
  unchanged: "Leave as it is",
  enable: "Enable",
  disable: "Disable",
  toggle: "Toggle",
};

/** How a Redemption ends: the viewer got what they paid for, or their points back. */
export const RESOLUTIONS = ["fulfill", "refund"] as const;

export type Resolution = (typeof RESOLUTIONS)[number];

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  fulfill: "Fulfil it",
  refund: "Refund the points",
};

/** Settings of the Update Reward Action. */
export type UpdateRewardSettings = {
  /** Picked from the live list of Rewards, never typed. */
  rewardId?: string;
  enablement?: Enablement;
  /** The new cost, as a template. Empty leaves the cost alone. */
  cost?: string;
};

/** Settings of the Resolve Redemption Action. */
export type ResolveRedemptionSettings = {
  /** Both ids come from the Reward Redeemed event, as template references. */
  rewardId?: string;
  redemptionId?: string;
  resolution?: Resolution;
};

/** Twitch's own caps for a Poll, so the editor can refuse before a round trip. */
export const POLL_TITLE_MAX = 60;
export const POLL_CHOICE_TITLE_MAX = 25;
export const POLL_MIN_CHOICES = 2;
export const POLL_MAX_CHOICES = 5;
export const POLL_DURATION_MIN = 15;
export const POLL_DURATION_MAX = 1800;

/** Settings of the Start Poll Action. */
export type StartPollSettings = {
  /** The poll title, as a template. Twitch's cap is `POLL_TITLE_MAX` characters. */
  title?: string;
  /** The poll's Choices. Twitch requires between `POLL_MIN_CHOICES` and `POLL_MAX_CHOICES`. */
  choices?: string[];
  /** How long the poll runs, in seconds, as a template. */
  duration?: string;
};

// The End Poll Action takes no settings: Twitch allows only one active Poll
// per channel, so there is nothing for its editor to configure.

/** Twitch's own caps for a Prediction, so the editor can refuse before a round trip. */
export const PREDICTION_TITLE_MAX = 45;
export const PREDICTION_OUTCOME_TITLE_MAX = 25;
export const PREDICTION_MIN_OUTCOMES = 2;
export const PREDICTION_MAX_OUTCOMES = 10;
export const PREDICTION_DURATION_MIN = 30;
export const PREDICTION_DURATION_MAX = 1800;

/** Settings of the Start Prediction Action. */
export type StartPredictionSettings = {
  /** The prediction title, as a template. Twitch's cap is `PREDICTION_TITLE_MAX` characters. */
  title?: string;
  /**
   * The prediction's Outcomes. Twitch requires between `PREDICTION_MIN_OUTCOMES` and
   * `PREDICTION_MAX_OUTCOMES`.
   */
  outcomes?: string[];
  /** How long betting stays open, in seconds, as a template. */
  duration?: string;
};

// The Lock Prediction and Cancel Prediction Actions take no settings: Twitch
// allows only one running Prediction per channel, so there is nothing for
// their editors to configure.

/** Settings of the Resolve Prediction Action. */
export type ResolvePredictionSettings = {
  /**
   * The winning Outcome, by its position (`"1"`, `"2"`, …) or its exact title —
   * as a template. Never Twitch's Outcome id: the plugin looks that up itself
   * from the running Prediction.
   */
  outcome?: string;
};
