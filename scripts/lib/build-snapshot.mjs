/**
 * Serializes and parses the handoff between the `build` command (executes
 * every Plugin Source Package's own `pnpm install`/`pnpm run build`, with no
 * publication credentials in scope) and `publish --from-snapshot` (holds R2
 * credentials, runs no Plugin Source Package code at all). The snapshot
 * carries exactly what `buildCheckout` produced — built packages, build-time
 * errors, and per-package publication state — so the credentialed step can
 * classify and upload without ever re-running a package's build script.
 */

export const BUILD_SNAPSHOT_SCHEMA_VERSION = 1;

export function serializeBuildSnapshot({ packages, errors, publicationStates }) {
  const snapshot = {
    schemaVersion: BUILD_SNAPSHOT_SCHEMA_VERSION,
    packages,
    errors,
    publicationStates: Object.fromEntries(publicationStates ?? []),
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function parseBuildSnapshot(contents) {
  const parsed = JSON.parse(contents);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.packages)) {
    throw new Error("build snapshot must be a JSON object with a 'packages' array");
  }

  return {
    packages: parsed.packages,
    errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    publicationStates: new Map(Object.entries(parsed.publicationStates ?? {})),
  };
}
