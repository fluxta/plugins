/**
 * What an Action's settings hold once Fluxta has interpolated them. A string
 * that is exactly one `{{…}}` reference keeps its value's type, so a setting
 * typed as text can arrive as a number or a boolean; an absent reference
 * arrives as `""`.
 */

/** A setting as text: a number or a boolean as its string, anything else `""`. */
export function textOf(value: unknown): string {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : "";
}

/**
 * A Tag as it is compared: exactly, case included — ids are case-sensitive —
 * without the whitespace around it, so `123` and `" 123 "` are one Tag.
 * `""` when nothing is left.
 */
export function tagOf(value: unknown): string {
  return textOf(value).trim();
}

/** Speak's Tags, each as compared, without the empty ones and repeats. */
export function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(tagOf).filter((tag) => tag !== ""))];
}
