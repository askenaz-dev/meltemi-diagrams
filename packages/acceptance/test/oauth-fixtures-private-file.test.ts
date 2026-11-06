import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { expect, it } from "vitest";
import {
  assertPrivateFixtureFile,
  fixturePathPresent,
  writeNewPrivateFixtureFile,
} from "../src/mcp/oauth-fixtures-private-file.js";
import {
  readFixtureRegistrations,
  removeFixtureRegistrations,
} from "../src/mcp/oauth-fixture-registration.js";
import {
  FIXTURE_WINDOWS_ACL_BOOTSTRAP,
  fixtureWindowsEnvironment,
} from "../src/mcp/oauth-fixtures-windows-env.js";

function removePrivateTestDirectory(directory: string): void {
  const actual = realpathSync(directory);
  if (
    !actual.startsWith(realpathSync(tmpdir()) + sep) ||
    !actual.includes("meltemi-fixture-acl-test-")
  )
    throw new Error("Unsafe test cleanup");
  rmSync(actual, { recursive: true, force: true });
}

it.each(["directory", "dangling"] as const)(
  "treats a %s receipt as present and invalid for reading or removal",
  (kind) => {
    const directory = mkdtempSync(join(tmpdir(), "meltemi-fixture-acl-test-"));
    const file = join(directory, "missing-journal.json");
    const sidecar = file + ".registration.json";
    try {
      if (kind === "directory") mkdirSync(sidecar);
      else
        symlinkSync(
          join(directory, "absent-target"),
          sidecar,
          process.platform === "win32" ? "junction" : "file",
        );
      expect(fixturePathPresent(sidecar)).toBe(true);
      expect(() =>
        readFixtureRegistrations(file, "https://staging.diagrams.meltemi.dev", "a".repeat(24)),
      ).toThrow();
      expect(() => removeFixtureRegistrations(file)).toThrow();
      expect(lstatSync(sidecar).isSymbolicLink() || lstatSync(sidecar).isDirectory()).toBe(true);
      expect(fixturePathPresent(file)).toBe(false);
    } finally {
      removePrivateTestDirectory(directory);
    }
  },
);

it("writes only after the real platform privacy guard accepts the new file", () => {
  const directory = mkdtempSync(join(tmpdir(), "meltemi-fixture-acl-test-"));
  const privateDirectory = join(directory, "private");
  mkdirSync(privateDirectory);
  const path = join(privateDirectory, "synthetic.json");
  try {
    if (process.platform === "win32") {
      // Prove PowerShell can start and prepare the private parent before exercising a refusal.
      const script = `${FIXTURE_WINDOWS_ACL_BOOTSTRAP}; $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($me); $acl.SetAccessRuleProtection($true,$false); foreach($sid in @($me,[System.Security.Principal.SecurityIdentifier]'S-1-5-18')) { $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }; Set-Acl -LiteralPath $env:MELTEMI_TEST_PRIVATE_DIR -AclObject $acl`;
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        {
          env: {
            ...fixtureWindowsEnvironment(),
            MELTEMI_TEST_PRIVATE_DIR: privateDirectory,
          },
          windowsHide: true,
          stdio: "pipe",
          timeout: 15_000,
        },
      );
    }
    writeNewPrivateFixtureFile(path, "synthetic-test-data");
    assertPrivateFixtureFile(path);
    expect(readFileSync(path, "utf8")).toBe("synthetic-test-data");
    if (process.platform === "win32") {
      const unsafePath = join(directory, "must-not-be-created.json");
      // Require an actual ACL refusal, not a launch timeout or missing executable.
      expect(() => writeNewPrivateFixtureFile(unsafePath, "must-not-be-written")).toThrow(
        /^OAuth fixture preparation or validation failed/,
      );
      expect(existsSync(unsafePath)).toBe(false);
    }
    expect(() => writeNewPrivateFixtureFile(path, "overwrite")).toThrow();
    expect(readFileSync(path, "utf8")).toBe("synthetic-test-data");
  } finally {
    removePrivateTestDirectory(directory);
  }
});
