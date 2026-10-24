/**
 * The SelectField value of "Default": the override is absent. Not "": the
 * select reads an empty value as nothing chosen and shows its placeholder,
 * Choose one, over the Default option. No Preset or device has this id.
 */
export const DEFAULT = "@default";

/** "Default", with what it follows when that is known. */
export function followed(shown: string | undefined): string {
  return shown === undefined ? "Default" : `Default — ${shown}`;
}
