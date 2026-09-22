/** The VIP Removed Event Source. */
export const VIP_REMOVED_EVENT = "twitch-vip-removed";

/** Every field declared for `twitch-vip-removed` in the manifest. */
export type VipRemovedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's vip-remove event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type VipRemovedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toVipRemovedPayload(event: VipRemovedSource): VipRemovedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}
