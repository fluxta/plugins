import {
  EditorPage,
  PluginEditorLayout,
  Section,
  SelectField,
  usePluginEditor,
  type StatusTone,
} from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";
import { VOLUME_MAX, type Defaults, type PluginStatus } from "tts-protocol";

import {
  deviceOf,
  deviceOptions,
  deviceValue,
  missingDevice,
  systemDefaultNow,
} from "../shared/devices";
import { missingPreset, presetOptions, presetRef } from "../shared/presets";
import { SavedNumberField } from "../shared/SavedNumberField";
import { sendToPlugin } from "../shared/sendToPlugin";
import { useStatus } from "../shared/useStatus";
import { ElevenLabs, elevenLabsTone } from "./ElevenLabs";
import { Presets } from "./Presets";
import { RecentProblems } from "./RecentProblems";

/**
 * How long to wait for the sidecar before saying the plugin process itself is
 * not answering — distinct from the Editor's own link to Fluxta, which
 * `<PluginEditorProvider>` already reports on.
 */
const SIDECAR_TIMEOUT_MS = 3000;

export function PluginEditorApp() {
  const status = useStatus();
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSilent(true), SIDECAR_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!status) {
    return (
      <EditorPage>
        {silent ? (
          <p className="hint">
            The plugin process is not answering. Fluxta does not restart a
            crashed process — start the plugin again from the settings list, and
            check its log if it keeps failing.
          </p>
        ) : null}
      </EditorPage>
    );
  }

  return (
    <PluginEditorLayout
      sections={[
        {
          id: "presets",
          label: "Presets",
          count: status.presets.length,
          content: <Presets status={status} />,
        },
        {
          id: "defaults",
          label: "Defaults",
          content: <DefaultsForm status={status} />,
        },
        {
          id: "elevenlabs",
          label: "ElevenLabs",
          ...withTone(elevenLabsTone(status.elevenLabs)),
          content: <ElevenLabs status={status.elevenLabs} />,
        },
        {
          id: "problems",
          label: "Recent problems",
          // A red dot until the plugin restarts: a dropped Phrase is a
          // viewer's message nobody heard.
          ...(status.problems.length > 0 && { tone: "error" as const }),
          content: <RecentProblems problems={status.problems} />,
        },
      ]}
    />
  );
}

function DefaultsForm({ status }: { status: PluginStatus }) {
  const editor = usePluginEditor();
  const { defaults, presets, devices } = status;
  const now = systemDefaultNow(devices);

  const save = (changes: Partial<Defaults>) =>
    sendToPlugin(editor, {
      event: "set-defaults",
      defaults: { ...defaults, ...changes },
    });

  // The layout pads the section itself: an EditorPage here would pad it
  // twice.
  return (
    <Section
      title="Defaults"
      description="How every Speak speaks unless it picks a Preset of its own, or overrides the rest under Override defaults."
    >
      <SelectField
        label="Default Preset"
        options={presetOptions(presets)}
        value={defaults.preset?.id}
        onChange={(id) => {
          const preset = presetRef(id, presets);
          if (preset) {
            save({ preset });
          }
        }}
        placeholder="This computer’s voice"
        emptyMessage="No Preset yet — add one under Presets."
        missingLabel={missingPreset(defaults.preset)}
        hint="Every Speak left at Default speaks with it. Until you pick one, this computer’s voice speaks at 1.0×."
      />

      <SavedNumberField
        label="Volume, %"
        saved={defaults.volume}
        onSave={(volume) => save({ volume: volume ?? VOLUME_MAX })}
        min={0}
        max={VOLUME_MAX}
        hint="100 % is the voice as it is synthesized, with no boost."
      />

      <SelectField
        label="Output device"
        options={deviceOptions(devices)}
        value={deviceValue(defaults.device)}
        onChange={(value) =>
          save({ device: deviceOf(value, devices, defaults.device) })
        }
        missingLabel={missingDevice(defaults.device)}
        error={status.devicesProblem}
        hint={`Who hears the speech. System default is whatever this computer plays on${now ? ` — now ${now}` : ""}. A Phrase whose device goes away is cut off, never moved to another one.`}
      />

      <SavedNumberField
        label="Length limit"
        saved={defaults.lengthLimit ?? undefined}
        onSave={(lengthLimit) => save({ lengthLimit: lengthLimit ?? null })}
        min={1}
        placeholder="No limit"
        hint="Longer text is cut at the last word within this many characters, and the rest is not spoken. An emoji counts as one. Empty: no limit."
      />
    </Section>
  );
}

/** A section's dot, when it has one. */
function withTone(tone: StatusTone | undefined): { tone?: StatusTone } {
  return tone ? { tone } : {};
}
