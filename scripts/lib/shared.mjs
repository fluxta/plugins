import { access } from "node:fs/promises";
import { stat } from "node:fs/promises";

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Repository-root guards shared by validate and publish. Returns the
 * machine-readable errors that make the checkout unusable, or an empty array.
 */
export async function rootDirectoryErrors(rootDir) {
  if (!(await pathExists(rootDir))) {
    return [
      {
        code: "ROOT_NOT_FOUND",
        message: `Repository root does not exist: ${rootDir}`,
      },
    ];
  }

  const rootStat = await stat(rootDir);
  if (!rootStat.isDirectory()) {
    return [
      {
        code: "ROOT_NOT_DIRECTORY",
        message: `Repository root is not a directory: ${rootDir}`,
      },
    ];
  }

  return [];
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function stringOrNull(value) {
  return isNonEmptyString(value) ? value : null;
}

export function packageError(sourcePackage, code, field, message) {
  return {
    code,
    package: sourcePackage.id,
    path: sourcePackage.path,
    field,
    message,
  };
}

export function hasPackageErrors(errors, sourcePackage) {
  return errors.some((error) => error.package === sourcePackage.id);
}

export function tail(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `...${text.slice(-maxLength)}`;
}
