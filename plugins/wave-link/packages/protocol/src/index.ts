import { z } from "zod";

export const targetKinds = ["channel", "channelMix", "mix"] as const;
export type TargetKind = (typeof targetKinds)[number];
export type Target = {
  targetKind: TargetKind;
  channelId?: string;
  mixId?: string;
};
export type VolumeSettings = Target & { volumePercent?: string | number };
export type MuteSettings = Target & { mode?: "mute" | "unmute" | "toggle" };
export type ActionResult = { success: boolean; error: string };

const levelSchema = z.object({
  volumePercent: z.number().min(0).max(100).nullable(),
  muted: z.boolean().nullable(),
});
export const mixSchema = levelSchema.extend({
  id: z.string(),
  name: z.string(),
});
export const channelMixSchema = levelSchema.extend({ id: z.string() });
export const channelSchema = mixSchema.extend({
  mixes: z.array(channelMixSchema),
});
export const snapshotSchema = z.object({
  status: z.enum(["connecting", "connected", "error"]),
  message: z.string(),
  channels: z.array(channelSchema),
  mixes: z.array(mixSchema),
  interfaceRevision: z.number().nullable(),
  lastError: z.string(),
});
export type LevelState = z.infer<typeof levelSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type Mix = z.infer<typeof mixSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const emptySnapshot = (): Snapshot => ({
  status: "connecting",
  message: "Looking for local Wave Link 3…",
  channels: [],
  mixes: [],
  interfaceRevision: null,
  lastError: "",
});

export const editorMessageSchema = z.object({ event: z.literal("get-status") });
export const pluginMessageSchema = z.object({
  event: z.literal("status"),
  status: snapshotSchema,
});

export type TargetFields = {
  targetKind: TargetKind;
  channelId: string;
  channelName: string;
  mixId: string;
  mixName: string;
};
export type VolumeChange = TargetFields & {
  volumePercent: number;
  previousVolumePercent: number;
};
export type MuteChange = TargetFields & {
  muted: boolean;
  previousMuted: boolean;
};
export type ConnectionChange = {
  status: Snapshot["status"];
  connected: boolean;
  message: string;
};

export function numericValue(value: unknown): number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && !value.trim())
  ) {
    throw new Error("Enter a numeric volume or percentage-point adjustment.");
  }
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error("Volume must be a finite number.");
  return number;
}

export function parseTarget(value: unknown): Target {
  return z
    .object({
      targetKind: z.enum(targetKinds),
      channelId: z.string().min(1).optional(),
      mixId: z.string().min(1).optional(),
    })
    .parse(value);
}
