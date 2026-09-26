import { choiceTitleFields } from "./poll-choice-fields";

/**
 * The Poll Begin Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own poll
 * mechanics, if any, so a shared shape would be mostly guesswork.
 */
export const POLL_BEGIN_EVENT = "twitch-poll-begin";

/** Every field declared for `twitch-poll-begin` in the manifest. */
export type PollBeginPayload = {
  pollId: string;
  title: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  choice5: string;
};

/**
 * The parts of twurple's poll-begin event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type PollBeginSource = {
  id: string;
  title: string;
  choices: { title: string }[];
};

export function toPollBeginPayload(event: PollBeginSource): PollBeginPayload {
  return {
    pollId: event.id,
    title: event.title,
    ...choiceTitleFields(event.choices),
  };
}
