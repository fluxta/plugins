import type {
  Channel,
  LevelState,
  Mix,
  MuteChange,
  Target,
  TargetFields,
  VolumeChange,
} from "wave-link-protocol";
import { z } from "zod";

const id = z.string().min(1);
const level = z.number().min(0).max(1);
const fields = { level: level.optional(), isMuted: z.boolean().optional() };
const channelMix = z
  .object({ id: id.optional(), mixId: id.optional(), ...fields })
  .refine(
    (value) => Boolean(value.id ?? value.mixId),
    "A Channel Mix needs an id.",
  );
const channel = z.object({
  id,
  name: z.string(),
  ...fields,
  mixes: z.array(channelMix).default([]),
});
const mix = z.object({ id, name: z.string(), ...fields });
const channelsReply = z.object({ channels: z.array(channel) });
const mixesReply = z.object({ mixes: z.array(mix) });
const channelPatch = z.object({
  id,
  name: z.string().optional(),
  ...fields,
  mixes: z.array(channelMix).optional(),
});
const mixPatch = mix.partial().required({ id: true });

function normalized(value: { level?: number; isMuted?: boolean }): LevelState {
  return {
    volumePercent: value.level === undefined ? null : value.level * 100,
    muted: value.isMuted ?? null,
  };
}
function patched(
  old: LevelState,
  value: { level?: number; isMuted?: boolean },
): LevelState {
  return {
    volumePercent:
      value.level === undefined ? old.volumePercent : value.level * 100,
    muted: value.isMuted ?? old.muted,
  };
}

export class MixerState {
  channels: Channel[] = [];
  mixes: Mix[] = [];
  ready = false;
  private mixIdFields = new Map<string, "id" | "mixId">();

  constructor(
    private readonly volumeChanged: (change: VolumeChange) => void,
    private readonly muteChanged: (change: MuteChange) => void,
  ) {}

  clear(): void {
    this.ready = false;
    this.channels = [];
    this.mixes = [];
    this.mixIdFields.clear();
  }

  replaceChannels(value: unknown): void {
    const parsed = channelsReply.parse(value);
    this.change(() => {
      this.mixIdFields.clear();
      this.channels = parsed.channels.map((entry) => ({
        id: entry.id,
        name: entry.name,
        ...normalized(entry),
        mixes: entry.mixes.map((contribution) => {
          const mixId = contribution.id ?? contribution.mixId!;
          this.mixIdFields.set(
            JSON.stringify([entry.id, mixId]),
            contribution.id ? "id" : "mixId",
          );
          return { id: mixId, ...normalized(contribution) };
        }),
      }));
    });
  }

  replaceMixes(value: unknown): void {
    const parsed = mixesReply.parse(value);
    this.change(() => {
      this.mixes = parsed.mixes.map((entry) => ({
        id: entry.id,
        name: entry.name,
        ...normalized(entry),
      }));
    });
  }

  /** Partial lists in channelChanged must not delete the other Mixes. */
  patchChannel(value: unknown): boolean {
    const patch = channelPatch.parse(value);
    const entry = this.channels.find((entry) => entry.id === patch.id);
    if (!entry) return false;
    this.change(() => {
      Object.assign(entry, patched(entry, patch));
      if (patch.name !== undefined) entry.name = patch.name;
      for (const contribution of patch.mixes ?? []) {
        const mixId = contribution.id ?? contribution.mixId!;
        this.mixIdFields.set(
          JSON.stringify([entry.id, mixId]),
          contribution.id ? "id" : "mixId",
        );
        const existing = entry.mixes.find((item) => item.id === mixId);
        if (existing) Object.assign(existing, patched(existing, contribution));
        else entry.mixes.push({ id: mixId, ...normalized(contribution) });
      }
    });
    return true;
  }

