import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { JxaProcess } from "./macos/jxa-process";
import {
  asciiJson,
  ScriptProcess,
  type Launch,
  type Reply,
} from "./script-process";

/** A stand-in for the interpreter: the test writes its stdout and ends it. */
class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  /** Every line written to stdin, as written. */
  readonly lines: string[] = [];
  /** The requests and notifications among them. */
  readonly received: Record<string, unknown>[] = [];

  constructor() {
    super();
    this.stdin.setEncoding("utf8");
    this.stdin.on("data", (chunk: string) => {
      for (const line of chunk.split("\n").filter(Boolean)) {
        this.lines.push(line);
        if (line.startsWith("{")) {
          this.received.push(JSON.parse(line));
        }
      }
    });
  }

  reply(message: unknown) {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  exit(code: number) {
    this.emit("exit", code);
  }
}

function setup(launch?: Launch) {
  const children: FakeChild[] = [];
  const spawn = vi.fn((command: string, args: string[]) => {
    void command;
    void args;
    const child = new FakeChild();
    children.push(child);
    return child;
  });
  const engine = launch
    ? new ScriptProcess("synthesizer", launch, spawn)
    : new JxaProcess("synthesizer", "/* the script */", spawn);
  return { engine, spawn, children };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScriptProcess", () => {
  it("starts osascript with the script on the first request only", async () => {
    const { engine, spawn, children } = setup();
    expect(spawn).not.toHaveBeenCalled();

    engine.request({ op: "voices" }, () => {});
    engine.request({ op: "voices" }, () => {});
    await tick();

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("osascript", [
      "-l",
      "JavaScript",
      "-e",
      "/* the script */",
    ]);
    expect(children[0].received).toEqual([
      { op: "voices", id: 1 },
      { op: "voices", id: 2 },
    ]);
  });

  it("hands every reply to the request it answers until released", async () => {
    const { engine, children } = setup();
    const first: Reply[] = [];
    const second: Reply[] = [];
    const one = engine.request({ op: "synthesize" }, (reply) =>
      first.push(reply),
    );
    engine.request({ op: "synthesize" }, (reply) => second.push(reply));
    const child = children[0];

    child.reply({ ready: true });
    child.reply({ id: 2, pcm: "AAAA" });
    child.reply({ id: 1, pcm: "BBBB" });
    await tick();
    engine.release(one);
    child.reply({ id: 1, done: true });
    child.reply("not an object");
    await tick();

    expect(first).toEqual([{ id: 1, pcm: "BBBB" }]);
    expect(second).toEqual([{ id: 2, pcm: "AAAA" }]);
  });

  it("notifies only a process that runs", async () => {
    const { engine, spawn, children } = setup();

    engine.notify({ op: "cancel", id: 7 });
    expect(spawn).not.toHaveBeenCalled();

    engine.request({ op: "voices" }, () => {});
    engine.notify({ op: "cancel", id: 1 });
    await tick();
    expect(children[0].received).toEqual([
      { op: "voices", id: 1 },
      { op: "cancel", id: 1 },
    ]);
  });

  it("fails what was waiting as transient when a ready process exits, and starts again", async () => {
    const { engine, spawn, children } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const replies: Reply[] = [];
    engine.request({ op: "synthesize" }, (reply) => replies.push(reply));
    children[0].reply({ ready: true });
    await tick();

    children[0].exit(137);

    expect(replies).toEqual([
      {
        id: 1,
        error: {
          kind: "transient",
          reason:
            "The synthesizer stopped (exit code 137); it starts again with the next request",
        },
      },
    ]);
    engine.request({ op: "voices" }, () => {});
    await tick();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(children[1].received).toEqual([{ op: "voices", id: 2 }]);
  });

  it("calls a script that dies before it is ready unavailable, with what it said", async () => {
    const { engine, children } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const replies: Reply[] = [];
    engine.request({ op: "voices" }, (reply) => replies.push(reply));

    children[0].stderr.write(
      "execution error: Error: Can't find AVFoundation\n",
    );
    await tick();
    children[0].exit(1);

    expect(replies[0].error).toEqual({
      kind: "unavailable",
      reason:
        "The synthesizer cannot run on this Mac: execution error: Error: Can't find AVFoundation",
    });
    expect(error).toHaveBeenCalledWith(
      "[synthesizer] execution error: Error: Can't find AVFoundation",
    );
  });

  it("calls osascript that cannot start unavailable, once", async () => {
    const { engine, children } = setup();
    const replies: Reply[] = [];
    engine.request({ op: "voices" }, (reply) => replies.push(reply));

    children[0].emit("error", new Error("spawn osascript ENOENT"));
    children[0].exit(-2);

    expect(replies).toEqual([
      {
        id: 1,
        error: {
          kind: "unavailable",
          reason: "Cannot start osascript: spawn osascript ENOENT",
        },
      },
    ]);
  });
});

describe("A script that needs telling what to run", () => {
  const launch: Launch = {
    command: "powershell.exe",
    args: ["-EncodedCommand", "…"],
    program: "PowerShell",
    computer: "this computer",
    preamble: "U2NyaXB0",
  };

  it("hears its preamble first, every time it starts", async () => {
    const { engine, children } = setup(launch);
    engine.request({ op: "voices" }, () => {});
    await tick();
    children[0].reply({ ready: true });
    await tick();
    children[0].exit(1);

    engine.request({ op: "voices" }, () => {});
    await tick();

    expect(children.map(({ lines }) => lines)).toEqual([
      ["U2NyaXB0", '{"op":"voices","id":1}'],
      ["U2NyaXB0", '{"op":"voices","id":2}'],
    ]);
  });

  it("says why it cannot run when the script told it, in its own words", async () => {
    const { engine, children } = setup(launch);
    const replies: Reply[] = [];
    engine.request({ op: "voices" }, (reply) => replies.push(reply));

    children[0].reply({
      unavailable:
        "PowerShell runs in ConstrainedLanguage mode — Text to Speech cannot run on this machine",
    });
    await tick();
    children[0].exit(3);

    expect(replies[0].error).toEqual({
      kind: "unavailable",
      reason:
        "PowerShell runs in ConstrainedLanguage mode — Text to Speech cannot run on this machine",
    });
  });

  it("names the program and the computer in its own reasons", async () => {
    const { engine, children } = setup(launch);
    const replies: Reply[] = [];
    engine.request({ op: "voices" }, (reply) => replies.push(reply));
    engine.request({ op: "voices" }, () => {});

    children[0].exit(1);
    engine.request({ op: "voices" }, (reply) => replies.push(reply));
    children[1].emit("error", new Error("spawn powershell.exe ENOENT"));

    expect(replies.map(({ error }) => error?.reason)).toEqual([
      "The synthesizer cannot run on this computer: PowerShell exited with code 1",
      "Cannot start PowerShell: spawn powershell.exe ENOENT",
    ]);
  });
});

describe("asciiJson", () => {
  it("escapes everything above ASCII, so a split read cannot break a character", () => {
    const line = asciiJson({ text: "Привет 👋 «chat»" });

    expect(line).toMatch(/^[\x20-\x7e]*$/);
    expect(JSON.parse(line)).toEqual({ text: "Привет 👋 «chat»" });
  });
});
