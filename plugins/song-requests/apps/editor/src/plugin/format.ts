/** Seconds as the editors show them: m:ss. */
export function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * When a History entry left the air, as the editors show it. The editor
 * runs on this computer, so its own locale and time zone are the
 * streamer's.
 */
export function formatTimestamp(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}
