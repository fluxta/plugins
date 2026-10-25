import { describe, expect, it } from "vitest";

import { authorizeUrl } from "./donationalerts/config";
import { openCommand } from "./open-browser";

const URL_WITH_QUERY = authorizeUrl("0123456789abcdef");

describe("openCommand", () => {
  it("passes the whole URL to the browser on Windows, past cmd's `&`", () => {
    const [command, args] = openCommand(URL_WITH_QUERY, "win32");

    // cmd.exe splits its command line at `&`, so `cmd /c start` opened only
    // `…/oauth/authorize?client_id=22320`.
    expect(command).not.toMatch(/^cmd(\.exe)?$/i);
    expect(args.at(-1)).toBe(URL_WITH_QUERY);
  });

  it("opens the URL with `open` on macOS and `xdg-open` elsewhere", () => {
    expect(openCommand(URL_WITH_QUERY, "darwin")).toEqual([
      "open",
      [URL_WITH_QUERY],
    ]);
    expect(openCommand(URL_WITH_QUERY, "linux")).toEqual([
      "xdg-open",
      [URL_WITH_QUERY],
    ]);
  });
});
