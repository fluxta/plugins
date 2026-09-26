/** The VIP Added Event Source. */
export const VIP_ADDED_EVENT = "twitch-vip-added";

/** Every field declared for `twitch-vip-added` in the manifest. */
export type VipAddedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's vip-add event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type VipAddedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toVipAddedPayload(event: VipAddedSource): VipAddedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}
