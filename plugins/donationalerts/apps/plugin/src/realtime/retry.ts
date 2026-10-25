/**
 * How long to wait before the `attempt`-th retry (0-based): 1 s, 2 s, 4 s …
 * up to 60 s, each shortened by up to half at random, so plugins that lost
 * DonationAlerts together do not all come back in the same second.
 *
 * The same curve as centrifuge-js's own reconnects with the options in
 * `client.ts`, so every retry the streamer can see behaves alike.
 */
export function retryDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(60_000, 1_000 * 2 ** attempt);
  return Math.round(ceiling * (1 - 0.5 * random()));
}
