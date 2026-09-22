/**
 * The Cheer Event Source.
 *
 * Bits, unlike Subs, carry no tier — `bits` is the raw amount a condition
 * compares against a threshold itself.
 */
export const CHEER_EVENT = "twitch-cheer";

/** Every field declared for `twitch-cheer` in the manifest. */
export type CheerPayload = {
  /** Empty when the cheerer chose to stay anonymous. */
  userId: string;
  userLogin: string;
  userName: string;
  bits: number;
  message: string;
  isAnonymous: boolean;
};

/**
 * The parts of twurple's cheer event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type CheerSource = {
  userId: string | null;
  userName: string | null;
  userDisplayName: string | null;
  bits: number;
  message: string;
  isAnonymous: boolean;
};

export function toCheerPayload(event: CheerSource): CheerPayload {
  return {
    userId: event.userId ?? "",
    userLogin: event.userName ?? "",
    userName: event.userDisplayName ?? "",
    bits: event.bits,
    message: event.message,
    isAnonymous: event.isAnonymous,
  };
}
