import { ApiClient } from "@twurple/api";
import {
  getExpiryDateOfAccessToken,
  getTokenInfo,
  StaticAuthProvider,
  type AccessToken,
} from "@twurple/auth";
import {
  ACCOUNT_ROLES,
  type AccountRole,
  type AccountState,
  type AccountsState,
} from "platforms-protocol";

import { openInBrowser } from "../open-browser";
import { AccountAuthProvider, type TokenSource } from "../twitch/auth-provider";
import { CLIENT_ID, hasRequiredScopes } from "../twitch/config";
import {
  AuthorizationRejected,
  pollForToken,
  refreshAccessToken,
  startDeviceAuthorization,
} from "../twitch/oauth";

import type { SettingsStore, StoredAccount } from "./store";

/** Refresh this long before a token actually expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** How each Account slot is named in the desktop's External Connections list. */
const ROLE_TITLE: Record<AccountRole, string> = {
  broadcaster: "Broadcaster",
  bot: "Bot",
};

/**
 * Owns both Account slots: their persisted tokens, their sign-in flows, and
 * the state the editor renders.
 *
 * It is also the plugin's {@link TokenSource} — everything that talks to
 * Twitch goes through {@link authProvider}, so tokens are refreshed in exactly
 * one place.
 */
export class AccountsService implements TokenSource {
  private readonly states = new Map<AccountRole, AccountState>();
  private readonly authorizations = new Map<AccountRole, AbortController>();
  private readonly refreshTimers = new Map<AccountRole, NodeJS.Timeout>();

  /** Hand this to twurple's `ApiClient` and `EventSubWsListener`. */
  readonly authProvider = new AccountAuthProvider(this);

  constructor(
    private readonly store: SettingsStore,
    private readonly onChange: () => void,
  ) {
    for (const role of ACCOUNT_ROLES) {
      this.states.set(role, { status: "disconnected" });
    }
  }

  snapshot(): AccountsState {
    return {
      broadcaster: this.states.get("broadcaster") ?? { status: "disconnected" },
      bot: this.states.get("bot") ?? { status: "disconnected" },
    };
  }

  /**
   * The Twitch Accounts as {@link Plugin.setConnections} wants them: one per
   * slot, in a stable order, regardless of whether it is connected — an
   * unconfigured Bot still reports as not connected rather than disappearing
   * from the desktop's connections indicator. The `id` is the role, which
   * never changes; the `title` carries the login once connected, so the
   * indicator names *whose* Twitch account it is.
   */
  externalConnections(): { id: string; title: string; connected: boolean }[] {
    return ACCOUNT_ROLES.map((role) => {
      const state = this.states.get(role);
      const label = `Twitch — ${ROLE_TITLE[role]}`;

      return {
        id: role,
        title: label,
        connected: state?.status === "connected",
      };
    });
  }

  /** The Twitch user id of a connected Account, if it is connected. */
  userId(role: AccountRole): string | undefined {
    const stored = this.store.get(role);
    return stored?.tokens ? stored.userId : undefined;
  }

  /** The login of a connected Account, if it is connected. */
  login(role: AccountRole): string | undefined {
    const stored = this.store.get(role);
    return stored?.tokens ? stored.login : undefined;
  }

  /** Restores both slots from the already-loaded settings. */
  async start(): Promise<void> {
    await Promise.all(ACCOUNT_ROLES.map((role) => this.restore(role)));
  }

  /** Runs the Device Code Flow for one slot until it succeeds or gives up. */
  async connect(role: AccountRole): Promise<void> {
    this.cancel(role);

    const abort = new AbortController();
    this.authorizations.set(role, abort);

    try {
      const authorization = await startDeviceAuthorization(role);

      this.set(role, {
        status: "authorizing",
        userCode: authorization.userCode,
        verificationUri: authorization.verificationUri,
        expiresAt: authorization.expiresAt,
      });

      // The address already carries the code, so a user whose browser opens
      // has nothing to type.
      openInBrowser(authorization.verificationUri);

      const tokens = await this.poll(role, authorization, abort.signal);

      if (tokens) {
        await this.adopt(role, tokens);
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        this.fail(role, error);
      }
    } finally {
      if (this.authorizations.get(role) === abort) {
        this.authorizations.delete(role);
      }
    }
  }

