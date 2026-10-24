import {
  INITIAL_DEFAULTS,
  RATE_MAX,
  RATE_MIN,
  SYSTEM_DEFAULT,
  VOLUME_MAX,
  type Defaults,
  type OutputDevice,
  type SpeakSettings,
} from "tts-protocol";

/**
 * Defaults as saved, or as an editor sent them, read warily: whatever this
 * version cannot read falls back to its initial value instead of failing
 * every Speak.
 */
export function readDefaults(raw: unknown): Defaults {
  const record = isRecord(raw) ? raw : {};
  const voice = voiceOf(record.voice);
  return {
    ...(voice !== undefined && { voice }),
    rate: rateOf(record.rate) ?? INITIAL_DEFAULTS.rate,
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
  /** A Voice's id; absent for the voice the OS speaks with. */
  voice?: string;
  rate: number;
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
  const voice = voiceOf(speak?.voice) ?? defaults.voice;
  return {
    ...(voice !== undefined && { voice }),
    rate: rateOf(speak?.rate) ?? defaults.rate,
    volume: volumeOf(speak?.volume) ?? defaults.volume,
    device: deviceOf(speak?.device) ?? defaults.device,
    lengthLimit: lengthLimitOf(speak?.lengthLimit) ?? defaults.lengthLimit,
  };
}

function voiceOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** System default, or a device with an id — named by its id if it has no name. */
function deviceOf(value: unknown): OutputDevice | undefined {
  if (value === SYSTEM_DEFAULT) {
    return SYSTEM_DEFAULT;
  }
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    return undefined;
  }
  const name =
    typeof value.name === "string" && value.name !== "" ? value.name : value.id;
  return { id: value.id, name };
}

/** Clamped to 0.5×–2×, the range the editors offer. */
function rateOf(value: unknown): number | undefined {
  return isNumber(value)
    ? Math.min(RATE_MAX, Math.max(RATE_MIN, value))
    : undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