  patchMix(value: unknown): boolean {
    const patch = mixPatch.parse(value);
    const entry = this.mixes.find((entry) => entry.id === patch.id);
    if (!entry) return false;
    this.change(() => {
      Object.assign(entry, patched(entry, patch));
      if (patch.name !== undefined) entry.name = patch.name;
    });
    return true;
  }

  target(target: Target): LevelState & TargetFields {
    const channel = this.channels.find(
      (channel) => channel.id === target.channelId,
    );
    const mix = this.mixes.find((mix) => mix.id === target.mixId);
    const fields: TargetFields = {
      targetKind: target.targetKind,
      channelId: "",
      channelName: "",
      mixId: "",
      mixName: "",
    };
    if (target.targetKind === "mix") {
      if (!mix)
        throw new Error(
          "The selected Mix is unavailable. Choose a Mix again if it was deleted.",
        );
      return { ...fields, ...mix, mixId: mix.id, mixName: mix.name };
    }
    if (!channel)
      throw new Error(
        "The selected Channel is unavailable. Choose a Channel again if it was deleted.",
      );
    Object.assign(fields, { channelId: channel.id, channelName: channel.name });
    if (target.targetKind === "channel")
      return {
        ...fields,
        volumePercent: channel.volumePercent,
        muted: channel.muted,
      };
    const contribution = channel.mixes.find((item) => item.id === target.mixId);
    if (!mix || !contribution)
      throw new Error("The selected Channel is unavailable in this Mix.");
    return { ...fields, ...contribution, mixId: mix.id, mixName: mix.name };
  }

  update(
    target: Target,
    patch: { level?: number; isMuted?: boolean },
  ): { method: string; params: object } {
    this.target(target);
    if (target.targetKind === "mix")
      return { method: "setMix", params: { id: target.mixId, ...patch } };
    if (target.targetKind === "channel")
      return {
        method: "setChannel",
        params: { id: target.channelId, ...patch },
      };
    const key =
      this.mixIdFields.get(JSON.stringify([target.channelId, target.mixId])) ??
      "id";
    return {
      method: "setChannel",
      params: {
        id: target.channelId,
        mixes: [{ [key]: target.mixId, ...patch }],
      },
    };
  }

  private values(): Map<string, LevelState & TargetFields> {
    const values = new Map<string, LevelState & TargetFields>();
    for (const channel of this.channels) {
      const target = { targetKind: "channel" as const, channelId: channel.id };
      values.set(JSON.stringify(target), this.target(target));
      for (const mix of channel.mixes) {
        if (!this.mixes.some((entry) => entry.id === mix.id)) continue;
        const contribution = {
          ...target,
          targetKind: "channelMix" as const,
          mixId: mix.id,
        };
        values.set(JSON.stringify(contribution), this.target(contribution));
      }
    }
    for (const mix of this.mixes) {
      const target = { targetKind: "mix" as const, mixId: mix.id };
      values.set(JSON.stringify(target), this.target(target));
    }
    return values;
  }

  private change(apply: () => void): void {
    const previous = this.ready ? this.values() : undefined;
    apply();
    if (!previous) return;
    // Build all differences before invoking callbacks: callbacks may inspect
    // the current state or enqueue commands of their own.
    const changes = [...this.values()].map(([key, next]) => ({
      next,
      old: previous.get(key),
    }));
    for (const { next, old } of changes) {
      if (!old) continue;
      const { targetKind, channelId, channelName, mixId, mixName } = next;
      const fields = { targetKind, channelId, channelName, mixId, mixName };
      if (
        old.volumePercent !== null &&
        next.volumePercent !== null &&
        Math.abs(old.volumePercent - next.volumePercent) > 0.000001
      ) {
        this.volumeChanged({
          ...fields,
          volumePercent: next.volumePercent,
          previousVolumePercent: old.volumePercent,
        });
      }
      if (
        old.muted !== null &&
        next.muted !== null &&
        old.muted !== next.muted
      ) {
        this.muteChanged({
          ...fields,
          muted: next.muted,
          previousMuted: old.muted,
        });
      }
    }
  }
}
