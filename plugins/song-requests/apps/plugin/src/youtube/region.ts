import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { isRegion } from "song-requests-protocol";

/** YouTube's own Region when none is given. */
const FALLBACK_REGION = "US";

/** macOS's `@rg=dezzzz`: a Region picked apart from the language. */
const APPLE_REGION = /@(?:.*;)?rg=([a-z]{2})zzzz/i;

/**
 * The country of a locale — `en-US` → `US` — or of its language when it
 * names none (`de` → `DE`). macOS writes its locale as `en_GB`, and a Region
 * the streamer picked apart from the language as `en_GB@rg=dezzzz`.
 */
export function regionOf(locale: string): string {
  const picked = APPLE_REGION.exec(locale)?.[1]?.toUpperCase();
  if (isRegion(picked)) return picked;

  try {
    const tag = locale.split("@")[0].replaceAll("_", "-");
    const region = new Intl.Locale(tag).maximize().region;
    return isRegion(region) ? region : FALLBACK_REGION;
  } catch {
    return FALLBACK_REGION;
  }
}

/**
 * The Region of this computer, where the Region starts until the streamer
 * picks another: its own player plays the Songs.
 *
 * On macOS Node reads the locale from `LANG`, which a process started from
 * an app — Fluxta — usually lacks, and falls back to `en-US`; the setting
 * itself is `AppleLocale`. Windows and a Linux session give Node theirs.
 */
export async function systemRegion(): Promise<string> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await promisify(execFile)(
        "defaults",
        ["read", "-g", "AppleLocale"],
        { timeout: 2_000 },
      );
      return regionOf(stdout.trim());
    } catch {
      // No setting to read: Node's own locale is all there is.
    }
  }
  return regionOf(Intl.DateTimeFormat().resolvedOptions().locale);
}
