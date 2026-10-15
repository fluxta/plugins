import { useEffect, useState } from "react";

/**
 * The current time for a row that shows a clock: moved on exactly when what
 * the row shows next changes — `nextChange(now)`, or never — and never
 * earlier than `since`, when the status the row shows arrived.
 *
 * Ticking on the shown value's own second boundaries, rather than once a
 * second from whenever the page opened, keeps a countdown in step with the
 * sidecar firing it. And a status read against a time older than itself
 * would show a clock running backwards for up to a second — a Timer that
 * had just gone on to its next cycle read a second too long.
 */
export function useNow(
  since: number,
  nextChange: (now: number) => number | undefined,
): number {
  const [ticked, setTicked] = useState(() => Date.now());
  const now = Math.max(ticked, since);
  const changeAt = nextChange(now);

  useEffect(() => {
    if (changeAt === undefined) {
      return;
    }

    const timer = setTimeout(
      () => setTicked(Date.now()),
      Math.max(0, changeAt - Date.now()),
    );
    return () => clearTimeout(timer);
    // `ticked` too: a timeout that fired a moment early leaves `changeAt`
    // as it was, and must be set again for the rest.
  }, [changeAt, ticked]);

  return now;
}
