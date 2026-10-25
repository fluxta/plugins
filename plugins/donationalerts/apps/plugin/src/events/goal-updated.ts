import type { GoalUpdatedFields } from "donationalerts-protocol";
import { z } from "zod";

import { Numeric } from "./numeric";

export const GOAL_UPDATED = "goal-updated";

/** Every Event Field the manifest declares for Goal Updated. */
export type GoalUpdatedPayload = GoalUpdatedFields;

/**
 * Only the fields DonationAlerts documents for a goal. `started_at` and
 * `expires_at` are left out: their `YYYY-MM-DD HH.MM.SS` strings are nothing
 * a Condition can compare.
 */
const GoalSchema = z.object({
  id: Numeric,
  title: z.string().nullish(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]),
  currency: z.string(),
  start_amount: Numeric,
  raised_amount: Numeric,
  goal_amount: Numeric,
});

/**
 * A publication on the goal channel as Goal Updated, or `undefined` when it
 * is not a Goal the plugin can read.
 *
 * Fired for every change DonationAlerts reports, reached or not: whether a
 * Goal is reached is a Condition `raisedAmount ≥ goalAmount`, and the plugin
 * keeps no Goal state to tell a first crossing from a later one.
 */
export function toGoalUpdated(data: unknown): GoalUpdatedPayload | undefined {
  const parsed = GoalSchema.safeParse(data);

  if (!parsed.success) {
    return undefined;
  }

  const goal = parsed.data;
  return {
    goalId: goal.id,
    title: goal.title ?? "",
    isActive: goal.is_active === true || goal.is_active === 1,
    currency: goal.currency,
    startAmount: goal.start_amount,
    raisedAmount: goal.raised_amount,
    goalAmount: goal.goal_amount,
  };
}
