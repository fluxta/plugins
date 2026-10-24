import { ScriptPlayer } from "../script-player";
import type { Engine } from "../script-process";
import player from "./player.ps1";
import { PowerShellProcess } from "./powershell-process";

/**
 * The Windows Player: WinRT's MediaPlayer through a long-lived PowerShell
 * script, one player per play. Devices are Windows' audio endpoints, known by
 * the endpoint id Windows keeps across restarts and re-plugging, and named as
 * Windows' sound settings name them.
 */
export class WindowsPlayer extends ScriptPlayer {
  constructor(
    engine: Engine = new PowerShellProcess("player", player),
    folder?: () => Promise<string>,
  ) {
    super(engine, folder);
  }
}
