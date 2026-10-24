import { ScriptPlayer } from "../script-player";
import type { Engine } from "../script-process";
import { JxaProcess } from "./jxa-process";
import player from "./player.jxa";

/**
 * The macOS Player: AVAudioEngine through a long-lived JXA script, one
 * engine per output device. Devices are Core Audio's, known by their UID.
 */
export class MacosPlayer extends ScriptPlayer {
  constructor(
    engine: Engine = new JxaProcess("player", player),
    folder?: () => Promise<string>,
  ) {
    super(engine, folder);
  }
}
