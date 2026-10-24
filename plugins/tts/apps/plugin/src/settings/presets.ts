import {
  ELEVENLABS_PROVIDER,
  ELEVENLABS_SPEED_MAX,
  ELEVENLABS_SPEED_MIN,
  type ElevenLabsSettings,
  INITIAL_SETTINGS,
  PRESET_NAME_MAX,
  presetSpeech,
  RATE_MAX,
  RATE_MIN,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetDraft,
  type PresetSpeech,
  type PresetVoice,
  type SystemSettings,
} from "tts-protocol";

import { isRecord, nameOf } from "./values";

/**
 * The Presets as saved, read warily: one this version cannot read is left
 * out — a Speak on it is then dropped as any Speak on a missing Preset —
 * rather than failing every Speak. Of two with one id, the first is kept.
 */
export function readPresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const presets: Preset[] = [];
  for (const value of raw) {
    const preset = readPreset(value);
    if (preset && !presets.some(({ id }) => id === preset.id)) {
      presets.push(preset);
    }
  }
  return presets;
}

function readPreset(raw: unknown): Preset | undefined {
  const draft = readPresetDraft(raw);
  return draft?.id === undefined ? undefined : { ...draft, id: draft.id };
}

/**
 * A Preset as its dialog sent it, read warily: without a name or a Voice it
 * is nothing to save. An id is kept only when it is text.
 */
export function readPresetDraft(raw: unknown): PresetDraft | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const name = nameOf(raw.name);
  const speech = readPresetSpeech(raw);
  if (name === undefined || speech === undefined) {
    return undefined;
  }
  return {
    ...(typeof raw.id === "string" && raw.id !== "" && { id: raw.id }),
    name: name.slice(0, PRESET_NAME_MAX),
    ...speech,
  };
}

/**
 * What a Preset speaks with — a Voice of a Provider this version knows, and
 * that Provider's settings, each read warily.
 */
export function readPresetSpeech(raw: unknown): PresetSpeech | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const voice = voiceOf(raw.voice);
  if (voice === undefined) {
    return undefined;
  }
  return voice.provider === SYSTEM_PROVIDER
    ? presetSpeech(voice, systemSettingsOf(raw.settings))
    : presetSpeech(voice, elevenLabsSettingsOf(raw.settings));
}

function voiceOf(value: unknown): PresetVoice | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    return undefined;
  }
  const { id } = value;
  const name = nameOf(value.name) ?? id;
  switch (value.provider) {
    case SYSTEM_PROVIDER:
      return { provider: SYSTEM_PROVIDER, id, name };
    case ELEVENLABS_PROVIDER:
      return { provider: ELEVENLABS_PROVIDER, id, name };
    default:
      return undefined;
  }
}

/** Each setting it cannot read starts as a new Preset's would. */
function systemSettingsOf(value: unknown): SystemSettings {
  const rate = isRecord(value) ? value.rate : undefined;
  return {
    rate:
      typeof rate === "number" && Number.isFinite(rate)
        ? Math.min(RATE_MAX, Math.max(RATE_MIN, rate))
        : INITIAL_SETTINGS.system.rate,
  };
}

/**
 * Each setting it cannot read is Voice's own, and a Model it cannot read is
 * a new Preset's: a Preset is never dropped for its settings.
 */
function elevenLabsSettingsOf(value: unknown): ElevenLabsSettings {
  const settings = isRecord(value) ? value : {};
  const within = (setting: unknown, min: number, max: number) =>
    typeof setting === "number" && Number.isFinite(setting)
      ? Math.min(max, Math.max(min, setting))
      : undefined;
  const read: ElevenLabsSettings = {
    model: nameOf(settings.model) ?? INITIAL_SETTINGS.elevenlabs.model,
    speed: within(settings.speed, ELEVENLABS_SPEED_MIN, ELEVENLABS_SPEED_MAX),
    stability: within(settings.stability, 0, 1),
    similarity: within(settings.similarity, 0, 1),
    style: within(settings.style, 0, 1),
    speakerBoost:
      typeof settings.speakerBoost === "boolean"
        ? settings.speakerBoost
        : undefined,
  };
  return Object.fromEntries(
    Object.entries(read).filter(([, setting]) => setting !== undefined),
  ) as ElevenLabsSettings;
}
