/**
 * One choice in a live Scene/Source/Input/Filter picker — the same shape the
 * SDK's `OperandOption` uses, so an Options Source and this custom
 * editor↔plugin channel can share one resolver function on the plugin side.
 */
export type PickerOption = {
  value: string;
  label: string;
};

/** A Source's visibility setting: on, off, or flipped from whatever it is now. */
export type VisibilityMode = "show" | "hide" | "toggle";

/** A Filter's enabled setting: on, off, or flipped from whatever it is now. */
export type FilterMode = "enable" | "disable" | "toggle";
