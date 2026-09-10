import type { OBSWebSocket } from "obs-websocket-js";

export async function startStream(obs: OBSWebSocket): Promise<void> {
  await obs.call("StartStream");
}

export async function stopStream(obs: OBSWebSocket): Promise<void> {
  await obs.call("StopStream");
}

export async function isStreaming(obs: OBSWebSocket): Promise<boolean> {
  const { outputActive } = await obs.call("GetStreamStatus");
  return outputActive;
}
