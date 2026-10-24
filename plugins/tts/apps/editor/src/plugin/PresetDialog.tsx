import { Dialog, SelectField, TextField } from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  formatRate,
  INITIAL_SETTINGS,
  isSpokenBy,
  presetProblem,
  presetSpeech,
  RATES,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetDraft,
  type PresetVoice,
  type ProviderName,
  type ProviderOption,
  type ProviderSettings,
} from "tts-protocol";

import { ListenField } from "../shared/ListenField";
import { ElevenLabsFields } from "./ElevenLabsFields";

type PresetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The Preset being edited; absent when adding one. */
  preset?: Preset;
  /** Every other Preset, so a clashing name is caught here. */
  others: readonly Preset[];
  providers: readonly ProviderOption[];
  onSave: (draft: PresetDraft) => void;
};

const RATE_OPTIONS = RATES.map((rate) => ({
  value: String(rate),
  label: formatRate(rate),
}));

/**
 * A Preset's dialog: its name, then its Provider, a Voice of that Provider
 * and that Provider's settings — and Listen, which speaks the form as it
 * stands, unsaved, with the Defaults' volume and output device.
 */
export function PresetDialog({
  open,
  onOpenChange,
  title,
  preset,
  others,
  providers,
  onSave,
}: PresetDialogProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderName>(SYSTEM_PROVIDER);
  const [voice, setVoice] = useState<PresetVoice>();
  // Every Provider's, so that switching Provider and back loses nothing.
  const [settings, setSettings] = useState<ProviderSettings>(INITIAL_SETTINGS);

  // A reopened dialog shows the Preset as it stands now, not whatever was
  // last typed into it — reset while rendering the opening, which React
  // prefers over an effect that would render the stale values first.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(preset?.name ?? "");
      setProvider(preset?.voice.provider ?? SYSTEM_PROVIDER);
      setVoice(preset?.voice);
      setSettings(
        preset
          ? isSpokenBy(preset, SYSTEM_PROVIDER)
            ? { ...INITIAL_SETTINGS, system: preset.settings }
            : { ...INITIAL_SETTINGS, elevenlabs: preset.settings }
          : INITIAL_SETTINGS,
      );
    }
  }

  const offered = providers.find(({ name }) => name === provider);
  // A Voice of another Provider is not this Provider's to show.
  const chosen = voice?.provider === provider ? voice : undefined;
  const speech = chosen && presetSpeech(chosen, settings[chosen.provider]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={() => {
        const draft = { id: preset?.id, name: name.trim(), voice: chosen };
        const problem = presetProblem(draft, others);
        if (problem !== undefined || !speech) {
          return problem;
        }
        onSave({ id: draft.id, name: draft.name, ...speech });
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Chat"
        hint="Shown wherever a Speak picks this Preset."
      />

      <SelectField
        label="Provider"
        options={providers.map(({ name, label }) => ({ value: name, label }))}
        value={provider}
        onChange={(value) => setProvider(value as ProviderName)}
        searchable={false}
      />

      <ListenField
        label="Voice"
        options={(offered?.voices ?? []).map(({ id, label }) => ({
          value: id,
          label,
        }))}
        value={chosen?.id}
        onChange={(id) => {
          const listed = offered?.voices.find((option) => option.id === id);
          setVoice({ provider, id, name: listed?.name ?? id });
        }}
        missingLabel={(id) =>
          `${chosen?.id === id ? chosen.name : id} — not available right now`
        }
        placeholder="Choose a voice"
        loading={offered?.loading}
        error={offered?.problem}
        hint={VOICE_HINTS[provider]}
        listen={speech && { speech }}
      />

      {provider === SYSTEM_PROVIDER ? (
        <SelectField
          label="Rate"
          options={RATE_OPTIONS}
          value={String(settings.system.rate)}
          onChange={(rate) =>
            setSettings({ ...settings, system: { rate: Number(rate) } })
          }
          searchable={false}
          missingLabel={(rate) => formatRate(Number(rate))}
          hint="1.0× is the voice’s normal pace."
        />
      ) : (
        <ElevenLabsFields
          settings={settings.elevenlabs}
          models={offered?.models ?? []}
          loading={offered?.loading}
          onChange={(elevenlabs) => setSettings({ ...settings, elevenlabs })}
        />
      )}
    </Dialog>
  );
}

const LISTEN_HINT =
  "Listen waits for the Phrase being spoken, then goes ahead of the rest.";

/** What the Voice field says of where each Provider's voices come from. */
const VOICE_HINTS: Record<ProviderName, string> = {
  system: LISTEN_HINT,
  elevenlabs: `The voices in My Voices on the ElevenLabs site — add one there, then open these settings again. ${LISTEN_HINT}`,
};
