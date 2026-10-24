/**
 * A Provider by the name the plugin knows it under: `system` is this
 * computer's voices, `elevenlabs` the voices of an ElevenLabs account.
 */
export type ProviderName = "system" | "elevenlabs";

/** The Provider of this computer's voices. */
export const SYSTEM_PROVIDER = "system" satisfies ProviderName;

/** The Provider of an ElevenLabs account's voices. */
export const ELEVENLABS_PROVIDER = "elevenlabs" satisfies ProviderName;

/** Each Provider as the editors name it. */
export const PROVIDER_LABELS: Record<ProviderName, string> = {
  system: "This computer",
  elevenlabs: "ElevenLabs",
};

/** How this computer's voices speak: Rate is all they share. */
export type SystemSettings = {
  /** A multiplier, 1 being the voice's normal pace. */
  rate: number;
};

/**
 * How an ElevenLabs voice speaks: through a Model, and with each setting
 * either its own value or — absent — **Voice's own**, as the voice is set up
 * on the ElevenLabs site.
 */
export type ElevenLabsSettings = {
  /** ElevenLabs' `model_id`. */
  model: string;
  /** 0.7–1.2, 1 being the voice's normal pace. */
  speed?: number;
  /** 0–1. */
  stability?: number;
  /** 0–1: ElevenLabs' `similarity_boost`. */
  similarity?: number;
  /** 0–1: style exaggeration. Above 0 it adds latency. */
  style?: number;
  /** ElevenLabs' `use_speaker_boost`. It adds latency. */
  speakerBoost?: boolean;
};

/** The Model a new Preset of ElevenLabs voices starts with: fast and cheap. */
export const ELEVENLABS_DEFAULT_MODEL = "eleven_flash_v2_5";

export const ELEVENLABS_SPEED_MIN = 0.7;
export const ELEVENLABS_SPEED_MAX = 1.2;

/** Every Speed the editors offer: 0.70 to 1.20 in steps of 0.05. */
export const ELEVENLABS_SPEEDS: readonly number[] = Array.from(
  {
    length: Math.round((ELEVENLABS_SPEED_MAX - ELEVENLABS_SPEED_MIN) * 20) + 1,
  },
  (_, step) => (ELEVENLABS_SPEED_MIN * 20 + step) / 20,
);

/** Each Provider's own settings — they differ in kind, not just in range. */
export type ProviderSettings = {
  system: SystemSettings;
  elevenlabs: ElevenLabsSettings;
};

/** The settings a new Preset of each Provider starts with. */
export const INITIAL_SETTINGS: ProviderSettings = {
  system: { rate: 1 },
  elevenlabs: { model: ELEVENLABS_DEFAULT_MODEL },
};

/**
 * A Preset's Voice: its Provider, the Provider's own id for it — meaningless
 * to any other Provider — and its name, to show while it is not here.
 */
export type PresetVoice<P extends ProviderName = ProviderName> =
  P extends ProviderName ? { provider: P; id: string; name: string } : never;

/**
 * What a Preset speaks with: a Voice of one Provider and that Provider's
 * settings — a Preset without its name, or a Preset dialog's form.
 */
export type PresetSpeech<P extends ProviderName = ProviderName> =
  P extends ProviderName
    ? { voice: PresetVoice<P>; settings: ProviderSettings[P] }
    : never;

/**
 * A Preset: a name, a Voice of one Provider and that Provider's own
 * settings. Made in the Plugin Editor; Speak picks one, or the Default
 * Preset.
 */
export type Preset = PresetSpeech & {
  /** Chosen by the sidecar; kept through a rename. */
  id: string;
  name: string;
};

/** A Preset as the Plugin Editor saves it: a new one has no id yet. */
export type PresetDraft = PresetSpeech & { id?: string; name: string };

/**
 * Whether `speech` is Provider `provider`'s — TypeScript narrows a Preset by
 * it, which it cannot by `speech.voice.provider` alone.
 */
export function isSpokenBy<P extends ProviderName>(
  speech: PresetSpeech,
  provider: P,
): speech is PresetSpeech<P> {
  return speech.voice.provider === provider;
}

/** A Voice and its Provider's settings, as one PresetSpeech. */
export function presetSpeech<P extends ProviderName>(
  voice: PresetVoice<P>,
  settings: ProviderSettings[P],
): PresetSpeech<P> {
  return { voice, settings } as PresetSpeech<P>;
}

export const RATE_MIN = 0.5;
export const RATE_MAX = 2;

/** Every rate the editors offer: 0.5× to 2.0× in steps of 0.1. */
export const RATES: readonly number[] = Array.from(
  { length: Math.round((RATE_MAX - RATE_MIN) * 10) + 1 },
  (_, step) => (RATE_MIN * 10 + step) / 10,
);

/** A rate as the editors show it: `1.0×`. */
export function formatRate(rate: number): string {
  return `${rate.toFixed(1)}×`;
}

/** How long a Preset's name may be. */
export const PRESET_NAME_MAX = 60;

/**
 * Why a Preset cannot be saved as it is — a person reads it in the Preset
 * dialog — or nothing. `others` are every other Preset: two of one name
 * could not be told apart where Speak picks one.
 */
export function presetProblem(
  draft: Pick<PresetDraft, "id" | "name"> & { voice?: PresetVoice },
  others: readonly Pick<Preset, "id" | "name">[],
): string | undefined {
  const name = draft.name.trim();
  if (!name) {
    return "Give this Preset a name.";
  }
  if (name.length > PRESET_NAME_MAX) {
    return `A Preset's name is at most ${PRESET_NAME_MAX} characters.`;
  }
  if (others.some((other) => other.id !== draft.id && other.name === name)) {
    return `Another Preset is already named "${name}".`;
  }
  if (!draft.voice) {
    return "Choose the voice this Preset speaks with.";
  }
  return undefined;
}
