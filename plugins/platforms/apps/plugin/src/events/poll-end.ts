import {
  choiceTitleFields,
  choiceVoteFields,
  winningChoiceTitle,
} from "./poll-choice-fields";

/**
 * The Poll End Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own poll
 * mechanics, if any, so a shared shape would be mostly guesswork.
 */
export const POLL_END_EVENT = "twitch-poll-end";

/** Every field declared for `twitch-poll-end` in the manifest. */
export type PollEndPayload = {
  pollId: string;
  title: string;
  choice1: string;
  choice1Votes: number;
  choice2: string;
  choice2Votes: number;
  choice3: string;
  choice3Votes: number;
  choice4: string;
  choice4Votes: number;
  choice5: string;
  choice5Votes: number;
  /** The winning Choice's title — never Twitch's Choice id. */
  winner: string;
  /** Twitch's own status text: `completed`, `terminated`, or `archived`. */
  status: string;
};

/**
 * The parts of twurple's poll-end event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type PollEndSource = {
  id: string;
  title: string;
  choices: { title: string; totalVotes: number }[];
  status: string;
};

export function toPollEndPayload(event: PollEndSource): PollEndPayload {
  return {
    pollId: event.id,
    title: event.title,
    ...choiceTitleFields(event.choices),
    ...choiceVoteFields(event.choices),
    winner: winningChoiceTitle(event.choices),
    status: event.status,
  };
}
