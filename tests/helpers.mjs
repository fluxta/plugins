import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const cliPath = path.join(repoRoot, "scripts", "plugins.mjs");
export const prValidatePath = path.join(repoRoot, "scripts", "pr-validate.mjs");
export const registrySyncPath = path.join(repoRoot, "scripts", "registry-sync.mjs");

export const EMPTY_PNPM_LOCKFILE = [
  "lockfileVersion: '9.0'",
  "settings:",
  "  autoInstallPeers: true",
  "  excludeLinksFromLockfile: false",
  "",
].join("\n");

export function runCli(args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      { cwd: repoRoot, ...options },
      (error, stdout, stderr) => {
        resolve({
          code: error?.code ?? 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

export function runPrValidate(args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [prValidatePath, ...args],
      { cwd: repoRoot, ...options },
      (error, stdout, stderr) => {
        resolve({
          code: error?.code ?? 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

export function runRegistrySync(args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [registrySyncPath, ...args],
      { cwd: repoRoot, ...options },
      (error, stdout, stderr) => {
        resolve({
          code: error?.code ?? 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

export async function withTempDir(callback) {
  const dir = await mkdtemp(path.join(tmpdir(), "plugins-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function validManifest(overrides = {}) {
  return {
    name: "example.plugin",
    apiVersion: 1,
    version: "1.2.3",
    title: "Example Plugin",
    description: "An example trusted package.",
    actions: [],
    author: "Example Author",
    license: "MIT",
    repository: "https://github.com/example/example.plugin",
    minAppVersion: "0.1.0",
    maintainers: ["inferst"],
    ...overrides,
  };
}

export async function writeManifest(root, packageId, manifest) {
  const packageDir = path.join(root, "plugins", packageId);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export async function writeCodeowners(root, contents, relativePath = ".github/CODEOWNERS") {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}

export async function writePreviousIndex(root, index, relativePath = "previous-index.json") {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(index, null, 2)}\n`);
}

export function errorCodes(output) {
  return output.validation.errors.map((error) => ({
    code: error.code,
    package: error.package,
    field: error.field,
  }));
}

export async function writeBuildContract(
  root,
  packageId,
  { buildScript = null, writeLockfile = true } = {},
) {
  const packageDir = path.join(root, "plugins", packageId);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageId,
        version: "1.0.0",
        private: true,
        scripts: buildScript ? { build: buildScript } : {},
      },
      null,
      2,
    )}\n`,
  );
  if (writeLockfile) {
    await writeFile(path.join(packageDir, "pnpm-lock.yaml"), EMPTY_PNPM_LOCKFILE);
  }
}

export async function writeSourceFiles(root, packageId, relativeFiles) {
  const packageDir = path.join(root, "plugins", packageId);
  for (const relativePath of relativeFiles) {
    const fullPath = path.join(packageDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `source of ${relativePath}\n`);
  }
}

export function simpleBuildScript(packageId, copiedDirs = []) {
  const steps = [`mkdir -p dist/${packageId}`];
  steps.push(`cp manifest.json dist/${packageId}/`);
  for (const dir of copiedDirs) {
    steps.push(`cp -R ${dir} dist/${packageId}/`);
  }
  return steps.join(" && ");
}
