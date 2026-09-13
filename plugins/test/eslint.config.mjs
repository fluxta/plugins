import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["apps/editor/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  reactHooks.configs.flat.recommended,
  // Disable ESLint rules that conflict with Prettier — keep last.
  eslintConfigPrettier,
]);
