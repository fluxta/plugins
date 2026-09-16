import { ApiClient } from "@twurple/api";
import {
  isEditorMessage,
  validateCommand,
  type Command,
  type PluginMessage,
} from "platforms-protocol";

import { AccountsService } from "./accounts/service";
import { SettingsStore } from "./accounts/store";
import { CancelPredictionAction } from "./actions/cancel-prediction";
import { EndPollAction } from "./actions/end-poll";
import { LockPredictionAction } from "./actions/lock-prediction";
import { ResolvePredictionAction } from "./actions/resolve-prediction";
import { ResolveRedemptionAction } from "./actions/resolve-redemption";
import { SendMessageAction } from "./actions/send-message";
import { StartPollAction } from "./actions/start-poll";
import { StartPredictionAction } from "./actions/start-prediction";
import { UpdateRewardAction } from "./actions/update-reward";
import { OutgoingMessages } from "./chat/outgoing";
import { ChatSender } from "./chat/sender";
import { CommandService } from "./commands/service";
import { PLATFORMS } from "./events/command-triggered";
import {
  IS_LIVE_CHANGED_EVENT,
  toIsLiveChangedPayload,
} from "./events/is-live-changed";
import {
  toViewerCountChangedPayload,
  VIEWER_COUNT_CHANGED_EVENT,
} from "./events/viewer-count-changed";
import { readManifestVersion } from "./manifest";
import { plugin } from "./plugin";
import { PollsService } from "./polls/service";
import { PredictionsService } from "./predictions/service";
import { RewardsService } from "./rewards/service";
import { StreamStatusService } from "./stream/service";
import { EventSubService } from "./twitch/eventsub";

const version = await readManifestVersion();

const store = new SettingsStore();

const accounts = new AccountsService(store, () => {
  // Subscriptions, Rewards and the stream's live status all follow the
  // Broadcaster Account, so every Account change is a chance for them to
  // appear or go away.
  events.sync();
  rewards.sync();
  void stream.sync();
  publish();
});

// Shared by the sender and the listener, so the plugin can recognise its own
// messages coming back.
const outgoing = new OutgoingMessages();

const commands = new CommandService(
  () => store.commands(),
  (type, payload) => plugin.emitEvent(type, payload),
);
const stream = new StreamStatusService(
  () => accounts.userId("broadcaster"),
  new ApiClient({ authProvider: accounts.authProvider }).streams,
);
const events = new EventSubService(accounts, outgoing, commands, stream, () =>
  publish(),
);
const rewards = new RewardsService(
  () => accounts.userId("broadcaster"),
  new ApiClient({ authProvider: accounts.authProvider }).channelPoints,
  () => publish(),
);
const polls = new PollsService(
  () => accounts.userId("broadcaster"),
  new ApiClient({ authProvider: accounts.authProvider }).polls,
);
const predictions = new PredictionsService(
  () => accounts.userId("broadcaster"),
  new ApiClient({ authProvider: accounts.authProvider }).predictions,
);
const sender = new ChatSender(accounts, outgoing);

plugin.registerAction(new SendMessageAction(sender));
plugin.registerAction(new UpdateRewardAction(rewards));
plugin.registerAction(new ResolveRedemptionAction(rewards));
plugin.registerAction(new StartPollAction(polls));
plugin.registerAction(new EndPollAction(polls));
plugin.registerAction(new StartPredictionAction(predictions));
plugin.registerAction(new LockPredictionAction(predictions));
plugin.registerAction(new ResolvePredictionAction(predictions));
plugin.registerAction(new CancelPredictionAction(predictions));

plugin.registerOptions({
  key: "rewards",
  resolve: () => {
    const state = rewards.snapshot();
    if (state.status !== "ready") return [];
    return state.rewards.map((reward) => ({
      value: reward.id,
      label: reward.title,
    }));
  },
});

// Backs the `command-triggered` Event's `commandId` filter (manifest.json).
// The value is the Command's stable `id`, not its `name`: a rename must not
// silently detach an already-configured filter, so the filter binds to the
// id — matching what `toCommandTriggeredPayload` puts in `commandId` — and
// only the dropdown's label follows the current name.
plugin.registerOptions({
  key: "commands",
  resolve: () =>
    store.commands().map((command) => ({
      value: command.id,
      label: command.name,
    })),
});

// Backs the `command-triggered` Event's `platform` filter (manifest.json).
// Static rather than read off any live state — `PLATFORMS` is the fixed set
// of platforms this plugin can fire Commands from.
plugin.registerOptions({
  key: "platforms",
  resolve: () => PLATFORMS.map(({ value, label }) => ({ value, label })),
});

