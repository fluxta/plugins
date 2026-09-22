import { ApiClient } from "@twurple/api";
import {
  isEditorMessage,
  validateCommand,
  type Command,
  type PluginMessage,
} from "platforms-protocol";

import { AccountsService } from "./accounts/service";
import { SettingsStore } from "./accounts/store";
import { AddModeratorAction } from "./actions/add-moderator";
import { AddVipAction } from "./actions/add-vip";
import { BanUserAction } from "./actions/ban-user";
import { CancelPredictionAction } from "./actions/cancel-prediction";
import { CancelRaidAction } from "./actions/cancel-raid";
import { ClearChatAction } from "./actions/clear-chat";
import { DeleteMessageAction } from "./actions/delete-message";
import { EndPollAction } from "./actions/end-poll";
import { LockPredictionAction } from "./actions/lock-prediction";
import { RemoveModeratorAction } from "./actions/remove-moderator";
import { RemoveVipAction } from "./actions/remove-vip";
import { ResolvePredictionAction } from "./actions/resolve-prediction";
import { ResolveRedemptionAction } from "./actions/resolve-redemption";
import { RunCommercialAction } from "./actions/run-commercial";
import { SendAnnouncementAction } from "./actions/send-announcement";
import { SendMessageAction } from "./actions/send-message";
import { SendShoutoutAction } from "./actions/send-shoutout";
import { StartPollAction } from "./actions/start-poll";
import { StartPredictionAction } from "./actions/start-prediction";
import { StartRaidAction } from "./actions/start-raid";
import { TimeoutUserAction } from "./actions/timeout-user";
import { UnbanUserAction } from "./actions/unban-user";
import { UntimeoutUserAction } from "./actions/untimeout-user";
import { UpdateChatSettingsAction } from "./actions/update-chat-settings";
import { UpdateRewardAction } from "./actions/update-reward";
import { UpdateStreamInfoAction } from "./actions/update-stream-info";
import { WarnUserAction } from "./actions/warn-user";
import type { ChannelApi } from "./channel/api";
import { ChannelService } from "./channel/service";
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
import type { ModerationApi } from "./moderation/api";
import { ModerationService } from "./moderation/service";
import { plugin } from "./plugin";
import { PollsService } from "./polls/service";
import { PredictionsService } from "./predictions/service";
import { RewardsService } from "./rewards/service";
import { StreamStatusService } from "./stream/service";
import { EventSubService } from "./twitch/eventsub";

const store = new SettingsStore();

const accounts = new AccountsService(store, () => {
  // Subscriptions, Rewards and the stream's live status all follow the
  // Broadcaster Account, so every Account change is a chance for them to
  // appear or go away.
  events.sync();
  rewards.sync();
  void stream.sync();
  publish();
  plugin.setConnections(accounts.externalConnections());
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

// Spans three of twurple's own namespaces (users, moderation, chat) behind
// the one narrow shape `ModerationService` asks for.
const moderationClient = new ApiClient({ authProvider: accounts.authProvider });
const moderationApi: ModerationApi = {
  getUserByName: async (login) => {
    const user = await moderationClient.users.getUserByName(login);
    return user ? { id: user.id, displayName: user.displayName } : null;
  },
  banUser: (broadcaster, data) => moderationClient.moderation.banUser(broadcaster, data),
  unbanUser: (broadcaster, user) => moderationClient.moderation.unbanUser(broadcaster, user),
  shoutoutUser: (from, to) => moderationClient.chat.shoutoutUser(from, to),
  addModerator: (broadcaster, user) => moderationClient.moderation.addModerator(broadcaster, user),
  removeModerator: (broadcaster, user) =>
    moderationClient.moderation.removeModerator(broadcaster, user),
  addVip: (broadcaster, user) => moderationClient.channels.addVip(broadcaster, user),
  removeVip: (broadcaster, user) => moderationClient.channels.removeVip(broadcaster, user),
  deleteChatMessages: (broadcaster, messageId) =>
    moderationClient.moderation.deleteChatMessages(broadcaster, messageId),
  warnUser: (broadcaster, user, reason) =>
    moderationClient.moderation.warnUser(broadcaster, user, reason),
  sendAnnouncement: (broadcaster, message, color) =>
    moderationClient.chat.sendAnnouncement(broadcaster, { message, color }),
  getChatSettings: (broadcaster) => moderationClient.chat.getSettingsPrivileged(broadcaster),
  updateChatSettings: (broadcaster, data) =>
    moderationClient.chat.updateSettings(broadcaster, data),
};
const moderation = new ModerationService(() => accounts.userId("broadcaster"), moderationApi);

// Spans four of twurple's own namespaces (channels, games, users, raids)
// behind the one narrow shape `ChannelService` asks for.
const channelClient = new ApiClient({ authProvider: accounts.authProvider });
const channelApi: ChannelApi = {
  updateChannelInfo: (broadcaster, data) => channelClient.channels.updateChannelInfo(broadcaster, data),
  getGameByName: (name) => channelClient.games.getGameByName(name),
  getUserByName: async (login) => {
    const user = await channelClient.users.getUserByName(login);
    return user ? { id: user.id, displayName: user.displayName } : null;
  },
  startRaid: (from, to) => channelClient.raids.startRaid(from, to),
  cancelRaid: (from) => channelClient.raids.cancelRaid(from),
  startChannelCommercial: (broadcaster, length) =>
    channelClient.channels.startChannelCommercial(broadcaster, length),
};
const channel = new ChannelService(() => accounts.userId("broadcaster"), channelApi);

plugin.registerAction(new SendMessageAction(sender));
plugin.registerAction(new UpdateRewardAction(rewards));
plugin.registerAction(new ResolveRedemptionAction(rewards));
plugin.registerAction(new StartPollAction(polls));
plugin.registerAction(new EndPollAction(polls));
plugin.registerAction(new StartPredictionAction(predictions));
plugin.registerAction(new LockPredictionAction(predictions));
plugin.registerAction(new ResolvePredictionAction(predictions));
plugin.registerAction(new CancelPredictionAction(predictions));
plugin.registerAction(new BanUserAction(moderation));
plugin.registerAction(new TimeoutUserAction(moderation));
plugin.registerAction(new UnbanUserAction(moderation));
plugin.registerAction(new UntimeoutUserAction(moderation));
plugin.registerAction(new SendShoutoutAction(moderation));
plugin.registerAction(new UpdateStreamInfoAction(channel));
plugin.registerAction(new StartRaidAction(channel));
plugin.registerAction(new CancelRaidAction(channel));
plugin.registerAction(new RunCommercialAction(channel));
plugin.registerAction(new AddModeratorAction(moderation));
plugin.registerAction(new RemoveModeratorAction(moderation));
plugin.registerAction(new AddVipAction(moderation));
plugin.registerAction(new RemoveVipAction(moderation));
plugin.registerAction(new ClearChatAction(moderation));
plugin.registerAction(new DeleteMessageAction(moderation));
plugin.registerAction(new WarnUserAction(moderation));
plugin.registerAction(new SendAnnouncementAction(moderation));
plugin.registerAction(new UpdateChatSettingsAction(moderation));

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

console.log("Platforms connected");

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
