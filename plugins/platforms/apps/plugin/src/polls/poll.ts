import type { HelixCreatePollData } from "@twurple/api";

/** A Poll ready to send to Twitch, already validated by the Action. */
export type PollDraft = {
  title: string;
  /** Twitch requires between two and five. */
  choices: string[];
  /** Seconds the poll runs for. Twitch's range is 15–1800. */
  duration: number;
};

/**
 * The parts of twurple's `HelixPoll` this service reads.
 *
 * Narrowed to an own type so the service can be exercised without a live
 * poll, which is the only thing twurple's class can be built from.
 */
export type PollSource = {
  id: string;
  title: string;
  status: string;
  choices: { title: string }[];
};

/** What twurple's `createPoll` call takes, built from a draft. */
export function toCreatePollData(draft: PollDraft): HelixCreatePollData {
  return {
    title: draft.title,
    choices: draft.choices,
    duration: draft.duration,
  };
}
