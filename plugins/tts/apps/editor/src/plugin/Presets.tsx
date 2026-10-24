import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  Section,
  useConfirm,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import type { PluginStatus, Preset } from "tts-protocol";

import { presetSummary } from "../shared/presets";
import { sendToPlugin } from "../shared/sendToPlugin";
import { PresetDialog } from "./PresetDialog";

/**
 * The Presets: each a name, a Voice and its Provider's settings, which Speak
 * picks. Added, edited and deleted here; the sidecar saves them.
 */
export function Presets({ status }: { status: PluginStatus }) {
  const editor = usePluginEditor();
  const [adding, setAdding] = useState(false);
  const { presets, providers } = status;

  return (
    <Section
      title="Presets"
      description="A Preset is a voice with its settings, under a name of your own. Every Speak speaks with the Default Preset, or with the one it picks. The Default Preset cannot be deleted — make another one the Default first."
      actions={
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add Preset
        </Button>
      }
    >
      {presets.length === 0 ? (
        <EmptyState>
          No Preset yet. Until there is one, this computer’s voice speaks at
          1.0×.
        </EmptyState>
      ) : (
        presets.map((preset) => (
          <PresetRow key={preset.id} preset={preset} status={status} />
        ))
      )}

      <PresetDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Preset"
        others={presets}
        providers={providers}
        onSave={(preset) =>
          sendToPlugin(editor, { event: "save-preset", preset })
        }
      />
    </Section>
  );
}

function PresetRow({
  preset,
  status,
}: {
  preset: Preset;
  status: PluginStatus;
}) {
  const editor = usePluginEditor();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const { presets, providers, defaults } = status;
  const isDefault = defaults.preset?.id === preset.id;

  return (
    <>
      <ListRow
        title={preset.name}
        badges={isDefault ? <Badge variant="outline">Default</Badge> : null}
        description={presetSummary(preset, providers)}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {isDefault ? null : (
              <Button
                variant="outline"
                onClick={async () => {
                  const sure = await confirm({
                    title: `Delete "${preset.name}"?`,
                    description:
                      "Speaks that use it will drop their Phrases until you choose another.",
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (sure) {
                    sendToPlugin(editor, {
                      event: "delete-preset",
                      id: preset.id,
                    });
                  }
                }}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <PresetDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit Preset"
        preset={preset}
        others={presets.filter(({ id }) => id !== preset.id)}
        providers={providers}
        onSave={(draft) =>
          sendToPlugin(editor, { event: "save-preset", preset: draft })
        }
      />
    </>
  );
}
