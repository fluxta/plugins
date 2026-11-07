import type { Plugin } from "@fluxta/sdk/api";
import {
  editorMessageSchema,
  targetKinds,
  type Snapshot,
} from "wave-link-protocol";
import { AdjustVolumeAction } from "./actions/adjust-volume";
import { SetMuteAction } from "./actions/set-mute";
import { SetVolumeAction } from "./actions/set-volume";
import { CONNECTION_STATUS_CHANGED } from "./events/connection-status-changed";
import { MUTE_CHANGED } from "./events/mute-changed";
import { VOLUME_CHANGED } from "./events/volume-changed";
import { createObjectOptions } from "./options/objects";
import { createLevelSources } from "./sources/levels";
import { WaveLinkService } from "./wave-link/service";

type ServiceFactory = (
  callbacks: ConstructorParameters<typeof WaveLinkService>[0],
) => WaveLinkService;

export function registerPlugin(
  plugin: Plugin,
  makeService: ServiceFactory = (callbacks) => new WaveLinkService(callbacks),
): WaveLinkService {
  function publish(status: Snapshot): void {
    plugin.sendToEditor({ event: "status", status });
    plugin.setConnections([
      {
        id: "local",
        title: "Wave Link",
        connected: status.status === "connected",
      },
    ]);
  }
  const service = makeService({
    changed: publish,
    volumeChanged: (change) => plugin.emitEvent(VOLUME_CHANGED, change),
    muteChanged: (change) => plugin.emitEvent(MUTE_CHANGED, change),
    connectionChanged: (change) => {
      console.info(`Wave Link ${change.status}: ${change.message}`);
      plugin.emitEvent(CONNECTION_STATUS_CHANGED, change);
    },
  });
  plugin.registerAction(new SetVolumeAction(service));
  plugin.registerAction(new AdjustVolumeAction(service));
  plugin.registerAction(new SetMuteAction(service));
  for (const source of createLevelSources(service))
    plugin.registerSource(source);
  plugin.registerSource({
    key: "connected",
    resolve: () => service.snapshot().status === "connected",
  });
  plugin.registerSource({
    key: "connectionStatus",
    resolve: () => service.snapshot().status,
  });
  for (const options of createObjectOptions(service))
    plugin.registerOptions(options);
  plugin.registerOptions({
    key: "targetKinds",
    resolve: () =>
      targetKinds.map((value) => ({
        value,
        label: { channel: "Channel", channelMix: "Channel in Mix", mix: "Mix" }[
          value
        ],
      })),
  });
  plugin.registerOptions({
    key: "connectionStatuses",
    resolve: () =>
      ["connecting", "connected", "error"].map((value) => ({
        value,
        label: value,
      })),
  });
  plugin.onReceiveFromEditor((message: unknown) => {
    if (editorMessageSchema.safeParse(message).success)
      publish(service.snapshot());
  });

  return service;
}
