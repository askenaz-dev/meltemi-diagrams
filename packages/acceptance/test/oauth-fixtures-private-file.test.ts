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
  const path = join(directory, "synthetic.json");
  try {
    if (process.platform === "win32") {
      // A normal Windows temp directory inherits broad read permissions and is refused first.
      expect(() => writeNewPrivateFixtureFile(path, "must-not-be-written")).toThrow();
      expect(existsSync(path)).toBe(false);
      const script = `$ErrorActionPreference='Stop'; $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($me); $acl.SetAccessRuleProtection($true,$false); foreach($sid in @($me,[System.Security.Principal.SecurityIdentifier]'S-1-5-18')) { $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }; Set-Acl -LiteralPath $env:MELTEMI_TEST_PRIVATE_DIR -AclObject $acl`;
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
            SystemRoot: process.env["SystemRoot"],
            PATH: process.env["PATH"],
            MELTEMI_TEST_PRIVATE_DIR: directory,
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
    expect(() => writeNewPrivateFixtureFile(path, "overwrite")).toThrow();
    expect(readFileSync(path, "utf8")).toBe("synthetic-test-data");
  } finally {
    removePrivateTestDirectory(directory);
  }
});
