import { execFileSync } from "node:child_process";
import { closeSync, lstatSync, openSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fixtureFailure } from "./oauth-fixture-format.js";
import {
  FIXTURE_WINDOWS_ACL_BOOTSTRAP,
  fixtureWindowsEnvironment,
} from "./oauth-fixtures-windows-env.js";

/** Absence means ENOENT only; dangling links, directories and inaccessible paths are not absent. */
export function fixturePathPresent(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return false;
    return fixtureFailure();
  }
}

/** Windows mode bits do not restrict a DACL. The operator provides a private protected parent. */
function checkPrivate(file: string, newEmptyFile = false): void {
  if (fixturePathPresent(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()))
    fixtureFailure();
  if (process.platform !== "win32") {
    if (fixturePathPresent(file) && (lstatSync(file).mode & 0o077) !== 0) fixtureFailure();
    return;
  }
  const script = `${FIXTURE_WINDOWS_ACL_BOOTSTRAP}
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed=@($me,'S-1-5-18')
if ($env:MELTEMI_FIXTURE_NEW_EMPTY -eq '1') {
 $f=[System.IO.FileInfo]::new($env:MELTEMI_FIXTURE_ACL_PATH)
 if (-not $f.Exists -or $f.Length -ne 0) { exit 3 }
 $fresh=Get-Acl -LiteralPath $env:MELTEMI_FIXTURE_ACL_PATH
 $fresh.SetOwner([System.Security.Principal.WindowsIdentity]::GetCurrent().User)
 Set-Acl -LiteralPath $env:MELTEMI_FIXTURE_ACL_PATH -AclObject $fresh
}
$parent=Get-Acl -LiteralPath ([System.IO.Path]::GetDirectoryName($env:MELTEMI_FIXTURE_ACL_PATH))
if (-not $parent.AreAccessRulesProtected) { exit 3 }
$paths=@([System.IO.Path]::GetDirectoryName($env:MELTEMI_FIXTURE_ACL_PATH))
if ([System.IO.File]::Exists($env:MELTEMI_FIXTURE_ACL_PATH)) { $paths+= $env:MELTEMI_FIXTURE_ACL_PATH }
foreach ($p in $paths) {
 $acl=Get-Acl -LiteralPath $p
 $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
 if ($allowed -notcontains $owner) { exit 3 }
 foreach ($rule in $acl.Access) {
  if ($rule.AccessControlType -eq 'Allow' -and $allowed -notcontains $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value) { exit 3 }
 }
}
exit 0`;
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        env: {
          ...fixtureWindowsEnvironment(),
          MELTEMI_FIXTURE_ACL_PATH: file,
          MELTEMI_FIXTURE_NEW_EMPTY: newEmptyFile ? "1" : "0",
        },
        stdio: "pipe",
        timeout: 15_000,
      },
    );
  } catch (error) {
    // A failed process launch is not evidence that the ACL check rejected the directory.
    if (!(error && typeof error === "object" && "status" in error && error.status === 3)) {
      // eslint-disable-next-line preserve-caught-error -- Child process details must not escape the credential-handling CLI.
      throw new Error("OAuth fixture ACL process unavailable; no credential was logged.");
    }
    fixtureFailure();
  }
}

export function assertPrivateFixtureFile(file: string): void {
  checkPrivate(file);
}

/** Create privately before writing sensitive content, rather than fixing permissions afterward. */
export function writeNewPrivateFixtureFile(file: string, text: string): void {
  assertPrivateFixtureFile(file);
  if (!fixturePathPresent(dirname(file))) fixtureFailure();
  const descriptor = openSync(file, "wx", 0o600);
  try {
    // Elevated Windows processes can give new files the Administrators group as owner. Set only
    // this newly-created empty file's owner before any credential bytes are written.
    checkPrivate(file, true);
    writeFileSync(descriptor, text);
  } finally {
    closeSync(descriptor);
  }
}
