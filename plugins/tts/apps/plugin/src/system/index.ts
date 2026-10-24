import type { SystemSettings } from "tts-protocol";

import type { Player } from "../speech/player";
import type { Provider } from "../speech/provider";
import { MacosPlayer } from "./macos/macos-player";
import { MacosProvider } from "./macos/macos-provider";
import { unsupported } from "./unsupported";
import { WindowsPlayer } from "./windows/windows-player";
import { WindowsProvider } from "./windows/windows-provider";

/**
 * The `system` Provider — this computer's voices — and the Player for the OS
 * the sidecar runs on. Another OS's Provider never appears here.
 */
export function systemSpeech(platform: NodeJS.Platform = process.platform): {
  provider: Provider<SystemSettings>;
  player: Player;
} {
  if (platform === "darwin") {
    return { provider: new MacosProvider(), player: new MacosPlayer() };
  }
  if (platform === "win32") {
    return { provider: new WindowsProvider(), player: new WindowsPlayer() };
  }
  return unsupported(`Text to Speech does not speak on ${platform}`);
}
