import { isEditorMessage } from "tts-protocol";

import { SpeakAction } from "./actions/speak";
import { StopSpeechAction } from "./actions/stop-speech";
import { EditorChannel } from "./editors/editor-channel";
import { RecentProblems } from "./editors/recent-problems";
import { PHRASE_FINISHED_EVENT, PHRASE_STARTED_EVENT } from "./events";
import { plugin } from "./plugin";
import { DefaultsStore } from "./settings/defaults-store";
import { createSpeakingSource } from "./sources/speaking";
import { createWaitingSource } from "./sources/waiting";
import { Listing } from "./speech/listing";
import { describeDrop, dropOf, SpeechQueue } from "./speech/speech-queue";
import { Voices } from "./speech/voices";
import { systemSpeech } from "./system";

const { provider, player } = systemSpeech();
const voices = new Voices(provider);
// Only the editors list the devices: a play finds its own by id.
const devices = new Listing(() => player.devices());
const defaults = new DefaultsStore(plugin, () => void editors.publish());
const problems = new RecentProblems(() => void editors.publish());

const queue = new SpeechQueue({
  provider,
  player,
  voiceFor: async ({ voice }) => voice ?? voices.osDefault(),
  onDropped: (phrase, error) => {
    if (phrase.listen !== undefined) {
      // A Listen's failure is its editor's to show, not a viewer's lost
      // Phrase.
      editors.listenFailed(phrase.listen, error);
    } else {
      const drop = dropOf(phrase, error);
      // stderr lands in the plugin's log (`logs/tts.log` in its folder).
      console.warn(describeDrop(drop));
      problems.add(drop);
    }
  },
  onStarted: () => plugin.emitEvent(PHRASE_STARTED_EVENT, {}),
  onFinished: () => plugin.emitEvent(PHRASE_FINISHED_EVENT, {}),
});

const editors = new EditorChannel({
  sender: plugin,
  defaults,
  voices,
  devices,
  queue,
  problems,
});

plugin.registerAction(new SpeakAction(queue, defaults));
plugin.registerAction(new StopSpeechAction(queue));
plugin.registerSource(createSpeakingSource(queue));
plugin.registerSource(createWaitingSource(queue));

// Attached before connecting, so nothing an editor already open sends is
// missed. A message that arrives before the settings waits for them.
plugin.onReceiveFromEditor((message: unknown) => {
  if (isEditorMessage(message)) {
    void editors.handle(message);
  }
});

await plugin.connect();

// Read once — the store explains why the echoes of its own writes are not
// read again. Settings are only readable over the authenticated connection.
try {
  const { payload } = await plugin.getPluginSettings();
  defaults.load(payload);
} catch (error) {
  console.warn(
    "Could not read the plugin's settings; using the defaults:",
    error,
  );
  defaults.load(undefined);
}
await editors.publish();
