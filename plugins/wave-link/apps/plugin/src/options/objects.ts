import type { Options } from "@fluxta/sdk/api";
import type { WaveLinkService } from "../wave-link/service";

export function createObjectOptions(service: WaveLinkService): Options[] {
  return (["channels", "mixes"] as const).map((key) => ({
    key,
    resolve: () => {
      const snapshot = service.snapshot();
      return snapshot.status === "connected"
        ? snapshot[key].map((entry) => ({ value: entry.id, label: entry.name }))
        : [];
    },
  }));
}
