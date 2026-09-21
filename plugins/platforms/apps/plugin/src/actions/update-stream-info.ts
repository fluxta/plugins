import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import { CHANNEL_TAGS_MAX, type UpdateStreamInfoSettings } from "platforms-protocol";

import type { ChannelService } from "../channel/service";

export const UPDATE_STREAM_INFO_ACTION = "twitch-update-stream-info";

/**
 * Changes the Channel's title, category and/or Tags.
 *
 * One Action rather than three, because it is one request to Twitch — see
 * Update Reward for the same trade-off. Each field left empty is left alone
 * rather than cleared.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class UpdateStreamInfoAction extends StandaloneAction<UpdateStreamInfoSettings> {
  type = UPDATE_STREAM_INFO_ACTION;

  constructor(private readonly channel: ChannelService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<UpdateStreamInfoSettings>): Promise<void> => {
    const title = ctx.settings.title?.trim() || undefined;
    const category = ctx.settings.category?.trim() || undefined;
    const tags = readTags(ctx.settings.tags);

    if (title === undefined && category === undefined && tags === undefined) {
      console.warn("Update Stream Info ran with nothing to change");
      return;
    }

    await this.channel.updateInfo({ title, category, tags });
  };
}

/**
 * The Tags the settings ask for, split on commas.
 *
 * The field carries a template, so what arrives here is whatever the
 * reference resolved to. Empty means the field asked for nothing, which
 * leaves the channel's Tags alone rather than clearing them.
 */
function readTags(value: string | undefined): string[] | undefined {
  const tags = (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  if (tags.length === 0) {
    return undefined;
  }

  if (tags.length > CHANNEL_TAGS_MAX) {
    console.warn(
      `Update Stream Info allows at most ${CHANNEL_TAGS_MAX} tags; the rest were dropped`,
    );
    return tags.slice(0, CHANNEL_TAGS_MAX);
  }

  return tags;
}
