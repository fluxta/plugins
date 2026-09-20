import type { OBSWebSocket } from "obs-websocket-js";
import type { MediaMode } from "obs-protocol";

const MEDIA_ACTIONS: Record<MediaMode, string> = {
  play: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
  pause: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
  stop: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
  restart: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
  next: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT",
  previous: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS",
};

export async function triggerMediaAction(
  obs: OBSWebSocket,
  input: string,
  mode: MediaMode,
): Promise<void> {
  await obs.call("TriggerMediaInputAction", {
    inputName: input,
    mediaAction: MEDIA_ACTIONS[mode],
  });
}

/**
 * The settings key that holds "which file" varies by Input kind — only the
 * two common file-backed kinds are supported; anything else (e.g. `vlc_source`,
 * whose file list is a playlist array, not a single path) is refused rather
 * than guessed at.
 */
const FILE_SETTINGS_KEY: Record<string, string> = {
  ffmpeg_source: "local_file",
  image_source: "file",
};

/** Swaps the file a Media/Image Source points to — distinct from {@link triggerMediaAction}. */
export async function setMediaSourceFile(
  obs: OBSWebSocket,
  input: string,
  path: string,
): Promise<void> {
  const { inputKind } = await obs.call("GetInputSettings", { inputName: input });
  const key = FILE_SETTINGS_KEY[inputKind];

  if (!key) {
    throw new Error(`"${input}" is a "${inputKind}" Input — its file cannot be set this way`);
  }

  await obs.call("SetInputSettings", {
    inputName: input,
    inputSettings: { [key]: path },
    overlay: true,
  });
}
