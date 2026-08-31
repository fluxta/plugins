import type { OBSWebSocket } from "obs-websocket-js";

export async function startRecord(obs: OBSWebSocket): Promise<void> {
  await obs.call("StartRecord");
}

export async function stopRecord(obs: OBSWebSocket): Promise<void> {
  await obs.call("StopRecord");
}

export async function pauseRecord(obs: OBSWebSocket): Promise<void> {
  await obs.call("PauseRecord");
}

export async function resumeRecord(obs: OBSWebSocket): Promise<void> {
  await obs.call("ResumeRecord");
}

export async function recordStatus(
  obs: OBSWebSocket,
): Promise<{ active: boolean; paused: boolean }> {
  const { outputActive, outputPaused } = await obs.call("GetRecordStatus");
  return { active: outputActive, paused: outputPaused };
}