  /** Abandons an in-flight sign-in and returns the slot to where it was. */
  cancel(role: AccountRole): void {
    const abort = this.authorizations.get(role);

    if (!abort) {
      return;
    }

    abort.abort();
    this.authorizations.delete(role);
    this.set(role, describeStored(this.store.get(role)));
  }

  /** Forgets an Account, tokens and all. */
  async disconnect(role: AccountRole): Promise<void> {
    this.cancel(role);
    this.clearRefresh(role);
    await this.store.saveAccount(role, undefined);
    this.set(role, { status: "disconnected" });
  }

  // --- TokenSource, for the AuthProvider ---------------------------------

  async tokenForUser(userId: string): Promise<AccessToken | undefined> {
    const role = this.roleOf(userId);
    return role ? this.freshToken(role) : undefined;
  }

  scopesForUser(userId: string): string[] {
    const role = this.roleOf(userId);
    return role ? (this.store.get(role)?.tokens?.scope ?? []) : [];
  }

  async refreshForUser(userId: string): Promise<AccessToken | undefined> {
    const role = this.roleOf(userId);
    const stored = role ? this.store.get(role) : undefined;
    return role && stored ? this.refresh(role, stored) : undefined;
  }

  // -----------------------------------------------------------------------

  /** The token for a slot, refreshed if it is close to expiring. */
  private async freshToken(role: AccountRole): Promise<AccessToken | undefined> {
    const stored = this.store.get(role);

    if (!stored?.tokens) {
      return undefined;
    }

    return expiresSoon(stored.tokens) ? this.refresh(role, stored) : stored.tokens;
  }

  private roleOf(userId: string): AccountRole | undefined {
    return ACCOUNT_ROLES.find((role) => this.store.get(role)?.userId === userId);
  }

  private async restore(role: AccountRole): Promise<void> {
    const stored = this.store.get(role);

    if (!stored) {
      return;
    }

    if (!stored.tokens) {
      // Said out loud: otherwise a plugin that starts up and does nothing
      // looks broken rather than signed out.
      console.log(`The ${role} account (${stored.login}) needs to sign in again`);
      this.set(role, { status: "reauthorization-required", login: stored.login });
      return;
    }

    if (!hasRequiredScopes(role, stored.tokens.scope)) {
      // A feature shipped after this Account last signed in and asks for a
      // scope its token does not have. Twitch would refuse the calls that
      // need it one by one; asking again up front is the only way back to a
      // token that covers everything the plugin does.
      console.log(
        `The ${role} account (${stored.login}) is missing a scope this version needs; sign in again`,
      );
      this.set(role, { status: "reauthorization-required", login: stored.login });
      return;
    }

    this.set(role, connectedState(stored));

    // Refresh eagerly on start rather than waiting for the first use, so a
    // dead token surfaces in the editor immediately instead of at the worst
    // possible moment mid-stream.
    if (expiresSoon(stored.tokens)) {
      await this.refresh(role, stored);
    } else {
      this.scheduleRefresh(role, stored.tokens);
    }
  }

  private async poll(
    role: AccountRole,
    authorization: { deviceCode: string; expiresAt: number; intervalSeconds: number },
    signal: AbortSignal,
  ): Promise<AccessToken | undefined> {
    while (!signal.aborted) {
      if (Date.now() >= authorization.expiresAt) {
        this.set(role, {
          status: "error",
          message: "The sign-in code expired before it was confirmed. Try again.",
        });
        return undefined;
      }

      await delay(authorization.intervalSeconds * 1000, signal);

      if (signal.aborted) {
        return undefined;
      }

      const result = await pollForToken(role, authorization.deviceCode);

      if (result.state === "granted") {
        return result.tokens;
      }
    }

    return undefined;
  }

