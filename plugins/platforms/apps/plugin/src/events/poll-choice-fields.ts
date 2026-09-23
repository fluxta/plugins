/**
 * Spreads a Poll's Choice titles onto the five numbered fields the manifest
 * declares.
 *
 * Twitch allows two to five Choices per Poll, but the manifest's Event Fields
 * are fixed at build time — there is no way to declare "one Field per Choice"
 * for a count that varies per Poll. A numbered slot is the trade-off: unused
 * ones report an empty title. Every Event addresses a Choice this way, never
 * by Twitch's own Choice id.
 */
export function choiceTitleFields(choices: readonly { title: string }[]): {
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  choice5: string;
} {
  return {
    choice1: choices[0]?.title ?? "",
    choice2: choices[1]?.title ?? "",
    choice3: choices[2]?.title ?? "",
    choice4: choices[3]?.title ?? "",
    choice5: choices[4]?.title ?? "",
  };
}

/** The same five slots, as the votes each Choice received. */
export function choiceVoteFields(choices: readonly { totalVotes: number }[]): {
  choice1Votes: number;
  choice2Votes: number;
  choice3Votes: number;
  choice4Votes: number;
  choice5Votes: number;
} {
  return {
    choice1Votes: choices[0]?.totalVotes ?? 0,
    choice2Votes: choices[1]?.totalVotes ?? 0,
    choice3Votes: choices[2]?.totalVotes ?? 0,
    choice4Votes: choices[3]?.totalVotes ?? 0,
    choice5Votes: choices[4]?.totalVotes ?? 0,
  };
}

/**
 * The Choice with the most votes, named the way an Event reports it: by
 * title, never by Twitch's Choice id. A tie resolves to whichever Choice
 * Twitch listed first.
 */
export function winningChoiceTitle(
  choices: readonly { title: string; totalVotes: number }[],
): string {
  return (
    choices.reduce<{ title: string; totalVotes: number } | undefined>(
      (best, choice) => (!best || choice.totalVotes > best.totalVotes ? choice : best),
      undefined,
    )?.title ?? ""
  );
}
