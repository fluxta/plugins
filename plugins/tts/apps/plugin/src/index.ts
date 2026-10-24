import { isEditorMessage } from "tts-protocol";

import { SpeakAction } from "./actions/speak";
import { StopSpeechAction } from "./actions/stop-speech";
import { ElevenLabsAccount } from "./elevenlabs/account";
import { ElevenLabsClient } from "./elevenlabs/client";
import { ElevenLabsProvider } from "./elevenlabs/elevenlabs-provider";
import { EditorChannel } from "./editors/editor-channel";
import { RecentProblems } from "./editors/recent-problems";
import { PHRASE_FINISHED_EVENT, PHRASE_STARTED_EVENT } from "./events";
import { plugin } from "./plugin";
import { SettingsStore } from "./settings/settings-store";
import { synthesisOf, type ProviderVoices } from "./settings/synthesis";
import { createSpeakingSource } from "./sources/speaking";
import { createWaitingSource } from "./sources/waiting";
import { Listing } from "./speech/listing";
import { describeDrop, dropOf, SpeechQueue } from "./speech/speech-queue";
import { Voices } from "./speech/voices";
import { systemSpeech } from "./system";

const { provider: system, player } = systemSpeech();
const settings = new SettingsStore(plugin, () => void editors.publish());
const elevenLabsAccount = new ElevenLabsAccount({
  key: () => settings.elevenLabsKey,
  onChange: () => void editors.publish(),
  report: (connections) => plugin.setConnections(connections),
});
const elevenLabsClient = new ElevenLabsClient({
  key: () => settings.elevenLabsKey,
  onOutcome: (outcome, key) => elevenLabsAccount.outcome(outcome, key),
});
const elevenLabs = new ElevenLabsProvider(elevenLabsClient);
// Only the Preset dialog lists the Models: a Phrase names its own.
const elevenLabsModels = new Listing(() => elevenLabsClient.models());
const providers = { system, elevenlabs: elevenLabs };
const voices: ProviderVoices = {
  system: new Voices(system),
  elevenlabs: new Listing(() => elevenLabs.voices()),
};
// Only the editors list the devices: a play finds its own by id.
const devices = new Listing(() => player.devices());
const problems = new RecentProblems(() => void editors.publish());

const queue = new SpeechQueue({
  player,
  synthesisFor: (phrase) =>
    synthesisOf(phrase, {
      presets: () => settings.presets,
      providers,
      voices,
    }),
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
  settings,
  voices,
  devices,
  queue,
  problems,
  elevenLabs: elevenLabsAccount,
  models: elevenLabsModels,
});

plugin.registerAction(new SpeakAction(queue, settings));
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
  settings.load(payload);
} catch (error) {
  console.warn(
    "Could not read the plugin's settings; using the defaults:",
    error,
  );
  settings.load(undefined);
}
// The first look-up of the voices checks the ElevenLabs account as well.
elevenLabsAccount.keyChanged();
await editors.publish();
