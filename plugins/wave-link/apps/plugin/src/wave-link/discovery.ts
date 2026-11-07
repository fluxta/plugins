import { readFile } from "node:fs/promises";
import { win32 } from "node:path";

export async function discoverPorts(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  read: (path: string) => Promise<string> = (path) => readFile(path, "utf8"),
): Promise<number[]> {
  const fallback = Array.from({ length: 10 }, (_, index) => 1884 + index);
  if (platform === "darwin") return fallback;
  if (platform !== "win32")
    throw new Error("Wave Link 3 requires Windows or macOS.");
  const local =
    env.LOCALAPPDATA ??
    (env.APPDATA ? win32.join(env.APPDATA, "..", "Local") : undefined);
  if (!local) return fallback;
  try {
    const value: unknown = JSON.parse(
      await read(
        win32.join(
          local,
          "Packages",
          "Elgato.WaveLink_g54w8ztgkx496",
          "LocalState",
          "ws-info.json",
        ),
      ),
    );
    const port =
      value && typeof value === "object"
        ? (value as { port?: unknown }).port
        : undefined;
    if (
      typeof port === "number" &&
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535
    ) {
      return [port, ...fallback.filter((candidate) => candidate !== port)];
    }
  } catch {
    /* The app may be closed or installed without a port file. */
  }
  return fallback;
}
