import type { FilterMode, VisibilityMode } from "obs-protocol";

/**
 * Resolves a show/hide/toggle (or enable/disable/toggle) mode to the boolean
 * OBS should be set to. `getCurrent` is only called for "toggle" — the other
 * two modes are idempotent and never need to know the current value
 * (Source/Filter visibility takes a mode, unlike Stream/Record/Mute).
 */
export async function resolveMode(
  mode: VisibilityMode | FilterMode | undefined,
  getCurrent: () => Promise<boolean>,
): Promise<boolean | undefined> {
  switch (mode) {
    case "show":
    case "enable":
      return true;
    case "hide":
    case "disable":
      return false;
    case "toggle":
      return !(await getCurrent());
    default:
      return undefined;
  }
}
