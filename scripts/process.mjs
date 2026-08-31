#!/usr/bin/env node

import { execFile } from "node:child_process";

/**
 * Runs a child process to completion and always resolves. A non-zero exit is a
 * result, not a rejection, so callers report it as a validation error rather
 * than crashing the seam. `code` is a string when the process could not be
 * started at all (for example ENOENT when pnpm is missing).
 */
export function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          code: error?.code ?? 0,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      },
    );
  });
}
