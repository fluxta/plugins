import { spawn } from "node:child_process";

/**
 * Opens a URL in the user's browser.
 *
 * This has to happen here rather than in the editor: Fluxta mounts editor
 * iframes with `sandbox="allow-scripts"`, so `window.open` and `target="_blank"`
 * are both blocked there.
 */
export function openInBrowser(url: string): void {
  if (!isSafeUrl(url)) {
    console.error("Refused to open a URL that is not an https address");
    return;
  }

  const [command, args] = openCommand(url);

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", (error) => {
      console.error("Could not open the browser:", error.message);
    });
    child.unref();
  } catch (error) {
    console.error("Could not open the browser:", error);
  }
}

function openCommand(url: string): [string, string[]] {
  switch (process.platform) {
    case "darwin":
      return ["open", [url]];
    case "win32":
      // The empty string is `start`'s title argument; without it a quoted URL
      // is taken as the window title and nothing opens.
      return ["cmd", ["/c", "start", "", url]];
    default:
      return ["xdg-open", [url]];
  }
}

/**
 * The URL comes from Twitch's response, but it still reaches a command line,
 * so only plain https addresses are passed through.
 */
function isSafeUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