  /** Records a freshly granted token against the Twitch identity behind it. */
  private async adopt(role: AccountRole, tokens: AccessToken): Promise<void> {
    const info = await getTokenInfo(tokens.accessToken, CLIENT_ID);

    if (!info.userId || !info.userName) {
      throw new Error("Twitch validated a token with no user attached");
    }

    const stored: StoredAccount = {
      userId: info.userId,
      login: info.userName,
      displayName: await this.lookUpDisplayName(tokens, info.userId, info.userName),
      tokens,
    };

    await this.store.saveAccount(role, stored);
    this.set(role, connectedState(stored));
    this.scheduleRefresh(role, tokens);
    console.log(`Connected the ${role} account as ${stored.login}`);
  }

  /**
   * The name Twitch shows, which differs from the login for anyone using
   * capitals or a non-latin alphabet. A one-off client is used because the
   * Account is not stored yet, so the shared provider cannot serve it.
   */
  private async lookUpDisplayName(
    tokens: AccessToken,
    userId: string,
    login: string,
  ): Promise<string> {
    try {
      const api = new ApiClient({
        authProvider: new StaticAuthProvider(CLIENT_ID, tokens.accessToken, tokens.scope),
      });
      const user = await api.users.getUserById(userId);
      return user?.displayName ?? login;
    } catch {
      // Cosmetic — never worth failing a sign-in over.
      return login;
    }
  }

  private async refresh(
    role: AccountRole,
    stored: StoredAccount,
  ): Promise<AccessToken | undefined> {
    if (!stored.tokens?.refreshToken) {
      return undefined;
    }

    try {
      const tokens = await refreshAccessToken(stored.tokens.refreshToken);

      // Twitch invalidates the old refresh token the moment this succeeds, so
      // the new pair is persisted before anything else can use it.
      await this.store.saveAccount(role, { ...stored, tokens });
      this.set(role, connectedState(stored));
      this.scheduleRefresh(role, tokens);
      return tokens;
    } catch (error) {
      if (error instanceof AuthorizationRejected) {
        // Expected after 30 days without a stream — not a failure to report as
        // one. Keep the identity so the editor can name the account.
        await this.store.saveAccount(role, { ...stored, tokens: undefined });
        this.clearRefresh(role);
        this.set(role, { status: "reauthorization-required", login: stored.login });
        console.log(`The ${role} account needs to sign in again`);
        return undefined;
      }

      this.fail(role, error);
      return undefined;
    }
  }

  private scheduleRefresh(role: AccountRole, tokens: AccessToken): void {
    this.clearRefresh(role);

    const expiry = getExpiryDateOfAccessToken(tokens);

    if (!expiry) {
      return;
    }

    const delayMs = Math.max(expiry.getTime() - REFRESH_MARGIN_MS - Date.now(), 1000);
    const timer = setTimeout(() => {
      const stored = this.store.get(role);
      if (stored) {
        void this.refresh(role, stored);
      }
    }, delayMs);

    // A pending refresh must not be what keeps the process alive.
    timer.unref();
    this.refreshTimers.set(role, timer);
  }

  private clearRefresh(role: AccountRole): void {
    const timer = this.refreshTimers.get(role);

    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(role);
    }
  }

  private fail(role: AccountRole, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`The ${role} account could not be connected: ${message}`);
    this.set(role, { status: "error", message });
  }

  private set(role: AccountRole, state: AccountState): void {
    this.states.set(role, state);
    this.onChange();
  }
}

function connectedState(stored: StoredAccount): AccountState {
  return { status: "connected", login: stored.login, displayName: stored.displayName };
}

function describeStored(stored: StoredAccount | undefined): AccountState {
  if (!stored) {
    return { status: "disconnected" };
  }

  return stored.tokens
    ? connectedState(stored)
    : { status: "reauthorization-required", login: stored.login };
}

/** twurple's expiry already carries a one-minute grace; this adds our margin. */
function expiresSoon(tokens: AccessToken): boolean {
  const expiry = getExpiryDateOfAccessToken(tokens);
  return expiry ? expiry.getTime() - REFRESH_MARGIN_MS <= Date.now() : false;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
