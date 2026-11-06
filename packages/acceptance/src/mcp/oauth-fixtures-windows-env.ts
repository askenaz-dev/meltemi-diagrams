// Windows workers can expose a case-sensitive process.env copy. Normalize only OS variables
// needed by PowerShell; never forward the parent's credential-bearing environment wholesale.
const WINDOWS_OS_VARIABLES = [
  "SystemRoot",
  "WINDIR",
  "SystemDrive",
  "ComSpec",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "PSModulePath",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "CommonProgramFiles",
  "CommonProgramFiles(x86)",
  "CommonProgramW6432",
  "PATH",
] as const;

// The parent may use PowerShell 7 while powershell.exe is Windows PowerShell 5.
// Load only that executable's built-in ACL module, without invoking another autoloaded module.
export const FIXTURE_WINDOWS_ACL_BOOTSTRAP = `$ErrorActionPreference='Stop'; Import-Module -Name ([System.IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Security','Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop`;

export function fixtureWindowsEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const folded = new Map(
    Object.entries(source)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name, value]) => [name.toLowerCase(), value]),
  );
  const result: NodeJS.ProcessEnv = {};
  for (const name of WINDOWS_OS_VARIABLES) {
    const value = source[name] ?? folded.get(name.toLowerCase());
    if (value !== undefined) result[name] = value;
  }
  return result;
}
