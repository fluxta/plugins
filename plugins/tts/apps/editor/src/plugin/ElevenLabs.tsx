import {
  Button,
  ListRow,
  Section,
  StatusBadge,
  TextField,
  useConfirm,
  usePluginEditor,
  type StatusTone,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import type { ElevenLabsStatus } from "tts-protocol";

import { sendToPlugin } from "../shared/sendToPlugin";

/**
 * The ElevenLabs account: its API key — stored by the sidecar and never
 * shown again, so the field only replaces it — and how the latest call to
 * ElevenLabs went.
 */
export function ElevenLabs({ status }: { status: ElevenLabsStatus }) {
  const editor = usePluginEditor();
  const confirm = useConfirm();
  const [key, setKey] = useState("");
  const hasKey = status.state !== "no-key";

  const save = () => {
    if (key.trim() !== "") {
      sendToPlugin(editor, { event: "set-elevenlabs-key", key: key.trim() });
      setKey("");
    }
  };

  return (
    <Section
      title="ElevenLabs"
      description="The voices of your ElevenLabs account, for Presets: the ones in My Voices on the site."
    >
      <ListRow
        title="Account"
        badges={
          <StatusBadge tone={elevenLabsTone(status) ?? "idle"}>
            {LABELS[status.state]}
          </StatusBadge>
        }
        description={DESCRIPTIONS[status.state]}
        detail={
          status.state === "not-connected" ? (
            <p role="alert" className="problem">
              {status.reason}
            </p>
          ) : null
        }
      />

      <TextField
        label="API key"
        type="password"
        value={key}
        onChange={setKey}
        placeholder={
          hasKey ? "•••• saved — paste another to replace it" : "sk_…"
        }
        hint="From elevenlabs.io → Developers → API Keys. Give the plugin a key of its own, allowed only text to speech and reading voices and models, with a credit limit: Fluxta keeps the key in its settings as it is, and the limit caps what a leak could cost."
      />

      <div className="actions">
        <Button disabled={key.trim() === ""} onClick={save}>
          Save key
        </Button>
        {hasKey ? (
          <Button
            variant="outline"
            onClick={async () => {
              const sure = await confirm({
                title: "Remove the API key?",
                description:
                  "Presets with ElevenLabs voices will drop their Phrases until you add a key again.",
                confirmLabel: "Remove",
                destructive: true,
              });
              if (sure) {
                sendToPlugin(editor, { event: "remove-elevenlabs-key" });
              }
            }}
          >
            Remove key
          </Button>
        ) : null}
      </div>
    </Section>
  );
}

/** The section's dot in the navigation; none without a key. */
export function elevenLabsTone(
  status: ElevenLabsStatus,
): StatusTone | undefined {
  switch (status.state) {
    case "no-key":
      return undefined;
    case "checking":
      return "pending";
    case "connected":
      return "ok";
    case "not-connected":
      return "error";
  }
}

const LABELS: Record<ElevenLabsStatus["state"], string> = {
  "no-key": "No key",
  checking: "Checking…",
  connected: "Connected",
  "not-connected": "Not connected",
};

const DESCRIPTIONS: Record<ElevenLabsStatus["state"], string> = {
  "no-key": "Paste an API key below to use ElevenLabs voices.",
  checking: "Asking ElevenLabs for the voices of this key.",
  connected: "The latest call to ElevenLabs went through.",
  "not-connected":
    "The latest call to ElevenLabs did not go through. Every Phrase tries again, so once this is fixed it turns Connected by itself.",
};
