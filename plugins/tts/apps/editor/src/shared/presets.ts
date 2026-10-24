import type { SelectOption } from "@fluxta/sdk/ui";
import {
  formatRate,
  isSpokenBy,
  PROVIDER_LABELS,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetRef,
  type PresetVoice,
  type ProviderOption,
} from "tts-protocol";

/** Every Preset as a SelectField option, in the order they were made. */
export function presetOptions(presets: readonly Preset[]): SelectOption[] {
  return presets.map(({ id, name }) => ({ value: id, label: name }));
}

/** A Preset as Speak and the Defaults keep it: by id, with its name. */
export function presetRef(
  id: string,
  presets: readonly Preset[],
): PresetRef | undefined {
  const preset = presets.find((candidate) => candidate.id === id);
  return preset && { id: preset.id, name: preset.name };
}

/** A saved Preset as the editors name it, marked when it is not here. */
export function presetLabel(
  ref: PresetRef,
  presets: readonly Preset[],
): string {
  const preset = presets.find(({ id }) => id === ref.id);
  return preset ? preset.name : `${ref.name}, not available right now`;
}

/**
 * The label of a saved Preset the list does not hold: its saved name — its
 * id means nothing to a person.
 */
export function missingPreset(
  saved: PresetRef | undefined,
): (value: string) => string {
  return (value) =>
    `${saved?.id === value ? saved.name : value} — not available right now`;
}

/**
 * A Preset's Voice as the editors show it — `Milena — Russian (Russia)` —
 * or its saved name, marked, while its Provider does not list it.
 */
export function voiceLabel(
  voice: PresetVoice,
  providers: readonly ProviderOption[],
): string {
  const listed = providers
    .find(({ name }) => name === voice.provider)
    ?.voices.find(({ id }) => id === voice.id);
  return listed ? listed.label : `${voice.name}, not available right now`;
}

/**
 * A Preset in a line: its Voice, then its rate — or, for ElevenLabs, whose
 * voices those are and its Model: `Milena — Russian (Russia) · 1.2×`,
 * `Rachel · ElevenLabs, Eleven Flash v2.5`.
 */
export function presetSummary(
  preset: Preset,
  providers: readonly ProviderOption[],
): string {
  const voice = voiceLabel(preset.voice, providers);
  if (isSpokenBy(preset, SYSTEM_PROVIDER)) {
    return `${voice} · ${formatRate(preset.settings.rate)}`;
  }
  const { model } = preset.settings;
  const name =
    providers
      .find(({ name }) => name === preset.voice.provider)
      ?.models?.find(({ id }) => id === model)?.name ?? model;
  return `${voice} · ${PROVIDER_LABELS[preset.voice.provider]}, ${name}`;
}
