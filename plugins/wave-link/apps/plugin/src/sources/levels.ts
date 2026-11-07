import type { Source, SourceContext } from "@fluxta/sdk/api";
import type { Target, TargetKind } from "wave-link-protocol";
import type { WaveLinkService } from "../wave-link/service";

export const levelSources = [
  { key: "channelVolume", kind: "channel", field: "volumePercent" },
  { key: "channelMuted", kind: "channel", field: "muted" },
  { key: "channelMixVolume", kind: "channelMix", field: "volumePercent" },
  { key: "channelMixMuted", kind: "channelMix", field: "muted" },
  { key: "mixVolume", kind: "mix", field: "volumePercent" },
  { key: "mixMuted", kind: "mix", field: "muted" },
] as const;

function targetArgs(kind: TargetKind, args: unknown): Target {
  const value =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  return {
    targetKind: kind,
    channelId:
      typeof value.channelId === "string" ? value.channelId : undefined,
    mixId: typeof value.mixId === "string" ? value.mixId : undefined,
  };
}

export function createLevelSources(service: WaveLinkService): Source[] {
  return levelSources.map(({ key, kind, field }) => ({
    key,
    resolve: (ctx: SourceContext) =>
      service.read(targetArgs(kind, ctx.args))?.[field] ?? null,
  }));
}
