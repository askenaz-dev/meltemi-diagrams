// Runs the integration suite inside VS Code, downloaded by @vscode/test-electron into .vscode-test.
// Usage: pnpm vscode:test (which builds the extension first).
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const extension = join(here, "..", "..");
const repo = join(extension, "..", "..");
const cachePath = join(extension, ".vscode-test");
// The VS Code already downloaded, so that the suite runs offline and on the same version every
// time; without one, the runner downloads the latest stable.
const installed = existsSync(cachePath)
  ? readdirSync(cachePath)
      .map((name) => /^vscode-.+-(\d+)\.(\d+)\.(\d+)$/.exec(name))
      .filter((match) => match !== null)
      .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
      .map((match) => `${match[1]}.${match[2]}.${match[3]}`)
      .at(-1)
  : undefined;
const workspace = mkdtempSync(join(tmpdir(), "mdg-vscode-"));
const userData = mkdtempSync(join(tmpdir(), "mdg-vscode-user-"));
copyFileSync(
  join(repo, "corpus", "valid", "checkout.meltemi"),
  join(workspace, "checkout.meltemi"),
);
copyFileSync(
  join(repo, "corpus", "valid", "edge", "annotations.meltemi"),
  join(workspace, "annotations.meltemi"),
);

try {
  await runTests({
    extensionDevelopmentPath: extension,
    extensionTestsPath: join(here, "suite.cjs"),
    cachePath,
    ...(installed ? { version: installed } : {}),
    launchArgs: [
      workspace,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      `--user-data-dir=${userData}`,
    ],
    extensionTestsEnv: { MELTEMI_TEST_WORKSPACE: workspace },
  });
} catch (error) {
  console.error(`VS Code tests failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
}
