import type { OBSWebSocket } from "obs-websocket-js";
import type { PickerOption } from "obs-protocol";

export async function listFilters(obs: OBSWebSocket, source: string): Promise<PickerOption[]> {
  const { filters } = await obs.call("GetSourceFilterList", { sourceName: source });
  return filters.map((filter) => {
    const name = String(filter["filterName"]);
    return { value: name, label: name };
  });
}

export async function isFilterEnabled(
  obs: OBSWebSocket,
  source: string,
  filter: string,
): Promise<boolean> {
  const { filterEnabled } = await obs.call("GetSourceFilter", {
    sourceName: source,
    filterName: filter,
  });
  return filterEnabled;
}

export async function setFilterEnabled(
  obs: OBSWebSocket,
  source: string,
  filter: string,
  enabled: boolean,
): Promise<void> {
  await obs.call("SetSourceFilterEnabled", {
    sourceName: source,
    filterName: filter,
    filterEnabled: enabled,
  });
}
