// The command line's side of the browser suite (`mdg.ts`), tested on its own: the scenarios that run
// `mdg` against the Worker stand on it, and a wrong helper would make them pass for the wrong
// reason (a scan for tokens that finds none, an environment that holds somebody's real sign-in, a
// command that outlives its time). It runs the command line from its sources for a few seconds
// (`--version`, and a `login` that is never approved); it needs no Worker, no browser and no network.

import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Cli, describe as describeCommand, tokensIn } from "./mdg.js";

const HOST = "http://localhost:9";
const made: Cli[] = [];
const saved = new Map<string, string | undefined>();

/** Sets a variable of this process for the test; `afterEach` puts it back. */
function setEnv(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  process.env[name] = value;
}

function cli(): Cli {
  const created = Cli.create(HOST);
  made.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(made.splice(0).map((one) => one.dispose()));
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("tokensIn", () => {
  it("finds every token in a text, whole, and nothing that only looks like the start of one", () => {
    const token = "mdg_AbC-_9xyz0123456789ABCDEFGHIJKLMNOPQRSTUVW";
    expect(tokensIn([`Bearer ${token}, again ${token}.`])).toEqual([token, token]);
    expect(tokensIn(["a mdg_abc123 b", "c mdg_x_y-z"])).toEqual(["mdg_abc123", "mdg_x_y-z"]);
    // What the command line prints in place of a token is not one; nor are its own words.
    for (const text of ["mdg_…", "mdg_", "mdg push", 'run "mdg login"', "xmdg", "mdg-cli", ""]) {
      expect(tokensIn([text]), text).toEqual([]);
    }
    // A pattern that is applied to several texts in a row does not skip a match in any of them.
    expect(tokensIn(["mdg_one", "mdg_two", "mdg_three"])).toHaveLength(3);
  });
});

describe("a computer of its own", () => {
  it("has a home and configuration folders in a temporary folder, the Worker as its host and nobody signed in", () => {
    setEnv("MELTEMI_TOKEN", "mdg_somebody-elses-token");
    setEnv("MELTEMI_HOST", "https://example.com");
    setEnv("CLOUDFLARE_API_TOKEN", "not-for-this");
    setEnv("LANG", "es_ES.UTF-8");
    setEnv("LC_ALL", "es_ES.UTF-8");
    const one = cli();
    expect(one.root.startsWith(tmpdir())).toBe(true);
    expect(existsSync(one.work)).toBe(true);
    expect(one.work.startsWith(one.root)).toBe(true);

    const env = one.env;
    const names = Object.keys(env).map((name) => name.toLowerCase());
    expect(names).not.toContain("meltemi_token");
    expect(names.filter((name) => name.startsWith("cloudflare_"))).toEqual([]);
    expect(names).not.toContain("lang");
    expect(names).not.toContain("lc_all");
    expect(env["MELTEMI_HOST"]).toBe(HOST);
    expect(env["MELTEMI_LANG"]).toBe("en");
    for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME"]) {
      expect(env[name]?.startsWith(one.root), name).toBe(true);
    }
    expect(one.credentialsFile.startsWith(one.root)).toBe(true);
    expect(one.credentialsFile.endsWith(join("meltemi-diagrams", "credentials.json"))).toBe(true);
    // Another computer is another folder.
    expect(cli().root).not.toBe(one.root);
  });

  it("removes its folder when it is disposed of", async () => {
    const one = cli();
    mkdirSync(join(one.work, "files"));
    await one.dispose();
    expect(existsSync(one.root)).toBe(false);
  });
});

describe("a command", () => {
  it("runs the command line from its sources in a folder whose name holds a space, with no shell", async () => {
    const one = cli();
    const folder = join(one.work, "a folder with spaces & (symbols)");
    mkdirSync(folder);
    const done = await one.run(["--version"], { cwd: folder });
    expect(done.code, describeCommand(done)).toBe(0);
    expect(done.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(done.stderr).toBe("");
    expect(done.timedOut).toBe(false);
    // What it printed is kept, to be looked at once the scenario is over.
    expect(one.printed()).toEqual([done.stdout, done.stderr]);
  }, 60_000);

  it("is ended with its tree when it does not finish in time, and says so", async () => {
    const one = cli();
    // A sign-in nobody approves waits for five minutes; here it is given two seconds.
    const login = one.start(["login", "--no-browser"], { timeoutMs: 2_000 });
    const check = await login.waitFor(/^check: ([A-Z2-7]{6})$/m, "the check line");
    expect(check[1]).toMatch(/^[A-Z2-7]{6}$/);
    const done = await login.finished;
    expect(done.timedOut).toBe(true);
    expect(done.code).not.toBe(0);
    expect(describeCommand(done)).toContain("did not finish in time");
  }, 60_000);

  it("waits for a line, and fails with all that was printed when the command ends without it", async () => {
    const one = cli();
    const version = one.start(["--version"]);
    await expect(version.waitFor(/never printed/, "a line that never comes")).rejects.toThrow(
      /ended without a line that never comes[\s\S]*--- stdout/,
    );
    const again = one.start(["--version"]);
    expect((await again.waitFor(/^(\d+)\./m, "the version"))[1]).toMatch(/^\d+$/);
  }, 60_000);

  it("is ended when the computer is disposed of while it runs", async () => {
    const one = cli();
    const login = one.start(["login", "--no-browser"]);
    await login.waitFor(/^Waiting for the approval/m, "the wait for the approval");
    await one.dispose();
    const done = await login.finished;
    expect(done.code).not.toBe(0);
    expect(done.timedOut).toBe(false);
    expect(existsSync(one.root)).toBe(false);
  }, 60_000);
});
