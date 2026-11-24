// `cli-doctor`: the five checks, their lines and JSON, the exit codes, and that the command reads
// only: no file written, no request made, no part of a token printed.

import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { CredentialsStore, DEFAULT_HOST } from "../src/credentials.js";
import { doctorCommand, type DoctorContext } from "../src/doctor-command.js";

/** Every file under a folder, with its size and time, to prove nothing was written. */
function snapshot(dir: string): string[] {
  const found: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else {
        const stat = statSync(path);
        found.push(`${relative(dir, path)} ${stat.size} ${stat.mtimeMs}`);
      }
    }
  };
  visit(dir);
  return found.sort();
}

/** A folder and a home, empty, under a scratch folder of their own. */
function place() {
  const root = mkdtempSync(join(tmpdir(), "mdg-doctor-"));
  const folder = join(root, "project");
  const home = join(root, "home");
  mkdirSync(folder);
  mkdirSync(home);
  return { root, folder, home };
}

/** Writes a skill copy saying `version` under `base`'s agent folder. */
function skill(base: string, agentFolder: string, version: string) {
  const path = join(base, agentFolder, "skills", "meltemi-diagrams");
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "SKILL.md"),
    `---\nname: meltemi-diagrams\nmetadata:\n  version: ${version}\n---\n`,
  );
}

function doctor(
  args: string[],
  where: { folder: string; home: string },
  overrides: Partial<DoctorContext> = {},
) {
  let stdout = "";
  let stderr = "";
  const code = doctorCommand(args, {
    name: "meltemi-diagrams",
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: where.folder,
    env: { APPDATA: join(where.home, "AppData"), XDG_CONFIG_HOME: join(where.home, ".config") },
    toolVersion: "1.12.3",
    home: where.home,
    nodeVersion: "24.15.0",
    findBrowser: () => "/opt/edge/msedge",
    findFfmpeg: () => "/usr/bin/ffmpeg",
    ffmpegVersion: () => "6.1.1",
    ...overrides,
  });
  return { code, stdout, stderr, lines: stdout.split("\n").filter((line) => line !== "") };
}

