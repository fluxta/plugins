import type { OBSWebSocket } from "obs-websocket-js";

import { listGroupNames } from "./groups";

/**
 * One placement of a Source — OBS's own "Scene Item". Its container is a
 * Scene or a Group, and the two answer different requests: `GetSceneItemList`
 * speaks for Scenes only, `GetGroupSceneItemList` for Groups only, and each
 * names just its own direct children. Every walk here therefore descends
 * Group by Group itself rather than expecting one request to see the tree.
 */
export type SceneItemRef = {
  /** The Scene or Group whose direct child this item is. */
  container: string;
  /** The Source being placed — what pickers show and settings store. */
  source: string;
  /** OBS's numeric id for this placement, unique within its container. */
  itemId: number;
  /**
   * Names of the Groups between the walk's root and this item, excluding the
   * root itself — a label's way of saying where the item sits without
   * repeating the container the caller already chose.
   */
  path: readonly string[];
};

type RawSceneItem = { [key: string]: unknown };

/** A container's items, asked in the one request that answers for it. */
async function listContainerItems(
  obs: OBSWebSocket,
  container: string,
  isGroup: boolean,
): Promise<RawSceneItem[]> {
  const { sceneItems } = isGroup
    ? await obs.call("GetGroupSceneItemList", { sceneName: container })
    : await obs.call("GetSceneItemList", { sceneName: container });

  return sceneItems;
}

type Visit = (ref: SceneItemRef) => boolean;

/**
 * Depth-first over one container: an item is reported before its contents, so
 * a Group and the Sources inside it read in OBS's own order. `visit` returning
 * false stops the whole walk — a name search has no reason to enumerate the
 * rest of the tree. `visited` guards the descent: OBS rejects recursive
 * nesting, but a runtime guard is cheaper than a call stack that believes it.
 */
async function walk(
  obs: OBSWebSocket,
  container: string,
  isGroup: boolean,
  path: readonly string[],
  visited: Set<string>,
  visit: Visit,
): Promise<boolean> {
  for (const item of await listContainerItems(obs, container, isGroup)) {
    const source = String(item["sourceName"]);
    const ref: SceneItemRef = {
      container,
      source,
      itemId: Number(item["sceneItemId"]),
      path,
    };

    if (!visit(ref)) {
      return false;
    }

    if (Boolean(item["isGroup"]) && !visited.has(source)) {
      visited.add(source);

      if (!(await walk(obs, source, true, [...path, source], visited, visit))) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Walks from a Scene — or from a Group, since a Group is a container in its
 * own right; the two kinds are told apart by name (Sources are uniquely
 * named, so a Group's name is never a Scene's).
 */
async function walkRoot(obs: OBSWebSocket, root: string, visit: Visit): Promise<void> {
  const groups = await listGroupNames(obs);
  await walk(obs, root, groups.includes(root), [], new Set(), visit);
}

/**
 * Every Source placed in a Scene or Group, in tree order — a Group's own item
 * first, then what it contains. Only Groups are descended into: a nested
 * Scene is a container in its own right whose items belong to that Scene, not
 * to the one being listed.
 */
export async function listSceneItemRefs(
  obs: OBSWebSocket,
  root: string,
): Promise<SceneItemRef[]> {
  const refs: SceneItemRef[] = [];

  await walkRoot(obs, root, (ref) => {
    refs.push(ref);
    return true;
  });

  return refs;
}

/**
 * The placement of one named Source within a root — the first match in tree
 * order. A Source can be placed more than once inside one Scene, and nothing
 * in the settings model could tell those placements apart anyway.
 */
export async function findSceneItemRef(
  obs: OBSWebSocket,
  root: string,
  source: string,
): Promise<SceneItemRef | undefined> {
  let found: SceneItemRef | undefined;

  await walkRoot(obs, root, (ref) => {
    if (ref.source !== source) {
      return true;
    }

    found = ref;
    return false;
  });

  return found;
}

/**
 * The Scene(s) that own a Group's item. A Group can be referenced by more
 * than one Scene, and each placement holds the same items, so a change
 * inside it belongs to every owning Scene alike. Scenes are searched by name
 * because obs-websocket has no "parent of this source" request.
 */
async function scenesOwningGroup(obs: OBSWebSocket, group: string): Promise<string[]> {
  const { scenes } = await obs.call("GetSceneList");

  const owning = await Promise.all(
    scenes.map(async (scene) => {
      const name = String(scene["sceneName"]);
      const { sceneItems } = await obs.call("GetSceneItemList", { sceneName: name });
      return sceneItems.some((item) => String(item["sourceName"]) === group) ? name : undefined;
    }),
  );

  return owning.filter((name): name is string => name !== undefined);
}

/**
 * Everything `SceneItemEnableStateChanged` needs resolved before this
 * plugin's own event can be shaped from it: the Source it names and the
 * Scene(s) whose visibility it changed. OBS reports the container, which is
 * the Scene itself for a direct child and a Group otherwise — and this
 * plugin speaks Scene + Source (that is the pair its editors offer), so a
 * Group's owning Scenes stand in for it.
 *
 * A Group that no Scene lists directly (the protocol allows nested Groups,
 * though the OBS UI cannot create them) falls back to its own name rather
 * than dropping the change. Throws when the placement itself is gone.
 */
export async function resolveSceneItemChange(
  obs: OBSWebSocket,
  container: string,
  itemId: number,
): Promise<{ source: string; scenes: string[] }> {
  const groups = await listGroupNames(obs);
  const isGroup = groups.includes(container);
  const items = await listContainerItems(obs, container, isGroup);
  const item = items.find((candidate) => Number(candidate["sceneItemId"]) === itemId);

  if (!item) {
    throw new Error(`No scene item ${itemId} in "${container}"`);
  }

  const owning = isGroup ? await scenesOwningGroup(obs, container) : [];

  return {
    source: String(item["sourceName"]),
    scenes: owning.length > 0 ? owning : [container],
  };
}
