/**
 * Spreads a Prediction's Outcome titles onto the ten numbered fields the
 * manifest declares.
 *
 * Twitch allows two to ten Outcomes per Prediction, but the manifest's Event
 * Fields are fixed at build time — there is no way to declare "one Field per
 * Outcome" for a count that varies per Prediction. A numbered slot is the
 * trade-off, the same one Polls use for Choices: unused slots report an
 * empty title. Every Event addresses an Outcome this way, never by Twitch's
 * own Outcome id.
 */
export function outcomeTitleFields(outcomes: readonly { title: string }[]): {
  outcome1: string;
  outcome2: string;
  outcome3: string;
  outcome4: string;
  outcome5: string;
  outcome6: string;
  outcome7: string;
  outcome8: string;
  outcome9: string;
  outcome10: string;
} {
  return {
    outcome1: outcomes[0]?.title ?? "",
    outcome2: outcomes[1]?.title ?? "",
    outcome3: outcomes[2]?.title ?? "",
    outcome4: outcomes[3]?.title ?? "",
    outcome5: outcomes[4]?.title ?? "",
    outcome6: outcomes[5]?.title ?? "",
    outcome7: outcomes[6]?.title ?? "",
    outcome8: outcomes[7]?.title ?? "",
    outcome9: outcomes[8]?.title ?? "",
    outcome10: outcomes[9]?.title ?? "",
  };
}

/** The same ten slots, as the channel points wagered on each Outcome. */
export function outcomePointFields(outcomes: readonly { channelPoints: number }[]): {
  outcome1Points: number;
  outcome2Points: number;
  outcome3Points: number;
  outcome4Points: number;
  outcome5Points: number;
  outcome6Points: number;
  outcome7Points: number;
  outcome8Points: number;
  outcome9Points: number;
  outcome10Points: number;
} {
  return {
    outcome1Points: outcomes[0]?.channelPoints ?? 0,
    outcome2Points: outcomes[1]?.channelPoints ?? 0,
    outcome3Points: outcomes[2]?.channelPoints ?? 0,
    outcome4Points: outcomes[3]?.channelPoints ?? 0,
    outcome5Points: outcomes[4]?.channelPoints ?? 0,
    outcome6Points: outcomes[5]?.channelPoints ?? 0,
    outcome7Points: outcomes[6]?.channelPoints ?? 0,
    outcome8Points: outcomes[7]?.channelPoints ?? 0,
    outcome9Points: outcomes[8]?.channelPoints ?? 0,
    outcome10Points: outcomes[9]?.channelPoints ?? 0,
  };
}
