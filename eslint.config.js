// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      // Wrangler's local state and bundles (`pnpm cloud:dev`).
      "**/.wrangler/**",
      "coverage/**",
      "corpus/**",
      "openspec/**",
      ".claude/**",
      ".codex/**",
      "**/.vscode-test/**",
      "packages/vscode/.test-output/**",
      "packages/player/.test-output/**",
      "packages/catalog/.test-output/**",
      "packages/playground/.test-output/**",
      "packages/acceptance/.test-output/**",
      "release/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // CommonJS on purpose: VS Code loads its test suite with require().
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: [
      "packages/canvas/src/**",
      "packages/playground/src/**",
      "packages/vscode/src/webview/**",
      "packages/vscode/test/webview/page/**",
      "packages/player/src/runtime.ts",
      "packages/player/test/browser/**",
    ],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
