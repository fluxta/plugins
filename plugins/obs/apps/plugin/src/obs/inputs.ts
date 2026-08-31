import type { OBSWebSocket } from "obs-websocket-js";

export async function isInputMuted(obs: OBSWebSocket, input: string): Promise<boolean> {
  const { inputMuted } = await obs.call("GetInputMute", { inputName: input });
  return inputMuted;
}

export async function setInputMuted(
  obs: OBSWebSocket,
  input: string,
  muted: boolean,
): Promise<void> {
  await obs.call("SetInputMute", { inputName: input, inputMuted: muted });
}

/**
 * `percent` matches what OBS's own mixer shows (100 = unity gain); OBS itself
 * wants either a linear multiplier or dB, so this converts to the multiplier
 * (`percent / 100`, exactly 1.0 at 100%) rather than asking a plugin author
 * to think in dB.
 */
export async function setInputVolumePercent(
  obs: OBSWebSocket,
  input: string,
  percent: number,
): Promise<void> {
  await obs.call("SetInputVolume", { inputName: input, inputVolumeMul: percent / 100 });
}
