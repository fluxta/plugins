import { z } from "zod";

import type { Stopwatch } from "./stopwatch";
import {
  DurationMsSchema,
  MaxTimesSchema,
  RepeatedStartSchema,
  type Timer,
} from "./timer";

/**
 * The message protocol between the Plugin sidecar and its editors.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so the sidecar and every editor page agree on it by
 * construction rather than by convention.
 *
 * Every message is an object with an `event` discriminant.
 */

/** Everything the editors render. */
export type PluginStatus = {
  timers: Timer[];
  stopwatches: Stopwatch[];
};

/** What the Plugin Editor sets on a Timer; its countdown is the sidecar's. */
export type TimerFields = Omit<Timer, "id" | "countdown">;

const TimerFieldsSchema = z.object({
  name: z.string(),
  durationMs: DurationMsSchema,
  repeatedStart: RepeatedStartSchema,
  repeat: z.boolean(),
  maxTimes: MaxTimesSchema,
});

const EditorMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("get-status") }),
  z.object({ event: z.literal("create-timer"), timer: TimerFieldsSchema }),
  z.object({
    event: z.literal("update-timer"),
    id: z.string(),
    timer: TimerFieldsSchema,
  }),
  z.object({ event: z.literal("delete-timer"), id: z.string() }),
  z.object({ event: z.literal("create-stopwatch"), name: z.string() }),
  z.object({
    event: z.literal("rename-stopwatch"),
    id: z.string(),
    name: z.string(),
  }),
  z.object({ event: z.literal("delete-stopwatch"), id: z.string() }),
]);

/** A message an editor sends to the sidecar. */
export type EditorMessage = z.infer<typeof EditorMessageSchema>;

/**
 * A message the sidecar sends to its editors.
 *
 * A refused write gets its own message rather than a field on the status:
 * the refusal belongs to the one edit that caused it, not to a snapshot
 * every editor receives. `of` says which list the edit was made in, so the
 * editor shows it there.
 */
export type PluginMessage =
  | { event: "status"; status: PluginStatus }
  | { event: "refused"; of: "timers" | "stopwatches"; message: string };

/**
 * Narrows a value that arrived over the wire. Both sides receive `unknown`
 * JSON, so neither should trust the other's shape.
 */
export function isEditorMessage(value: unknown): value is EditorMessage {
  return EditorMessageSchema.safeParse(value).success;
}

export function isPluginMessage(value: unknown): value is PluginMessage {
  if (typeof value !== "object" || value === null || !("event" in value)) {
    return false;
  }

  return value.event === "status" || value.event === "refused";
}
