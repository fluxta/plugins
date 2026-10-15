export const NAME_MAX = 60;

/**
 * Refuses a name the same way the plugin will, so the editor can catch it
 * before round-tripping it. Names are what Actions, conditions and Event
 * filters show, so two Timers — or two Stopwatches — may not share one.
 */
export function validateName(
  noun: "Stopwatch" | "Timer",
  name: string,
  others: readonly { id: string; name: string }[],
  editingId?: string,
): string | undefined {
  const trimmed = name.trim();

  if (!trimmed) {
    return `Give this ${noun} a name.`;
  }

  if (trimmed.length > NAME_MAX) {
    return `${noun} names are at most ${NAME_MAX} characters.`;
  }

  if (
    others.some((other) => other.id !== editingId && other.name === trimmed)
  ) {
    return `Another ${noun} is already named "${trimmed}".`;
  }

  return undefined;
}
