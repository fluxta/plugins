import { ScriptProcess, type Spawn } from "../script-process";

/**
 * One of the plugin's JXA scripts, running in a long-lived
 * `osascript -l JavaScript`: an engine starts in 0.3–0.5 s, and answers in
 * milliseconds once warm.
 */
export class JxaProcess extends ScriptProcess {
  constructor(name: string, script: string, spawnProcess?: Spawn) {
    super(
      name,
      {
        command: "osascript",
        args: ["-l", "JavaScript", "-e", script],
        program: "osascript",
        computer: "this Mac",
      },
      spawnProcess,
    );
  }
}
