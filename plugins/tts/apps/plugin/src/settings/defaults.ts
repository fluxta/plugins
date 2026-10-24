import {
  INITIAL_DEFAULTS,
  SYSTEM_DEFAULT,
  VOLUME_MAX,
  type Defaults,
  type OutputDevice,
  type PresetRef,
  type SpeakSettings,
} from "tts-protocol";

import { isRecord, nameOf } from "./values";

/**
 * Defaults as saved, or as an editor sent them, read warily: whatever this
 * version cannot read falls back to its initial value instead of failing
 * every Speak.
 */
export function readDefaults(raw: unknown): Defaults {
  const record = isRecord(raw) ? raw : {};
  const preset = presetRefOf(record.preset);
  return {
    ...(preset !== undefined && { preset }),
    volume: volumeOf(record.volume) ?? INITIAL_DEFAULTS.volume,
    device: deviceOf(record.device) ?? INITIAL_DEFAULTS.device,
    lengthLimit:
      record.lengthLimit === null
        ? null
        : (lengthLimitOf(record.lengthLimit) ?? INITIAL_DEFAULTS.lengthLimit),
  };
}

/** How one Speak is spoken, its overrides laid over the defaults. */
export type EffectiveSettings = {
  /** Absent while there is no Default Preset: the OS's voice then. */
  preset?: PresetRef;
  /** 0–100 %. */
  volume: number;
  device: OutputDevice;
  lengthLimit: number | null;
};

/**
 * A Speak's effective settings: each override it carries, else the default.
 * An override this version cannot read counts as absent — it follows the
 * default rather than dropping the Phrase.
 */
export function effectiveSettings(
  defaults: Defaults,
  speak: SpeakSettings | null | undefined,
): EffectiveSettings {
  const preset = presetRefOf(speak?.preset) ?? defaults.preset;
  return {
    ...(preset !== undefined && { preset }),
    volume: volumeOf(speak?.volume) ?? defaults.volume,
    device: deviceOf(speak?.device) ?? defaults.device,
    lengthLimit: lengthLimitOf(speak?.lengthLimit) ?? defaults.lengthLimit,
  };
}

/** A Preset by its id — named by its id if it has no name. */
export function presetRefOf(value: unknown): PresetRef | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    return undefined;
  }
  return { id: value.id, name: nameOf(value.name) ?? value.id };
}

/** System default, or a device with an id — named by its id if it has no name. */
function deviceOf(value: unknown): OutputDevice | undefined {
  if (value === SYSTEM_DEFAULT) {
    return SYSTEM_DEFAULT;
  }
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    return undefined;
  }
  return { id: value.id, name: nameOf(value.name) ?? value.id };
}

/** Clamped to 0–100 %: no boost. */
function volumeOf(value: unknown): number | undefined {
  return isNumber(value) ? Math.min(VOLUME_MAX, Math.max(0, value)) : undefined;
}

/** A whole number of graphemes, at least one. */
function lengthLimitOf(value: unknown): number | undefined {
  return isNumber(value) && value >= 1 ? Math.floor(value) : undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