// `is-live` and `viewer-count` are channel-wide, so every itemId reads the
// same answer — there is nothing to key per-Item state by. `??` turns "no
// Broadcaster Account" (`undefined`, not valid over the wire) into `null`,
// which the host treats as absent: the condition falls to its `else` branch
// rather than reading a stale or made-up value.
plugin.registerSource({
  key: "twitchIsLive",
  resolve: () => stream.isLive() ?? null,
});

plugin.registerSource({
  key: "twitchViewerCount",
  resolve: () => stream.viewerCount() ?? null,
});

// Fires the Is Live Changed and Viewer Count Changed Events. Neither hook
// runs without a channel id already known — `StreamStatusService` only calls
// them once a Broadcaster Account is tracked — but the guard is kept anyway,
// since an Event with no channel to name is worse than one that stays quiet.
stream.onLiveChange((isLive) => {
  plugin.emitEvent(IS_LIVE_CHANGED_EVENT, toIsLiveChangedPayload(isLive));
});

stream.onViewerCountChange((viewerCount) => {
  plugin.emitEvent(
    VIEWER_COUNT_CHANGED_EVENT,
    toViewerCountChangedPayload(viewerCount),
  );
});

function publish(): void {
  const message: PluginMessage = {
    event: "status",
    status: {
      version,
      accounts: accounts.snapshot(),
      events: events.snapshot(),
      commands: store.commands(),
      rewards: rewards.snapshot(),
    },
  };
  plugin.sendToEditor(message);
}

// Attached before connecting, so nothing is missed once the authenticated
// handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) {
    return;
  }

  switch (message.event) {
    case "get-status":
      publish();
      return;
    case "connect-account":
      void accounts.connect(message.role);
      return;
    case "cancel-authorization":
      accounts.cancel(message.role);
      return;
    case "disconnect-account":
      void accounts.disconnect(message.role);
      return;
    case "save-command":
      void saveCommand(message.command);
      return;
    case "delete-command":
      void deleteCommand(message.id);
      return;
    case "refresh-rewards":
      void rewards.refresh();
      return;
    case "create-reward":
      void writeReward(() => rewards.create(message.reward));
      return;
    case "update-reward":
      void writeReward(() => rewards.update(message.id, message.reward));
      return;
    case "delete-reward":
      void writeReward(() => rewards.remove(message.id));
      return;
  }
});

/**
 * Runs a Reward write and tells the editor when Twitch would not have it.
 *
 * Twitch is the authority on what a Reward may be — a duplicate title, a cost
 * of nothing, a Reward another app created — so a refusal is news the editor
 * has no way to work out for itself.
 */
async function writeReward(
  attempt: () => Promise<string | undefined>,
): Promise<void> {
  const refusal = await attempt();

  if (refusal) {
    plugin.sendToEditor({
      event: "reward-refused",
      message: refusal,
    } satisfies PluginMessage);
  }
}

async function saveCommand(command: Command): Promise<void> {
  const refusal = validateCommand(command, store.commands());

  if (refusal) {
    // The editor checks the same rule before sending, so this only catches a
    // stale editor. Refusing here keeps the stored list coherent either way.
    console.error(`Refused to save the command "${command.name}": ${refusal}`);
    return;
  }

  await store.saveCommand(command);
  publish();
}

async function deleteCommand(id: string): Promise<void> {
  await store.deleteCommand(id);
  // A new Command could reuse the id, and it must not inherit a cooldown.
  commands.forget(id);
  publish();
}

await plugin.connect();

console.log(`Platforms ${version} connected`);

// Settings are only readable over the authenticated connection, so loading
// them waits for it.
await store.load();
await accounts.start();
events.sync();
rewards.sync();
void stream.sync();

// A dev-watch rebuild, a host-triggered restart or a plain Ctrl+C all end the
// process the same way Twitch sees it: gone without a goodbye. Left alone,
// that leaves whatever EventSub subscriptions Twitch had not yet deleted
// still enabled, and they count against the next run's subscriptions — see
// `EventSubService.shutdown` for what that snowballs into. `void` here is
// deliberate: a signal handler cannot make the runtime wait for it, so the
// exit is delayed by holding the process open until the async work settles.
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(
    `Received ${signal}; cleaning up Twitch subscriptions before exit`,
  );

  void events
    .shutdown()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
