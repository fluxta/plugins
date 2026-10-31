/**
 * Reads a setting edited through a `TemplateField`, after the host has
 * substituted its Run Variable references (see Fluxta's Run Variables guide,
 * https://fluxta.app/docs/plugins/guides/run-variables).
 *
 * A setting that was exactly one reference arrives with the variable's own
 * type intact, so a field the editor only ever saves as text can hold a
 * number or a boolean by the time `onTrigger` sees it — reading it as a
 * string directly would throw on `.trim()`.
 */
export function templatedText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}
