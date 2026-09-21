/**
 * The Raid Sent Event Source.
 *
 * Twitch's `channel.raid` subscription type carries both directions of a
 * raid; this Source is the one built from the leg where the Channel is the
 * one doing the raiding. `raid-received.ts` is the other leg, from the same
 * Twitch event.
 */
export const RAID_SENT_EVENT = "twitch-raid-sent";

/** Every field declared for `twitch-raid-sent` in the manifest. */
export type RaidSentPayload = {
  toUserId: string;
  toUserLogin: string;
  toUserName: string;
  viewers: number;
};

/**
 * The parts of twurple's raid event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type RaidSentSource = {
  raidedBroadcasterId: string;
  raidedBroadcasterName: string;
  raidedBroadcasterDisplayName: string;
  viewers: number;
};

export function toRaidSentPayload(event: RaidSentSource): RaidSentPayload {
  return {
    toUserId: event.raidedBroadcasterId,
    toUserLogin: event.raidedBroadcasterName,
    toUserName: event.raidedBroadcasterDisplayName,
    viewers: event.viewers,
  };
}
