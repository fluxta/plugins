import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  TIMEOUT_DURATION_MAX,
  TIMEOUT_DURATION_MIN,
  type TimeoutUserSettings,
} from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const TIMEOUT_USER_ACTION = "twitch-timeout-user";

/**
 * Times a viewer out of the Channel for a limited duration.
 *
 * A separate Action from Ban Twitch User even though Twitch answers both with
 * the same request — see that Action for why.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class TimeoutUserAction extends StandaloneAction<TimeoutUserSettings> {
  type = TIMEOUT_USER_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<TimeoutUserSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Timeout User ran with no viewer chosen");
      return;
    }

    const duration = readDuration(ctx.settings.duration);

    if (duration === undefined) {
      return;
    }

    await this.moderation.timeout(login, duration, ctx.settings.reason?.trim() || undefined);
  };
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
    console.warn("Timeout User ran with no duration configured");
    return undefined;
  }

  const duration = Number(text);

  if (
    !Number.isInteger(duration) ||
    duration < TIMEOUT_DURATION_MIN ||
    duration > TIMEOUT_DURATION_MAX
  ) {
    console.warn(
      `Timeout User ignored the duration "${text}": Twitch allows between ` +
        `${TIMEOUT_DURATION_MIN} and ${TIMEOUT_DURATION_MAX} seconds`,
    );
    return undefined;
  }

  return duration;
}
