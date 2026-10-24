import type { SpeakSettings } from "./actions";
import type { Defaults } from "./defaults";

/** A Voice as the editors list it. */
export type VoiceOption = {
  id: string;
  /** `Milena — Russian (Russia)`, with its quality where it has one. */
  label: string;
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
  /**
   * The Default Voice as it stands: the one chosen, or the OS's own until
   * one is. `name` is absent when that voice is not on this computer.
   * Absent altogether when there are no voices to choose from.
   */
  defaultVoice?: { id: string; name?: string };
  /** Sorted by language, then name. */
  voices: VoiceOption[];
  /** Why there are no voices to list: the Provider's reason. */
  voicesProblem?: string;
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
  "voice" | "rate" | "volume" | "device"
>;

/** What an editor asks of the sidecar. */
export type EditorMessage =
  /** The status, with the voices and the devices looked up afresh. */
  | { event: "get-status" }
  /** Saves the Plugin Editor's defaults; the sidecar reads them warily. */
  | { event: "set-defaults"; defaults: Defaults }
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
    event === "get-status" || event === "set-defaults" || event === "listen"
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
