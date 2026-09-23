import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SendAnnouncementSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const SEND_ANNOUNCEMENT_ACTION = "twitch-send-announcement";

/**
 * Sends an Announcement to the Channel's chat — a highlighted message,
 * unlike a plain one from Send Chat Message.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class SendAnnouncementAction extends StandaloneAction<SendAnnouncementSettings> {
  type = SEND_ANNOUNCEMENT_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SendAnnouncementSettings>): Promise<void> => {
    const message = ctx.settings.message?.trim();

    if (!message) {
      console.warn("Send Announcement ran with no message configured");
      return;
    }

    await this.moderation.sendAnnouncement(message, ctx.settings.color);
  };
}
