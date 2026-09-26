import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  POLL_DURATION_MAX,
  POLL_DURATION_MIN,
  POLL_MAX_CHOICES,
  POLL_MIN_CHOICES,
  type StartPollSettings,
} from "platforms-protocol";

import type { PollsService } from "../polls/service";

export const START_POLL_ACTION = "twitch-start-poll";

/**
 * Starts a Poll on the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 *
 * Produces the started Poll's id as a Run Variable — not because a later step
 * needs to address the Poll (Twitch allows only one active Poll, so End Poll
 * needs no target of its own), but so a program that wants to log or relay it
 * still can.
 */
export class StartPollAction extends StandaloneAction<StartPollSettings> {
  type = START_POLL_ACTION;

  constructor(private readonly polls: PollsService) {
    super();
  }

  // Always resolves to an object — even an empty one on the paths that never
  // reach Twitch. The SDK's declared return type is a union of whole Promise
  // types (`Promise<void> | Promise<Record<...>>`), which `Promise<Record<...>
  // | undefined>` does not match even though it means the same thing.
  onTrigger = async (
    ctx: StandaloneTriggerContext<StartPollSettings>,
  ): Promise<Record<string, string>> => {
    const title = ctx.settings.title?.trim();

    if (!title) {
      console.warn("Start Poll ran with no title configured");
      return {};
    }

    const choices = readChoices(ctx.settings.choices);

    if (!choices) {
      return {};
    }

    const duration = readDuration(ctx.settings.duration);

    if (duration === undefined) {
      return {};
    }

    const pollId = await this.polls.start({ title, choices, duration });
    return pollId ? { pollId } : {};
  };
}

/** The Choices the settings ask for, or nothing when Twitch would refuse them. */
function readChoices(choices: string[] | undefined): string[] | undefined {
  const trimmed = (choices ?? [])
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);

  if (trimmed.length < POLL_MIN_CHOICES) {
    console.warn(
      `Start Poll needs at least ${POLL_MIN_CHOICES} choices; it had ${trimmed.length}`,
    );
    return undefined;
  }

  if (trimmed.length > POLL_MAX_CHOICES) {
    console.warn(`Start Poll allows at most ${POLL_MAX_CHOICES} choices; the rest were dropped`);
    return trimmed.slice(0, POLL_MAX_CHOICES);
  }

  return trimmed;
}

/**
 * The duration the settings ask for, in seconds.
 *
 * The field carries a template, so what arrives here is whatever the
 * reference resolved to — a number typed by hand, or something a run
 * variable produced.
 */
function readDuration(value: string | undefined): number | undefined {
  const text = value?.trim();

  if (!text) {
    console.warn("Start Poll ran with no duration configured");
    return undefined;
  }

  const duration = Number(text);

  if (
    !Number.isInteger(duration) ||
    duration < POLL_DURATION_MIN ||
    duration > POLL_DURATION_MAX
  ) {
    console.warn(
      `Start Poll ignored the duration "${text}": Twitch runs a poll between ` +
        `${POLL_DURATION_MIN} and ${POLL_DURATION_MAX} seconds`,
    );
    return undefined;
  }

  return duration;
}
