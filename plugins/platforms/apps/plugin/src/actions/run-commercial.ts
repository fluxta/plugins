import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  COMMERCIAL_LENGTHS,
  type CommercialLength,
  type RunCommercialSettings,
} from "platforms-protocol";

import type { ChannelService } from "../channel/service";

export const RUN_COMMERCIAL_ACTION = "twitch-run-commercial";

/**
 * Runs a commercial break on the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class RunCommercialAction extends StandaloneAction<RunCommercialSettings> {
  type = RUN_COMMERCIAL_ACTION;

  constructor(private readonly channel: ChannelService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<RunCommercialSettings>): Promise<void> => {
    const length = readLength(ctx.settings.length);

    if (length === undefined) {
      return;
    }

    await this.channel.runCommercial(length);
  };
}

/**
 * The commercial length the settings ask for, in seconds.
 *
 * The field carries a template, so what arrives here is whatever the
 * reference resolved to — a number typed by hand, or something a run
 * variable produced. Twitch accepts only `COMMERCIAL_LENGTHS`, not any
 * number of seconds.
 */
function readLength(value: string | undefined): CommercialLength | undefined {
  const text = value?.trim();

  if (!text) {
    console.warn("Run Commercial ran with no length configured");
    return undefined;
  }

  const length = Number(text);
  const allowed = COMMERCIAL_LENGTHS.find((seconds) => seconds === length);

  if (allowed === undefined) {
    console.warn(
      `Run Commercial ignored the length "${text}": Twitch only accepts ` +
        `${COMMERCIAL_LENGTHS.join(", ")} seconds`,
    );
    return undefined;
  }

  return allowed;
}
