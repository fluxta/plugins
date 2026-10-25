import { useEffect, useState } from "react";

/**
 * The current time, read once on mount and again every `intervalMs`, so a
 * render stays pure and an editor left open still moves on to the next day.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
