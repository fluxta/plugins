import { NumberField, SelectField } from "@fluxta/sdk/ui";
import {
  ELEVENLABS_SPEEDS,
  type ElevenLabsSettings,
  type ProviderOption,
} from "tts-protocol";

/**
 * The SelectField value of "Voice's own": the setting is absent, and the
 * voice speaks as it is set up on the ElevenLabs site. No Speed has this
 * value.
 */
const VOICE_OWN = "@voice-own";

/** A Speed as the editors show it: `1.05×`. */
function formatSpeed(speed: number): string {
  return `${speed.toFixed(2)}×`;
}

const SPEED_OPTIONS = [
  { value: VOICE_OWN, label: "Voice’s own" },
  ...ELEVENLABS_SPEEDS.map((speed) => ({
    value: String(speed),
    label: formatSpeed(speed),
  })),
];

const SPEAKER_BOOST_OPTIONS = [
  { value: VOICE_OWN, label: "Voice’s own" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

type ElevenLabsFieldsProps = {
  settings: ElevenLabsSettings;
  models: NonNullable<ProviderOption["models"]>;
  /** ElevenLabs has not answered yet. */
  loading?: boolean;
  onChange: (settings: ElevenLabsSettings) => void;
};

/**
 * An ElevenLabs Preset's own settings: its Model, and each voice setting —
 * **Voice's own**, as the voice is set up on the site, until it is given a
 * value here.
 */
export function ElevenLabsFields({
  settings,
  models,
  loading,
  onChange,
}: ElevenLabsFieldsProps) {
  // `undefined` is Voice's own: the key goes, as JSON leaves it out.
  const set = <K extends keyof ElevenLabsSettings>(
    key: K,
    value: ElevenLabsSettings[K],
  ) => onChange({ ...settings, [key]: value });
  const percent = (value: number | undefined) =>
    value === undefined ? undefined : Math.round(value * 100);
  const fraction = (value: number | undefined) =>
    value === undefined ? undefined : value / 100;

  return (
    <>
      <SelectField
        label="Model"
        options={models.map(({ id, name }) => ({ value: id, label: name }))}
        value={settings.model}
        onChange={(model) => set("model", model)}
        loading={loading}
        missingLabel={(model) => `${model} — not offered right now`}
        hint="Flash v2.5 is the fastest and cheapest. Some Models act on what is written in the text — [whispers] and other tags in square brackets, <break time=“1s”/>, /IPA/ — chat’s included."
      />

      <SelectField
        label="Speed"
        options={SPEED_OPTIONS}
        value={
          settings.speed === undefined ? VOICE_OWN : String(settings.speed)
        }
        onChange={(speed) =>
          set("speed", speed === VOICE_OWN ? undefined : Number(speed))
        }
        searchable={false}
        missingLabel={(speed) => formatSpeed(Number(speed))}
        hint="ElevenLabs speaks between 0.70× and 1.20× of the voice’s pace."
      />

      <NumberField
        label="Stability, %"
        value={percent(settings.stability)}
        onChange={(stability) => set("stability", fraction(stability))}
        min={0}
        max={100}
        placeholder="Voice’s own"
        hint="Lower is more expressive, higher more even. Empty: as the voice is set up on the site."
      />

      <NumberField
        label="Similarity, %"
        value={percent(settings.similarity)}
        onChange={(similarity) => set("similarity", fraction(similarity))}
        min={0}
        max={100}
        placeholder="Voice’s own"
        hint="How closely it keeps to the original voice. Empty: as the voice is set up on the site."
      />

      <NumberField
        label="Style, %"
        value={percent(settings.style)}
        onChange={(style) => set("style", fraction(style))}
        min={0}
        max={100}
        placeholder="Voice’s own"
        hint="Exaggerates the voice’s style; above 0 it takes longer to start speaking. Empty: as the voice is set up on the site."
      />

      <SelectField
        label="Speaker boost"
        options={SPEAKER_BOOST_OPTIONS}
        value={
          settings.speakerBoost === undefined
            ? VOICE_OWN
            : settings.speakerBoost
              ? "on"
              : "off"
        }
        onChange={(boost) =>
          set("speakerBoost", boost === VOICE_OWN ? undefined : boost === "on")
        }
        searchable={false}
        hint="Closer to the original speaker, but it takes longer to start speaking."
      />
    </>
  );
}
