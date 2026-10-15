import { randomUUID } from "node:crypto";

import {
  isEditorMessage,
  TIMER_ELAPSED_EVENT,
  validateStopwatchName,
  validateTimerName,
  type EditorMessage,
  type PluginMessage,
} from "timers-protocol";

import { AddTimeAction } from "./actions/add-time";
import { CancelTimerAction } from "./actions/cancel-timer";
import { PauseStopwatchAction } from "./actions/pause-stopwatch";
import { ReadStopwatchAction } from "./actions/read-stopwatch";
import { ResetStopwatchAction } from "./actions/reset-stopwatch";
import { StartStopwatchAction } from "./actions/start-stopwatch";
import { StartTimerAction } from "./actions/start-timer";
import { createStopwatchStatesOptions } from "./options/stopwatch-states";
import { createStopwatchesOptions } from "./options/stopwatches";
import { createTimerStatesOptions } from "./options/timer-states";
import { createTimersOptions } from "./options/timers";
import { plugin } from "./plugin";
import { createRemainingSecondsSource } from "./sources/remaining-seconds";
import { createStopwatchStateSource } from "./sources/stopwatch-state";
import { createTimerStateSource } from "./sources/timer-state";
import { Stopwatches } from "./stopwatches/stopwatches";
import { SettingsStore } from "./store";
import { Timers } from "./timers/timers";

const store = new SettingsStore(plugin, () => publish());
const timers = new Timers(store, (elapsed) =>
  plugin.emitEvent(TIMER_ELAPSED_EVENT, elapsed),
);
const stopwatches = new Stopwatches(store);

plugin.registerAction(new StartTimerAction(timers));
plugin.registerAction(new CancelTimerAction(timers));
plugin.registerAction(new AddTimeAction(timers));
plugin.registerAction(new StartStopwatchAction(stopwatches));
plugin.registerAction(new PauseStopwatchAction(stopwatches));
plugin.registerAction(new ResetStopwatchAction(stopwatches));
plugin.registerAction(new ReadStopwatchAction(stopwatches));

plugin.registerSource(createTimerStateSource(timers));
plugin.registerSource(createRemainingSecondsSource(timers));
plugin.registerSource(createStopwatchStateSource(stopwatches));

plugin.registerOptions(createTimersOptions(store));
plugin.registerOptions(createTimerStatesOptions());
plugin.registerOptions(createStopwatchesOptions(store));
plugin.registerOptions(createStopwatchStatesOptions());

/** Tells every open editor how the Timers and the Stopwatches stand. */
function publish(): void {
  plugin.sendToEditor({
    event: "status",
    status: {
      timers: [...store.timers()],
      stopwatches: [...store.stopwatches()],
    },
  } satisfies PluginMessage);
}

function refuse(of: "timers" | "stopwatches", message: string): void {
  plugin.sendToEditor({
    event: "refused",
    of,
    message,
  } satisfies PluginMessage);
}

async function handle(message: EditorMessage): Promise<void> {
  await store.loaded;

  switch (message.event) {
    case "get-status":
      publish();
      return;

    case "create-timer": {
      const refusal = validateTimerName(message.timer.name, store.timers());

      if (refusal) {
        refuse("timers", refusal);
        return;
      }

      await store.addTimer(randomUUID(), message.timer);
      return;
    }

    case "update-timer": {
      if (!store.timer(message.id)) {
        refuse("timers", "This Timer no longer exists.");
        return;
      }

      const refusal = validateTimerName(
        message.timer.name,
        store.timers(),
        message.id,
      );

      if (refusal) {
        refuse("timers", refusal);
        return;
      }

      await store.updateTimer(message.id, message.timer);
      return;
    }

    case "delete-timer":
      await store.removeTimer(message.id);
      return;

    case "create-stopwatch": {
      const refusal = validateStopwatchName(message.name, store.stopwatches());

      if (refusal) {
        refuse("stopwatches", refusal);
        return;
      }

      await store.addStopwatch(randomUUID(), message.name);
      return;
    }

    case "rename-stopwatch": {
      if (!store.stopwatch(message.id)) {
        refuse("stopwatches", "This Stopwatch no longer exists.");
        return;
      }

      const refusal = validateStopwatchName(
        message.name,
        store.stopwatches(),
        message.id,
      );

      if (refusal) {
        refuse("stopwatches", refusal);
        return;
      }

      await store.renameStopwatch(message.id, message.name);
      return;
    }

    case "delete-stopwatch":
      await store.removeStopwatch(message.id);
      return;
  }
}

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes. A message that
// arrives before the settings have loaded waits for them in `handle`.
plugin.onReceiveFromEditor((message: unknown) => {
  if (isEditorMessage(message)) {
    void handle(message);
  }
});

await plugin.connect();

// Read once — the store explains why the echoes of its own writes are not
// read again. Settings are only readable over the authenticated connection.
const { payload } = await plugin.getPluginSettings();
store.load(payload);
// Fires what fell due while Fluxta was closed, then waits for the next Due
// Time. Not before connecting: an Event emitted then would go nowhere.
timers.fireDue();
publish();
