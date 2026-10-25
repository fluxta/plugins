import { z } from "zod";

import { API_BASE_URL } from "./config";

/**
 * DonationAlerts refused the token: the streamer revoked the application, or
 * the token expired. Waiting does not fix it — only a new Sign-in does.
 */
export class Unauthorized extends Error {
  constructor() {
    super("DonationAlerts no longer accepts this sign-in");
  }
}

/** The Account's identity, as `/user/oauth` reports it. */
export type DonationAlertsUser = {
  id: number;
  name: string;
  avatar: string;
  /**
   * What the Realtime Connection authenticates with. A secret like the access
   * token, and fetched afresh for every connection rather than persisted.
   */
  socketConnectionToken: string;
};

/** A private channel and the token that admits one Centrifugo client to it. */
export type ChannelToken = { channel: string; token: string };

const UserResponseSchema = z.object({
  data: z.object({
    id: z.number(),
    name: z.string(),
    avatar: z.string().nullish(),
    socket_connection_token: z.string(),
  }),
});

const SubscribeResponseSchema = z.object({
  channels: z.array(z.object({ channel: z.string(), token: z.string() })),
});

/**
 * Only the list's shape and each entry's id are checked here; an entry is
 * read as a Donation by the same mapping as a publication, which has the
 * same fields.
 */
const DonationListSchema = z.object({
  data: z.array(z.looseObject({ id: z.number() })),
});

/** One entry of the donation list, as DonationAlerts sent it. */
export type ListedDonation = { id: number; data: unknown };

export type DonationAlertsApi = {
  getUser(accessToken: string): Promise<DonationAlertsUser>;
  /**
   * Tokens for the Account's private channels, valid only for the Centrifugo
   * client `client` — every reconnect has a new one, so a new call.
   */
  subscribeChannels(
    accessToken: string,
    request: { client: string; channels: string[] },
  ): Promise<ChannelToken[]>;
  /** The first page of the Account's donations, newest first (30 of them). */
  listDonations(accessToken: string): Promise<ListedDonation[]>;
};

/**
 * The REST calls the plugin makes — the only code that calls `fetch`.
 *
 * The token travels in the Authorization header, never in the URL, so an
 * error message built from the URL or the status cannot leak it.
 */
export function createApi(fetchImpl: typeof fetch = fetch): DonationAlertsApi {
  async function call(
    path: string,
    accessToken: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetchImpl(`${API_BASE_URL}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error("DonationAlerts could not be reached");
    }

    if (response.status === 401) {
      throw new Unauthorized();
    }

    if (!response.ok) {
      throw new Error(`DonationAlerts answered ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("DonationAlerts answered with something other than JSON");
    }
  }

  return {
    async getUser(accessToken) {
      const parsed = UserResponseSchema.safeParse(
        await call("/user/oauth", accessToken),
      );

      if (!parsed.success) {
        throw new Error(
          "DonationAlerts returned an account the plugin does not understand",
        );
      }

      const { id, name, avatar, socket_connection_token } = parsed.data.data;
      return {
        id,
        name,
        avatar: avatar ?? "",
        socketConnectionToken: socket_connection_token,
      };
    },

    async subscribeChannels(accessToken, request) {
      const parsed = SubscribeResponseSchema.safeParse(
        await call("/centrifuge/subscribe", accessToken, request),
      );

      if (!parsed.success) {
        throw new Error(
          "DonationAlerts returned channel tokens the plugin does not understand",
        );
      }

      return parsed.data.channels;
    },

    async listDonations(accessToken) {
      const parsed = DonationListSchema.safeParse(
        await call("/alerts/donations", accessToken),
      );

      if (!parsed.success) {
        throw new Error(
          "DonationAlerts returned a donation list the plugin does not understand",
        );
      }

      return parsed.data.data.map((entry) => ({ id: entry.id, data: entry }));
    },
  };
}
