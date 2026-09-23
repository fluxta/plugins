import type { CommercialLength } from "platforms-protocol";

/** What Twitch's Modify Channel Information endpoint accepts. */
export interface ChannelInfoUpdate {
  title?: string;
  gameId?: string;
  tags?: string[];
}

/** What the plugin needs back from a Twitch user or category lookup. */
export interface ChannelTarget {
  id: string;
  displayName: string;
}

export interface GameTarget {
  id: string;
}

/**
 * The parts of twurple's channels, raids, games and users APIs this plugin
 * uses to control the Channel itself.
 *
 * Narrowed to an own type, spanning four of twurple's own namespaces, so
 * everything built on it can be exercised without a live `ApiClient`, which
 * only a connected Account can produce.
 */
export interface ChannelApi {
  updateChannelInfo(broadcaster: string, data: ChannelInfoUpdate): Promise<void>;
  /** Twitch's category endpoint has no "by name" filter on the update itself — every category change needs the id first. */
  getGameByName(name: string): Promise<GameTarget | null>;
  /** Twitch has no "raid by login" endpoint — every write needs the numeric id first. */
  getUserByName(login: string): Promise<ChannelTarget | null>;
  startRaid(from: string, to: string): Promise<unknown>;
  cancelRaid(from: string): Promise<void>;
  startChannelCommercial(broadcaster: string, length: CommercialLength): Promise<void>;
}
