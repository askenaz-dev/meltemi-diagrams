import { expect, it } from "vitest";
import { fixtureWindowsEnvironment } from "../src/mcp/oauth-fixtures-windows-env.js";

it.each([
  { SYSTEMROOT: "synthetic-system", Path: "synthetic-path" },
  { systemroot: "synthetic-system", path: "synthetic-path" },
  { sYsTeMrOoT: "synthetic-system", pAtH: "synthetic-path" },
])("normalizes the system root and executable path regardless of source casing", (source) => {
  expect(fixtureWindowsEnvironment(source)).toEqual({
    SystemRoot: "synthetic-system",
    PATH: "synthetic-path",
  });
});

it("keeps only the Windows OS/profile/module allowlist and drops every credential family", () => {
  const source = {
    windir: "windows",
    systemdrive: "drive",
    comspec: "shell",
    userprofile: "profile",
    homedrive: "home-drive",
    homepath: "home-path",
    appdata: "roaming",
    localappdata: "local",
    temp: "temp",
    tmp: "tmp",
    psmodulepath: "modules",
    programfiles: "programs",
    "PROGRAMFILES(X86)": "x86",
    programw6432: "program64",
    commonprogramfiles: "common",
    "commonprogramfiles(x86)": "common-x86",
    commonprogramw6432: "common64",
    CLOUDFLARE_API_TOKEN: "must-not-forward-cf",
    MELTEMI_TOKEN: "must-not-forward-mdg",
    MELTEMI_TOKEN_2: "must-not-forward-mdg2",
    GH_TOKEN: "must-not-forward-gh",
    GITHUB_TOKEN: "must-not-forward-github",
    NODE_OPTIONS: "must-not-forward-code",
    ProgramFiles_SECRET: "must-not-forward-prefix-lookalike",
    USERPROFILE_SECRET: "must-not-forward-prefix",
  };
  const result = fixtureWindowsEnvironment(source);
  expect(result).toEqual({
    WINDIR: "windows",
    SystemDrive: "drive",
    ComSpec: "shell",
    USERPROFILE: "profile",
    HOMEDRIVE: "home-drive",
    HOMEPATH: "home-path",
    APPDATA: "roaming",
    LOCALAPPDATA: "local",
    TEMP: "temp",
    TMP: "tmp",
    PSModulePath: "modules",
    ProgramFiles: "programs",
    "ProgramFiles(x86)": "x86",
    ProgramW6432: "program64",
    CommonProgramFiles: "common",
    "CommonProgramFiles(x86)": "common-x86",
    CommonProgramW6432: "common64",
  });
  expect(JSON.stringify(result)).not.toContain("must-not-forward");
  expect(Object.keys(result).some((name) => /^(?:CLOUDFLARE|MELTEMI|GH_|GITHUB)/i.test(name))).toBe(
    false,
  );
});

it("does not add unset values and uses an explicitly present canonical spelling consistently", () => {
  expect(
    fixtureWindowsEnvironment({
      SystemRoot: undefined,
      SYSTEMROOT: "fallback",
      PATH: "canonical",
      Path: "other",
    }),
  ).toEqual({ SystemRoot: "fallback", PATH: "canonical" });
  expect(fixtureWindowsEnvironment({})).toEqual({});
});