describe("mdg doctor", () => {
  afterEach(() => {
    setLocale("en");
    vi.unstubAllGlobals();
  });

  it("reports five ok lines and exits 0 on a machine with everything", () => {
    const where = place();
    skill(where.folder, ".claude", "1.12.0");
    const run = doctor([], where);
    expect(run.code).toBe(0);
    const checks = run.lines.slice(0, 5);
    expect(checks.map((line) => line.split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "ok node",
      "ok browser",
      "ok ffmpeg",
      "ok skill",
      "ok sign-in",
    ]);
    expect(run.lines.at(-1)).toBe("5 ok, 0 warnings, 0 failures.");
  });

  it("warns without a browser, says how to name one, and still exits 0", () => {
    const run = doctor([], place(), { findBrowser: () => null });
    expect(run.code).toBe(0);
    const browser = run.lines.findIndex((line) => line.startsWith("warn  browser"));
    expect(run.lines[browser]).toContain("PNG, PDF and video exports are unavailable");
    expect(run.lines[browser + 1]).toContain("MELTEMI_BROWSER");
    expect(run.lines.find((line) => line.startsWith("ok    ffmpeg"))).toContain(
      "which also need a browser",
    );
    expect(run.lines.at(-1)).toBe("4 ok, 1 warning, 0 failures.");
  });

  it("warns without FFmpeg, naming the video formats", () => {
    const run = doctor([], place(), { findFfmpeg: () => null });
    expect(run.lines.find((line) => line.startsWith("warn  ffmpeg"))).toContain(
      "MP4, WebM and GIF",
    );
  });

  it("fails below Node 22.12, naming the version, and exits 1", () => {
    const run = doctor([], place(), { nodeVersion: "22.11.0" });
    expect(run.code).toBe(1);
    expect(run.lines[0]).toBe(
      "fail  node     Node 22.11.0, older than the 22.12 the command line needs",
    );
    expect(run.lines[1]).toContain("Install Node 22.12 or later.");
  });

  it("refuses an unknown option and a folder that is not there with code 2", () => {
    const where = place();
    const option = doctor(["--fix"], where);
    expect(option.code).toBe(2);
    expect(option.stderr).toContain("--fix");
    expect(option.stderr).toContain("doctor --help");
    const missing = doctor(["missing"], where);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("missing is not a folder that exists.");
  });

  it("warns for a copy of an earlier minor version, naming it and both versions", () => {
    const where = place();
    skill(where.folder, ".claude", "1.10.0");
    const run = doctor([], where, { display: (path) => relative(where.folder, path) });
    const line = run.lines.findIndex((l) => l.startsWith("warn  skill"));
    expect(run.lines[line]).toContain(".claude");
    expect(run.lines[line]).toContain("1.10.0");
    expect(run.lines[line]).toContain("1.12.3");
    expect(run.lines[line + 1]).toContain("the way it was installed");
  });

  it("accepts a copy of the same minor version, in the folder or in the home", () => {
    const where = place();
    skill(where.home, ".agents", "1.12.0");
    const run = doctor([], where);
    expect(run.lines.find((line) => line.includes("skill"))).toMatch(/^ok {4}skill/);
  });

  it("says there is no skill and no sign-in, and how to get each, as ok", () => {
    const run = doctor([], place());
    expect(run.lines.find((l) => l.startsWith("ok    skill"))).toContain("skill install");
    expect(run.lines.find((l) => l.startsWith("ok    sign-in"))).toContain("login");
  });

  it("prints one JSON object with the five checks in order, its keys the same in Spanish", () => {
    const where = place();
    const english = JSON.parse(doctor(["--json"], where, { findBrowser: () => null }).stdout);
    expect(english.version).toBe("1.12.3");
    expect(english.checks.map((c: { id: string }) => c.id)).toEqual([
      "node",
      "browser",
      "ffmpeg",
      "skill",
      "sign-in",
    ]);
    expect(english.checks[1]).toEqual({
      id: "browser",
      status: "warn",
      detail: expect.any(String),
      fix: expect.stringContaining("MELTEMI_BROWSER"),
    });
    expect("fix" in english.checks[0]).toBe(false);
    setLocale("es");
    const spanish = JSON.parse(doctor(["--json"], where, { findBrowser: () => null }).stdout);
    expect(spanish.checks.map((c: object) => Object.keys(c))).toEqual(
      english.checks.map((c: object) => Object.keys(c)),
    );
    expect(spanish.checks.map((c: { status: string }) => c.status)).toEqual(
      english.checks.map((c: { status: string }) => c.status),
    );
    expect(spanish.checks[1].detail).toContain("no están disponibles");
  });

  it("writes nothing and makes no request", () => {
    const where = place();
    skill(where.folder, ".agents", "1.12.0");
    const before = snapshot(where.root);
    const fetch = vi.fn(() => Promise.reject(new Error("no request")));
    vi.stubGlobal("fetch", fetch);
    expect(doctor([], where).code).toBe(0);
    expect(doctor(["--json"], where).code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(snapshot(where.root)).toEqual(before);
  });

  it("says a sign-in is stored without printing any part of its token", () => {
    const where = place();
    const env = {
      APPDATA: join(where.home, "AppData"),
      XDG_CONFIG_HOME: join(where.home, ".config"),
    };
    const token = "mdg_0123456789abcdefSECRETvalue";
    new CredentialsStore({ env, home: where.home }).save(DEFAULT_HOST, {
      token,
      id: "tok_1",
      user: { sub: "u1", name: "Ana" },
    });
    const run = doctor(["--json"], where, { env });
    expect(run.stdout).toContain(`Signed in to ${DEFAULT_HOST}`);
    expect(run.stdout).not.toContain("SECRET");
    expect(run.stdout).not.toContain("mdg_");
  });
});
