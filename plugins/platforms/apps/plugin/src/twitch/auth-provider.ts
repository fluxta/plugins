import type { AccessToken, AccessTokenMaybeWithUserId, AccessTokenWithUserId, AuthProvider } from "@twurple/auth";

import { CLIENT_ID } from "./config";

/** What the provider needs from whoever owns the tokens. */
export interface TokenSource {
  /** The stored token for a user, refreshed if it is close to expiring. */
  tokenForUser(userId: string): Promise<AccessToken | undefined>;
  /** The scopes that user's token was granted. */
  scopesForUser(userId: string): string[];
  /** Forces a refresh regardless of expiry, for when Twitch rejects a token. */
  refreshForUser(userId: string): Promise<AccessToken | undefined>;
}

/**
 * Feeds twurple's `ApiClient` and `EventSubWsListener` from the Accounts the
 * plugin holds.
 *
 * twurple's own `RefreshingAuthProvider` cannot be used: it refreshes through
 * `refreshUserToken`, which requires a client secret this public client does
 * not have. Refreshing therefore stays with the Accounts, and this
 * class is the adapter onto it.
 */
export class AccountAuthProvider implements AuthProvider {
  readonly clientId = CLIENT_ID;

  constructor(private readonly accounts: TokenSource) {}

  getCurrentScopesForUser(user: UserIdResolvableLike): string[] {
    return this.accounts.scopesForUser(idOf(user));
  }

  async getAccessTokenForUser(user: UserIdResolvableLike): Promise<AccessTokenWithUserId | null> {
    const userId = idOf(user);
    const token = await this.accounts.tokenForUser(userId);
    return token ? { ...token, userId } : null;
  }

  async getAnyAccessToken(user?: UserIdResolvableLike): Promise<AccessTokenMaybeWithUserId> {
    if (!user) {
      // There is no app access token here: getting one needs a client secret,
      // so every call has to be made as one of the connected users.
      throw new Error("Platforms has no app access token; a user must be given");
    }

    const token = await this.getAccessTokenForUser(user);

    if (!token) {
      throw new Error("That Twitch account is not connected");
    }

    return token;
  }

  async refreshAccessTokenForUser(user: UserIdResolvableLike): Promise<AccessTokenWithUserId> {
    const userId = idOf(user);
    const token = await this.accounts.refreshForUser(userId);

    if (!token) {
      throw new Error("That Twitch account needs to sign in again");
    }

    return { ...token, userId };
  }
}

/**
 * twurple accepts an id, or any object carrying one. Narrowed here rather than
 * pulling in its `UserIdResolvable` helper for three call sites.
 */
type UserIdResolvableLike = string | number | { id: string };

function idOf(user: UserIdResolvableLike): string {
  return typeof user === "object" ? user.id : String(user);
}
