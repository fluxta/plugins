import { validateDuration } from "timers-protocol";

/**
 * What is wrong with a duration typed into an Action's field, if anything.
 * A field holding a `{{…}}` reference is only known when the step runs, so
 * it is not judged here; nor is an empty one, which each field explains
 * itself.
 */
export function durationFieldError(
  text: string | undefined,
): string | undefined {
  if (!text?.trim() || text.includes("{{")) {
    return undefined;
  }

  return validateDuration(text);
}
