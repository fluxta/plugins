import { Button, NumberField, Section, SelectField } from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  formatRate,
  RATES,
  VOLUME_MAX,
  type PluginStatus,
  type SpeakSettings,
} from "tts-protocol";

import {
  deviceLabel,
  deviceOf,
  deviceOptions,
  deviceValue,
  missingDevice,
} from "../shared/devices";
import { VoiceField } from "../shared/VoiceField";

type Overrides = Pick<
  SpeakSettings,
  "voice" | "rate" | "volume" | "device" | "lengthLimit"
>;

/**
 * The SelectField value of "Default": the override is absent. Not "": the
 * select reads an empty value as nothing chosen and shows its placeholder,
 * Choose one, over the Default option. No voice, rate or device has this id.
 */
const DEFAULT = "@default";

type OverrideDefaultsProps = {
  values: SpeakSettings;
  update: (changes: Partial<SpeakSettings>) => void;
  /** `undefined` while the sidecar has not answered. */
  status: PluginStatus | undefined;
};

/**
 * Speak's overrides of the Plugin Settings defaults: a Section of their own,
 * its fields hidden until it is opened — open from the start when one is
 * set, so it is never hidden. Each is Default, which follows Plugin
 * Settings, or its own value.
 */
export function OverrideDefaults({
  values,
  update,
  status,
}: OverrideDefaultsProps) {
  const overridden = (
    ["voice", "rate", "volume", "device", "lengthLimit"] as const
  ).filter((key) => values[key] !== undefined).length;
  const [opened, setOpened] = useState<boolean>();
  const open = opened ?? overridden > 0;

  // `undefined` drops the key from the saved settings: back to Default.
  const set = <K extends keyof Overrides>(key: K, value: Overrides[K]) =>
    update({ [key]: value });

  const defaults = status?.defaults;
  const defaultVoice = status?.defaultVoice;
  const devices = status?.devices ?? [];
  const followed = (shown: string | undefined) =>
    shown === undefined ? "Default" : `Default — ${shown}`;

  return (
    <Section
      title={`Override defaults${overridden > 0 ? ` (${overridden})` : ""}`}
      description="This Speak’s own voice, rate, volume, output device and length limit. Each one left at Default follows the plugin’s settings."
      actions={
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpened(!open)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      }
    >
      {open && (
        <>
          <VoiceField
            label="Voice"
            options={[
              {
                value: DEFAULT,
                label: followed(
                  defaultVoice &&
                    (defaultVoice.name ??
                      `${defaultVoice.id}, not available right now`),
                ),
              },
              ...(status?.voices ?? []).map(({ id, label }) => ({
                value: id,
                label,
              })),
            ]}
            value={values.voice ?? DEFAULT}
            onChange={(voice) =>
              set("voice", voice === DEFAULT ? undefined : voice)
            }
            loading={!status}
            error={status?.voicesProblem}
            // The Overrides as they stand, unsaved; the sidecar lays them
            // over the Defaults.
            listen={{
              voice: values.voice,
              rate: values.rate,
              volume: values.volume,
              device: values.device,
            }}
          />

          <SelectField
            label="Rate"
            options={[
              {
                value: DEFAULT,
                label: followed(defaults && formatRate(defaults.rate)),
              },
              ...RATES.map((rate) => ({
                value: String(rate),
                label: formatRate(rate),
              })),
            ]}
            value={values.rate === undefined ? DEFAULT : String(values.rate)}
            onChange={(rate) =>
              set("rate", rate === DEFAULT ? undefined : Number(rate))
            }
            searchable={false}
            missingLabel={(rate) => formatRate(Number(rate))}
          />

          <NumberField
            label="Volume, %"
            value={values.volume}
            onChange={(volume) => set("volume", volume)}
            min={0}
            max={VOLUME_MAX}
            placeholder={followed(defaults && `${defaults.volume}`)}
            hint="Empty follows the default."
          />

          <SelectField
            label="Output device"
            options={[
              {
                value: DEFAULT,
                label: followed(
                  defaults && deviceLabel(defaults.device, devices),
                ),
              },
              ...deviceOptions(devices),
            ]}
            value={
              values.device === undefined ? DEFAULT : deviceValue(values.device)
            }
            onChange={(value) =>
              set(
                "device",
                value === DEFAULT
                  ? undefined
                  : deviceOf(value, devices, values.device),
              )
            }
            missingLabel={missingDevice(values.device)}
            loading={!status}
            error={status?.devicesProblem}
            hint="Headphones, for a Phrase only you should hear."
          />

          <NumberField
            label="Length limit"
            value={values.lengthLimit}
            onChange={(lengthLimit) => set("lengthLimit", lengthLimit)}
            min={1}
            placeholder={followed(
              defaults && (defaults.lengthLimit?.toString() ?? "no limit"),
            )}
            hint="The most characters this Phrase keeps, cut at the last word within them. Empty follows the default."
          />
        </>
      )}
    </Section>
  );
}
