import type { BaseEditor } from "@fluxta/sdk/api";
import { useEffect, useState } from "react";
import { isPluginMessage, type EditorMessage, type PickerOption } from "obs-protocol";

/**
 * The chosen Connection's live Scenes. Empty (not "loading") while no
 * Connection is chosen — there is nothing to ask for yet.
 */
export function useScenes(
  editor: BaseEditor,
  connected: Promise<void>,
  connectionId: string | undefined,
): PickerOption[] {
  const [scenes, setScenes] = useState<PickerOption[]>([]);

  useEffect(() => {
    if (!connectionId) {
      setScenes([]);
      return;
    }

    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (
        isPluginMessage(incoming) &&
        incoming.event === "scenes" &&
        incoming.connectionId === connectionId
      ) {
        setScenes(incoming.scenes);
      }
    });

    void connected.then(() => {
      editor.sendToPlugin({ event: "get-scenes", connectionId } satisfies EditorMessage);
    });

    return unsubscribe;
  }, [editor, connected, connectionId]);

  return scenes;
}

/** The Sources placed within one Scene of the chosen Connection — for Set Source Visibility's cascade. */
export function useSceneSources(
  editor: BaseEditor,
  connected: Promise<void>,
  connectionId: string | undefined,
  scene: string | undefined,
): PickerOption[] {
  const [sources, setSources] = useState<PickerOption[]>([]);

  useEffect(() => {
    if (!connectionId || !scene) {
      setSources([]);
      return;
    }

    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (
        isPluginMessage(incoming) &&
        incoming.event === "scene-sources" &&
        incoming.connectionId === connectionId &&
        incoming.scene === scene
      ) {
        setSources(incoming.sources);
      }
    });

    void connected.then(() => {
      editor.sendToPlugin({ event: "get-scene-sources", connectionId, scene } satisfies EditorMessage);
    });

    return unsubscribe;
  }, [editor, connected, connectionId, scene]);

  return sources;
}

/** Every Source/Input on the chosen Connection, regardless of Scene placement. */
export function useInputs(
  editor: BaseEditor,
  connected: Promise<void>,
  connectionId: string | undefined,
): PickerOption[] {
  const [inputs, setInputs] = useState<PickerOption[]>([]);

  useEffect(() => {
    if (!connectionId) {
      setInputs([]);
      return;
    }

    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (
        isPluginMessage(incoming) &&
        incoming.event === "inputs" &&
        incoming.connectionId === connectionId
      ) {
        setInputs(incoming.inputs);
      }
    });

    void connected.then(() => {
      editor.sendToPlugin({ event: "get-inputs", connectionId } satisfies EditorMessage);
    });

    return unsubscribe;
  }, [editor, connected, connectionId]);

  return inputs;
}

/** The Filters attached to one Source — for Set Source Filter's cascade. */
export function useFilters(
  editor: BaseEditor,
  connected: Promise<void>,
  connectionId: string | undefined,
  source: string | undefined,
): PickerOption[] {
  const [filters, setFilters] = useState<PickerOption[]>([]);

  useEffect(() => {
    if (!connectionId || !source) {
      setFilters([]);
      return;
    }

    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (
        isPluginMessage(incoming) &&
        incoming.event === "filters" &&
        incoming.connectionId === connectionId &&
        incoming.source === source
      ) {
        setFilters(incoming.filters);
      }
    });

    void connected.then(() => {
      editor.sendToPlugin({ event: "get-filters", connectionId, source } satisfies EditorMessage);
    });

    return unsubscribe;
  }, [editor, connected, connectionId, source]);

  return filters;
}
