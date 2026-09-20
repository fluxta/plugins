import { usePluginData } from "@fluxta/sdk/ui";
import { isPluginMessage, type PickerOption } from "obs-protocol";

/**
 * The chosen Connection's live Scenes. Empty (not "loading") while no
 * Connection is chosen — there is nothing to ask for yet.
 */
export function useScenes(connectionId: string | undefined): PickerOption[] {
  const { data } = usePluginData<PickerOption[]>(
    connectionId ? { event: "get-scenes", connectionId } : null,
    "scenes",
  );

  return data ?? [];
}

/** The Sources placed within one Scene of the chosen Connection — for Set Source Visibility's cascade. */
export function useSceneSources(
  connectionId: string | undefined,
  scene: string | undefined,
): PickerOption[] {
  // The reply's data lives under `sources`, not under the `scene-sources`
  // event name, so a function response — matching the event and echoed
  // fields by hand — replaces the string shorthand.
  const { data } = usePluginData<PickerOption[]>(
    connectionId && scene ? { event: "get-scene-sources", connectionId, scene } : null,
    (message) =>
      isPluginMessage(message) &&
      message.event === "scene-sources" &&
      message.connectionId === connectionId &&
      message.scene === scene
        ? message.sources
        : undefined,
  );

  return data ?? [];
}

/**
 * Every Input on the chosen Connection, regardless of Scene placement.
 *
 * `kinds`, when given, narrows this to those OBS kind ids (e.g. only Browser
 * Sources).
 */
export function useInputs(
  connectionId: string | undefined,
  kinds?: readonly string[],
): PickerOption[] {
  const { data } = usePluginData<PickerOption[]>(
    connectionId
      ? { event: "get-inputs", connectionId, ...(kinds ? { kinds: [...kinds] } : {}) }
      : null,
    "inputs",
  );

  return data ?? [];
}

/** Every Group configured on the chosen Connection. */
export function useGroups(connectionId: string | undefined): PickerOption[] {
  const { data } = usePluginData<PickerOption[]>(
    connectionId ? { event: "get-groups", connectionId } : null,
    "groups",
  );

  return data ?? [];
}

/** The Filters attached to one Source — for Set Source Filter's cascade. */
export function useFilters(
  connectionId: string | undefined,
  source: string | undefined,
): PickerOption[] {
  const { data } = usePluginData<PickerOption[]>(
    connectionId && source ? { event: "get-filters", connectionId, source } : null,
    "filters",
  );

  return data ?? [];
}
