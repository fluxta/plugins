import { WaveLinkService } from "./wave-link/service";

// This probe deliberately exposes no mutation path and does not print the
// user's application names, audio-device ids or mixer configuration.
const service = new WaveLinkService({
  changed: () => undefined,
  volumeChanged: () => undefined,
  muteChanged: () => undefined,
  connectionChanged: () => undefined,
});
try {
  await service.start();
  const state = service.snapshot();
  console.log(
    JSON.stringify(
      {
        status: state.status,
        message: state.message,
        interfaceRevision: state.interfaceRevision,
        channels: state.channels.length,
        mixes: state.mixes.length,
        channelVolume: state.channels.filter(
          (entry) => entry.volumePercent !== null,
        ).length,
        channelMute: state.channels.filter((entry) => entry.muted !== null)
          .length,
        mixVolume: state.mixes.filter((entry) => entry.volumePercent !== null)
          .length,
        mixMute: state.mixes.filter((entry) => entry.muted !== null).length,
      },
      null,
      2,
    ),
  );
  if (state.status !== "connected") process.exitCode = 1;
} finally {
  service.stop();
}
