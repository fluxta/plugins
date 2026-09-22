import type { OBSWebSocket } from "obs-websocket-js";
import type { PickerOption } from "obs-protocol";

/**
 * Every Group name on the Connection — `listGroups` with the PickerOption
 * wrapper peeled off. The Scene Item walk needs the bare names to tell a
 * Group from a Scene and to pick the request that answers for each.
 */
export async function listGroupNames(obs: OBSWebSocket): Promise<string[]> {
  const { groups } = await obs.call("GetGroupList");
  return groups;
}

export async function listGroups(obs: OBSWebSocket): Promise<PickerOption[]> {
  const names = await listGroupNames(obs);
  return names.map((name) => ({ value: name, label: name }));
}

/**
 * A Group has no single enabled state of its own — it is a set of Scene
 * Items that can each already sit in a different state. "Toggle" therefore
 * reads the first Item as the reference state and flips every Item to its
 * opposite, rather than asking what "the group's" current state even means.
 */
export async function isGroupVisible(obs: OBSWebSocket, group: string): Promise<boolean> {
  const { sceneItems } = await obs.call("GetGroupSceneItemList", { sceneName: group });
  const first = sceneItems[0];
  return first ? Boolean(first["sceneItemEnabled"]) : false;
}

export async function setGroupVisible(
  obs: OBSWebSocket,
  group: string,
  visible: boolean,
): Promise<void> {
  const { sceneItems } = await obs.call("GetGroupSceneItemList", { sceneName: group });

  await Promise.all(
    sceneItems.map((item) =>
      obs.call("SetSceneItemEnabled", {
        sceneName: group,
        sceneItemId: Number(item["sceneItemId"]),
        sceneItemEnabled: visible,
      }),
    ),
  );
}
