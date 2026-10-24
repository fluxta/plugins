import type { SpeakSettings } from "./actions";
import type { Defaults } from "./defaults";
import type {
  Preset,
  PresetDraft,
  PresetSpeech,
  ProviderName,
} from "./presets";

/** A Voice as the editors list it. */
export type VoiceOption = {
  id: string;
  /** `Ava (Premium)`: what a Preset keeps, to show while it is not here. */
  name: string;
  /** `Milena — Russian (Russia)`, with its quality where it has one. */
  label: string;
};

/** A Provider as the Preset dialog offers it, with its Voices. */
export type ProviderOption = {
  name: ProviderName;
  /** `This computer`. */
  label: string;
  /** Sorted by language, then name. */
  voices: VoiceOption[];
  /** Why there are no voices to list: the Provider's reason. */
  problem?: string;
  /** Its voices have not been looked up yet: ElevenLabs takes its time. */
  loading?: boolean;
  /** ElevenLabs' Models that speak text, as its site names them. */
  models?: { id: string; name: string }[];
};

/** An output device as the editors list it, under the name the OS gives it. */
export type DeviceOption = {
  id: string;
  name: string;
  /** The OS's default output right now: where System default plays. */
  isDefault?: boolean;
};

/** How many dropped Phrases Recent problems keeps. */
export const RECENT_PROBLEMS_KEPT = 20;

/**
 * The ElevenLabs account as the editors see it — never its API key: none
 * stored, the first answer awaited, connected, or why not, as the latest
 * call to ElevenLabs told.
 */
export type ElevenLabsStatus =
  | { state: "no-key" }
  | { state: "checking" }
  | { state: "connected" }
  | { state: "not-connected"; reason: string };

/** A Phrase that could not be spoken, as Recent problems lists it. */
export type RecentProblem = {
  /** Unique while the plugin runs. */
  id: number;
  /** When it was dropped, in milliseconds since the epoch. */
  at: number;
  /** The Provider's or the Player's error kind: `voice-missing`, `rejected`… */
  kind: string;
  /** What a person reads: `No voice … on this computer`. */
  reason: string;
  /** The beginning of its text, so the viewer's lost message can be found. */
  text: string;
};

/** What the sidecar tells every open editor. */
export type PluginStatus = {
  /** As saved in Plugin Settings. */
  defaults: Defaults;
  /** In the order they were made. */
  presets: Preset[];
  /** Every Provider a Preset can speak with. */
  providers: ProviderOption[];
  elevenLabs: ElevenLabsStatus;
  /** In the OS's order, as the host's Play Sound lists them. */
  devices: DeviceOption[];
  /** Why there are no devices to list: the Player's reason. */
  devicesProblem?: string;
  /**
   * The Phrases dropped since the plugin started, newest first, at most
   * {@link RECENT_PROBLEMS_KEPT}. A Listen's are not among them.
   */
  problems: RecentProblem[];
};

/**
 * The greeting a Listen says while its field is blank, and what the field
 * starts with: English, whatever the voice — a voice of another language
 * reads it with its own accent.
 */
export const LISTEN_TEXT = "Hello, chat! This is how I sound.";

/**
 * What a Listen speaks with, read as Speak's Overrides: whatever it leaves
 * out follows the Defaults.
 */
export type ListenSettings = Pick<
  SpeakSettings,
  "preset" | "volume" | "device"
> & {
  /** A Preset dialog's form, unsaved: spoken instead of any saved Preset. */
  speech?: PresetSpeech;
};

/** What an editor asks of the sidecar. */
export type EditorMessage =
  /** The status, with the voices and the devices looked up afresh. */
  | { event: "get-status" }
  /** Saves the Plugin Editor's defaults; the sidecar reads them warily. */
  | { event: "set-defaults"; defaults: Defaults }
  /**
   * Saves a Preset from its dialog: a new one without an id, the one with
   * its id otherwise.
   */
  | { event: "save-preset"; preset: PresetDraft }
  /** Deletes a Preset — never the Default Preset. */
  | { event: "delete-preset"; id: string }
  /** Stores the ElevenLabs API key in place of the one stored, if any. */
  | { event: "set-elevenlabs-key"; key: string }
  | { event: "remove-elevenlabs-key" }
  /**
   * Speaks `text` — {@link LISTEN_TEXT} when it is blank — as the form
   * stands. `id` is the editor's own, so that only it hears the answer.
   */
  | { event: "listen"; id: string; text: string; settings: ListenSettings };

/** What the sidecar sends the editors — every open one. */
export type PluginMessage =
  | { event: "status"; status: PluginStatus }
  /** The Listen `id` could not be heard, and why. */
  | { event: "listen-failed"; id: string; problem: string };

export function isEditorMessage(message: unknown): message is EditorMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const { event } = message as { event?: unknown };
  return (
    event === "get-status" ||
    event === "set-defaults" ||
    event === "save-preset" ||
    event === "delete-preset" ||
    event === "set-elevenlabs-key" ||
    event === "remove-elevenlabs-key" ||
    event === "listen"
  );
}

export function isListenFailed(
  message: unknown,
): message is Extract<PluginMessage, { event: "listen-failed" }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { event?: unknown }).event === "listen-failed"
  );
}
