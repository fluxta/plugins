import { randomBytes } from "node:crypto";

import type { AccountState } from "donationalerts-protocol";

import type { DonationAlertsApi } from "../donationalerts/api";
import {
  authorizeUrl,
  LOOPBACK_PORT,
  SIGN_IN_TIMEOUT_MS,
} from "../donationalerts/config";
import {
  PortInUse,
  type Loopback,
  type SignInAnswer,
} from "../donationalerts/loopback";
import type { Schedule } from "../schedule";
import type { AccountStore } from "./store";

export type AccountServiceDeps = {
  store: AccountStore;
  api: DonationAlertsApi;
  openLoopback(options: { port: number; state: string }): Promise<Loopback>;
  openBrowser(url: string): void;
  now(): number;
  schedule: Schedule;
  /** Called whenever what `state()` returns may have changed. */
  onChange(): void;
};

type Outcome = SignInAnswer | { kind: "timeout" } | { kind: "cancelled" };

/**
 * The longest wait a timer can hold: Node fires a `setTimeout` beyond 2^31-1
 * ms (about 24.8 days) almost at once, and a Sign-in Expiry is a year away.
 * Longer waits are taken in steps of this.
 */
export const MAX_TIMER_MS = 2 ** 31 - 1;

type SignIn = {
  authorizeUrl: string;
  end(outcome: Outcome): void;
};

/**
 * The Account and its Sign-in.
 *
 * A Sign-in runs from the editor's press to the browser coming back, or to
 * its timeout or cancellation. Signing in while signed in, or while
 * Reauthorization Required, replaces the Account once the new Sign-in
 * succeeds; until then the old one stays.
 *
 * DonationAlerts gives no refresh token, so a token is good until its
 * Sign-in Expiry. The service drops it then, on its own — after a restart or
 * while running, without asking DonationAlerts — and when DonationAlerts
 * refuses it earlier (`refused`).
 */
export class AccountService {
  private signIn: SignIn | undefined;
  /** Why the last Sign-in failed, until the next one starts. */
  private problem: string | undefined;
  private cancelExpiry: (() => void) | undefined;

  constructor(private readonly deps: AccountServiceDeps) {}

  state(): AccountState {
    if (this.signIn) {
      return { status: "signing-in", authorizeUrl: this.signIn.authorizeUrl };
    }

    const account = this.deps.store.get();

    if (account?.accessToken !== undefined) {
      return {
        status: "signed-in",
        name: account.name,
        avatar: account.avatar,
        expiresAt: account.expiresAt,
      };
    }

    if (account) {
      return {
        status: "reauthorization-required",
        name: account.name,
        avatar: account.avatar,
        reason: account.expiresAt <= this.deps.now() ? "expired" : "refused",
        expiresAt: account.expiresAt,
      };
    }

    return this.problem === undefined
      ? { status: "signed-out" }
      : { status: "signed-out", problem: this.problem };
  }

  async startSignIn(): Promise<void> {
    if (this.signIn) {
      // A second press while waiting means the browser did not come up, or
      // its tab was closed: show the consent screen again.
      this.deps.openBrowser(this.signIn.authorizeUrl);
      return;
    }

    this.problem = undefined;
    const state = randomBytes(16).toString("hex");
    const url = authorizeUrl(state);

    let loopback: Loopback;

    try {
      loopback = await this.deps.openLoopback({ port: LOOPBACK_PORT, state });
    } catch (error) {
      this.problem =
        error instanceof PortInUse
          ? `Port ${error.port} is in use by another program. Close it and sign in again.`
          : `The sign-in could not start: ${describe(error)}`;
      this.deps.onChange();
      return;
    }

    const outcome = await new Promise<Outcome>((resolve) => {
      const cancelTimeout = this.deps.schedule(SIGN_IN_TIMEOUT_MS, () =>
        resolve({ kind: "timeout" }),
      );
      const end = (result: Outcome) => {
        cancelTimeout();
        resolve(result);
      };

      this.signIn = { authorizeUrl: url, end };
      void loopback.answer.then(end);

      this.deps.onChange();
      this.deps.openBrowser(url);
    });

    loopback.close();
    // The moment of Sign-in, for its expiry: when the token arrived.
    const signedInAt = this.deps.now();
    await this.finish(outcome, signedInAt);
    this.signIn = undefined;
    this.deps.onChange();
  }

  /**
   * Holds the stored Account to its Sign-in Expiry: drops a token already
   * past it, and waits for the expiry of one that is not. Called whenever
   * the stored Account may have changed; safe to call again.
   */
  async reconcile(): Promise<void> {
    this.cancelExpiry?.();
    this.cancelExpiry = undefined;

    const account = this.deps.store.get();

    if (account?.accessToken === undefined) {
      return;
    }

    const remaining = account.expiresAt - this.deps.now();

    if (remaining <= 0) {
      await this.deps.store.dropToken();
      console.log("The DonationAlerts sign-in expired; sign in again");
      this.deps.onChange();
      return;
    }

    this.cancelExpiry = this.deps.schedule(
      Math.min(remaining, MAX_TIMER_MS),
      () => void this.reconcile(),
    );
  }

  /** DonationAlerts refused the Account's token: it needs a new Sign-in. */
  async refused(): Promise<void> {
    if (this.deps.store.get()?.accessToken === undefined) {
      return;
    }

    this.cancelExpiry?.();
    this.cancelExpiry = undefined;
    await this.deps.store.dropToken();
    console.log("DonationAlerts no longer accepts the sign-in; sign in again");
    this.deps.onChange();
  }

  cancelSignIn(): void {
    this.signIn?.end({ kind: "cancelled" });
  }

  async signOut(): Promise<void> {
    this.cancelSignIn();
    this.cancelExpiry?.();
    this.cancelExpiry = undefined;
    this.problem = undefined;
    await this.deps.store.clear();
    console.log("Signed out of DonationAlerts");
    this.deps.onChange();
  }

  private async finish(outcome: Outcome, signedInAt: number): Promise<void> {
    switch (outcome.kind) {
      case "token": {
        try {
          const user = await this.deps.api.getUser(outcome.accessToken);
          // Listed field by field: the user also carries the socket token,
          // which is fetched afresh for every connection and never persisted.
          await this.deps.store.save({
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            accessToken: outcome.accessToken,
            expiresAt: signedInAt + outcome.expiresIn * 1000,
          });
          console.log(`Signed in to DonationAlerts as user ${user.id}`);
          await this.reconcile();
        } catch (error) {
          this.problem = `DonationAlerts did not return the account: ${describe(error)}`;
        }
        return;
      }

      case "denied":
        this.problem = `DonationAlerts did not grant access (${outcome.reason}).`;
        return;

      case "malformed":
        this.problem =
          "DonationAlerts answered the sign-in in a way the plugin does not understand.";
        return;

      case "timeout":
        this.problem =
          "No answer from the browser within 5 minutes. Sign in again.";
        return;

      case "cancelled":
        return;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
