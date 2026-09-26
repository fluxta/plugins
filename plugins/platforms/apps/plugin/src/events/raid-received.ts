/**
 * The Raid Received Event Source.
 *
 * Twitch's `channel.raid` subscription type carries both directions of a
 * raid; this Source is the one built from the leg where the Channel is the
 * one being raided. `raid-sent.ts` is the other leg, from the same Twitch
 * event.
 */
export const RAID_RECEIVED_EVENT = "twitch-raid-received";

/** Every field declared for `twitch-raid-received` in the manifest. */
export type RaidReceivedPayload = {
  fromUserId: string;
  fromUserLogin: string;
  fromUserName: string;
  viewers: number;
};

/**
 * The parts of twurple's raid event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type RaidReceivedSource = {
  raidingBroadcasterId: string;
  raidingBroadcasterName: string;
  raidingBroadcasterDisplayName: string;
  viewers: number;
};

export function toRaidReceivedPayload(event: RaidReceivedSource): RaidReceivedPayload {
  return {
    fromUserId: event.raidingBroadcasterId,
    fromUserLogin: event.raidingBroadcasterName,
    fromUserName: event.raidingBroadcasterDisplayName,
    viewers: event.viewers,
  };
}
