import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import bootstrap from "./bootstrap.ps1";
import loop from "./loop.ps1";
import player from "./player.ps1";
import {
  encodedCommand,
  PowerShellProcess,
  powershellExe,
} from "./powershell-process";
import synthesizer from "./synthesizer.ps1";

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough({ encoding: "utf8" });
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
}

describe("PowerShellProcess", () => {
  it("starts Windows PowerShell with the bootstrap, then hands it the loop and the script", async () => {
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    const written: string[] = [];
    child.stdin.on("data", (chunk: string) => written.push(chunk));

    new PowerShellProcess("player", "Run", spawn).request(
      { op: "play" },
      () => {},
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [command, args] = spawn.mock.calls[0] as unknown as [
      string,
      string[],
    ];
    expect(command).toBe(powershellExe());
    expect(args.slice(0, 4)).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
    ]);
    expect(Buffer.from(args[4], "base64").toString("utf16le")).toBe(bootstrap);
    const [preamble, request] = written.join("").split("\n");
    expect(Buffer.from(preamble, "base64").toString("utf8")).toBe(
      `${loop}\nRun`,
    );
    expect(JSON.parse(request)).toEqual({ op: "play", id: 1 });
  });

  it("finds powershell.exe under the Windows folder", () => {
    expect(powershellExe("D:\\Windows")).toBe(
      "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
  });

  it("encodes a command as -EncodedCommand reads it: UTF-16LE in base64", () => {
    expect(encodedCommand("$a = 'é'")).toBe(
      Buffer.from("$a = 'é'", "utf16le").toString("base64"),
    );
  });
});

/**
 * The scripts, with their comments taken out, line by line — CRLF ones too,
 * as Git may check them out on Windows.
 */
function code(script: string): string[] {
  return script.split(/\r?\n/).map((line) => line.replace(/(^|\s)#.*$/, ""));
}

describe("The PowerShell scripts", () => {
  const scripts = { bootstrap, loop, synthesizer, player };

  it.each(Object.entries(scripts))(
    "%s uses nothing Windows PowerShell 5.1 lacks",
    (_name, script) => {
      // PowerShell 7's operators and switches, which 5.1 fails to parse or run.
      const newer = [
        /\?\?/,
        /\?\./,
        /&&/,
        /\|\|/,
        /-AsHashtable/,
        /-Parallel/,
        /\$PSStyle/,
        /Join-String/,
        /\s\?\s.+\s:\s/,
      ];
      for (const line of code(script)) {
        for (const pattern of newer) {
          expect(line, `${pattern} in: ${line}`).not.toMatch(pattern);
        }
      }
    },
  );

  it.each(Object.entries({ synthesizer, player }))(
    "%s answers requests on the loop and runs it",
    (_name, script) => {
      const lines = code(script)
        .map((line) => line.trim())
        .filter(Boolean);
      expect(lines).toContain("function Receive($request) {");
      expect(lines.some((line) => line.startsWith("function Step"))).toBe(true);
      expect(lines.at(-1)).toBe("Run");
    },
  );

  it("checks the language mode before touching anything it forbids", () => {
    const lines = code(bootstrap)
      .map((line) => line.trim())
      .filter(Boolean);
    const check = lines.findIndex((line) => line.includes("LanguageMode"));
    const firstType = lines.findIndex((line) => line.includes("::"));

    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(firstType);
    // ASCII, so the console's code page cannot garble it.
    expect(lines.find((line) => line.startsWith("Write-Output"))).toMatch(
      /^[\x20-\x7e]+$/,
    );
  });
});
