import {
  isEditorMessage,
  testDonationProblems,
  type PluginMessage,
  type TestDonationDraft,
} from "donationalerts-protocol";

import { AccountService } from "./account/service";
import { AccountStore } from "./account/store";
import { createApi } from "./donationalerts/api";
import { openLoopback } from "./donationalerts/loopback";
import { DonationFeed } from "./donations/feed";
import {
  DONATION_RECEIVED,
  toDonationReceived,
} from "./events/donation-received";
import { GOAL_UPDATED, toGoalUpdated } from "./events/goal-updated";
import { toTestDonation } from "./events/test-donation";
import { openInBrowser } from "./open-browser";
import { plugin } from "./plugin";
import { createCentrifugeClient } from "./realtime/client";
import { RecentEvents } from "./recent/recent-events";
import { RealtimeConnection } from "./realtime/connection";
import { schedule } from "./schedule";

const api = createApi();
const recent = new RecentEvents();
const store = new AccountStore(plugin);
const account = new AccountService({
  store,
  api,
  openLoopback,
  openBrowser: openInBrowser,
  now: () => Date.now(),
  schedule,
  onChange: () => {
    follow();
    publish();
  },
});
const donations = new DonationFeed({
  api,
  fire: (data, delivery) => {
    const payload = toDonationReceived(data);

    if (!payload) {
      console.warn("A donation the plugin could not read was skipped");
      return;
    }

    // The id only: donor names and messages stay out of the log.
    console.log(
      delivery === "catch-up"
        ? `Donation ${payload.donationId} caught up`
        : `Donation ${payload.donationId} received`,
    );
    plugin.emitEvent(DONATION_RECEIVED, payload);
    recent.donation(payload, delivery);
    publish();
  },
});
const realtime = new RealtimeConnection({
  api,
  createClient: createCentrifugeClient,
  schedule,
  onDonation: (data, position) => donations.publication(data, position),
  onDonationsSubscribed: (subscribed) => void donations.subscribed(subscribed),
  onGoal: (data) => {
    const payload = toGoalUpdated(data);

    if (!payload) {
      console.warn("A goal update the plugin could not read was skipped");
      return;
    }

    console.log(`Goal ${payload.goalId} updated`);
    plugin.emitEvent(GOAL_UPDATED, payload);
    recent.goal(payload);
    publish();
  },
  onUnauthorized: () => void account.refused(),
  onChange: () => publish(),
});

/**
 * Keeps the Realtime Connection on the signed-in Account, or stops it — also
 * for an Account that is Reauthorization Required, which has no token.
 */
function follow(): void {
  const stored = store.get();
  realtime.follow(
    stored?.accessToken === undefined
      ? undefined
      : { id: stored.id, accessToken: stored.accessToken },
  );
}

/**
 * Tells every open editor how the Account stands, and Fluxta whether it is
 * connected — one External Connection, connected while the donation channel
 * is subscribed, none when signed out.
 */
function publish(): void {
  const stored = store.get();
  const state = account.state();
  const live = realtime.state();

  plugin.sendToEditor({
    event: "status",
    status: {
      account: state,
      ...(state.status === "signed-in" && live ? { realtime: live } : {}),
      recent: recent.list(),
    },
  } satisfies PluginMessage);

  plugin.setConnections(
    stored
      ? [
          {
            id: String(stored.id),
            title: stored.name,
            connected: live?.status === "connected",
          },
        ]
      : [],
  );
}

/**
 * Fires a Test Donation as Donation Received, signed in or not: nothing
 * reaches DonationAlerts.
 */
function sendTestDonation(draft: TestDonationDraft): void {
  if (Object.keys(testDonationProblems(draft)).length > 0) {
    console.warn("A test donation the editor should have refused was ignored");
    return;
  }

  console.log("Test donation sent");
  const payload = toTestDonation(draft);
  plugin.emitEvent(DONATION_RECEIVED, payload);
  recent.donation(payload, "test");
  publish();
  plugin.sendToEditor({ event: "test-donation-sent" } satisfies PluginMessage);
}

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) {
    return;
  }

  switch (message.event) {
    case "get-status":
      publish();
      return;
    case "sign-in":
      void account.startSignIn();
      return;
    case "cancel-sign-in":
      account.cancelSignIn();
      return;
    case "sign-out":
      void account.signOut();
      return;
    case "send-test-donation":
      sendTestDonation(message.donation);
      return;
  }
});

await plugin.connect();

// Settings are only readable over the authenticated connection, so the first
// firing — which the SDK guarantees fires immediately with what is already
// persisted — waits for it, and doubles as startup hydration. Later firings
// echo the store's own writes, the only writer there is.
await plugin.onPluginSettings<unknown>(async (settings) => {
  store.hydrate(settings);
  // Before anything tries the token: an Account whose Sign-in Expiry passed
  // while Fluxta was closed is Reauthorization Required.
  await account.reconcile();
  follow();
  publish();
});
