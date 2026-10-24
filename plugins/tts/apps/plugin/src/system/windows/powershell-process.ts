import { win32 } from "node:path";

import { ScriptProcess, type Spawn } from "../script-process";
import bootstrap from "./bootstrap.ps1";
import loop from "./loop.ps1";

/**
 * One of the plugin's PowerShell scripts, running in a long-lived Windows
 * PowerShell: it starts in about a second, once, and answers in
 * milliseconds after that.
 *
 * The command line carries only the bootstrap, as `-EncodedCommand` — not a
 * script file, so the execution policy does not apply. The bootstrap reads
 * the engine's script, after the loop it runs on, from the first line of
 * stdin.
 */
export class PowerShellProcess extends ScriptProcess {
  constructor(name: string, script: string, spawnProcess?: Spawn) {
    super(
      name,
      {
        command: powershellExe(),
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          encodedCommand(bootstrap),
        ],
        program: "PowerShell",
        computer: "this computer",
        preamble: Buffer.from(`${loop}\n${script}`, "utf8").toString("base64"),
      },
      spawnProcess,
    );
  }
}

/**
 * Windows PowerShell 5.1, which every Windows 10 and 11 ships — PowerShell 7
 * cannot reach WinRT — by its full path, so nothing on PATH stands in for it.
 */
export function powershellExe(
  root: string = process.env.SystemRoot ?? "C:\\Windows",
): string {
  return win32.join(
    root,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

/** A script as `-EncodedCommand` takes it: base64 of its UTF-16LE text. */
export function encodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}
