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

/** The inverse of {@link setInputVolumePercent} — matches what OBS's own mixer shows. */
export async function getInputVolumePercent(obs: OBSWebSocket, input: string): Promise<number> {
  const { inputVolumeMul } = await obs.call("GetInputVolume", { inputName: input });
  return Math.round(inputVolumeMul * 100);
}

/** Sets a Browser Source's URL. Works on any Input kind that has a `url` setting. */
export async function setInputUrl(obs: OBSWebSocket, input: string, url: string): Promise<void> {
  await obs.call("SetInputSettings", {
    inputName: input,
    inputSettings: { url },
    overlay: true,
  });
}

/** Sets a Text (GDI+/FreeType 2) Source's displayed text. */
export async function setInputText(obs: OBSWebSocket, input: string, text: string): Promise<void> {
  await obs.call("SetInputSettings", {
    inputName: input,
    inputSettings: { text },
    overlay: true,
  });
}

/** `colorArgb` is a signed 32-bit ABGR integer — see `obs/color.ts` for the hex conversion. */
export async function setInputColor(
  obs: OBSWebSocket,
  input: string,
  colorArgb: number,
): Promise<void> {
  await obs.call("SetInputSettings", {
    inputName: input,
    inputSettings: { color: colorArgb },
    overlay: true,
  });
}
