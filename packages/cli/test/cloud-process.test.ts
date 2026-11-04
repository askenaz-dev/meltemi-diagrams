import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { CredentialsStore } from "../src/credentials.js";
import { redactSecrets } from "../src/index.js";
import { CloudStub } from "./cloud-stub.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-process-"));
const stub = new CloudStub();
beforeAll(async () => {
  await stub.start();
});
afterAll(async () => {
  await stub.stop();
  rmSync(scratch, { recursive: true, force: true });
});

const NODE = [
  "--import",
  "tsx",
  "--conditions=@meltemi/diagrams-source",
  "packages/cli/src/bin.ts",
];

describe("tokens in anything the command line prints", () => {
  it("are replaced by mdg_… wherever they appear, like provider keys", () => {
    expect(redactSecrets("failed with mdg_abc123", {})).toBe("failed with mdg_…");
    expect(redactSecrets("a mdg_AbC-_9 b mdg_x_y-z", {})).toBe("a mdg_… b mdg_…");
    expect(redactSecrets("mdg_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG", {})).toBe("mdg_…");
    expect(redactSecrets("Bearer mdg_abc123, then mdg_def456.", {})).toBe(
      "Bearer mdg_…, then mdg_….",
    );
    expect(redactSecrets("token=mdg_abc123&x=1", {})).toBe("token=mdg_…&x=1");
  });

  it("are not words that merely look like one", () => {
    for (const text of [
      "mdg_",
      "mdg push",
      "run mdg login",
      "mdg_ alone",
      "mdg-cli",
      "xmdg",
      "mdg",
    ]) {
      expect(redactSecrets(text, {}), text).toBe(text);
    }
  });

  it("go together with the values of secret-looking variables", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-0123456789",
      MELTEMI_TOKEN: "plain-token-value",
      PATH: "/bin",
    };
    expect(
      redactSecrets("mdg_abc123 and sk-ant-0123456789 and plain-token-value in /bin", env),
    ).toBe("mdg_… and [redacted] and [redacted] in /bin");
    // A token that is also in the environment is shown as a token.
    expect(redactSecrets("x mdg_envvalue123 y", { MELTEMI_TOKEN: "mdg_envvalue123" })).toBe(
      "x mdg_… y",
    );
  });

  it("are replaced in an uncaught failure, which exits with code 70", () => {
    const preload = join(scratch, "throw-later.mjs");
    writeFileSync(
      preload,
      'setTimeout(() => { throw new Error("it broke on mdg_abc123 with mdg_ and mdg push"); }, 500);\n',
    );
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(preload).href, ...NODE, "--version"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: { ...process.env, MELTEMI_DEBUG: "1" },
      },
    );
    expect(result.status).toBe(70);
    expect(result.stderr).toContain("internal error: it broke on mdg_… with mdg_ and mdg push");
    expect(result.stderr).not.toContain("abc123");
  }, 60_000);
});

interface Finished {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the binary from the sources with the environment given; `input` is its standard input. */
function bin(args: string[], env: Record<string, string>, input = ""): Promise<Finished> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...NODE, ...args], { cwd: REPO_ROOT, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (text: string) => (stdout += text));
    child.stderr.setEncoding("utf8").on("data", (text: string) => (stderr += text));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

describe("the binary", () => {
  it("signs in with a token from standard input, asks who it is, and signs out", async () => {
    const root = join(scratch, "binary-home");
    mkdirSync(root, { recursive: true });
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            entry[1] !== undefined && !/^MELTEMI_(TOKEN|HOST|LANG)$/.test(entry[0]),
        ),
      ),
      APPDATA: join(root, "AppData"),
      XDG_CONFIG_HOME: join(root, "config"),
      HOME: root,
      USERPROFILE: root,
      MELTEMI_HOST: stub.url,
    };
    const { token, id } = stub.mint("laptop");
    const store = new CredentialsStore({ env });

    // The token comes from standard input, never from an argument.
    const login = await bin(["login", "--token"], env, `${token}\n`);
    expect(login.stderr).toBe("");
    expect(login.code).toBe(0);
    expect(login.stdout).toBe(`Signed in as Ana (${stub.url})\n`);
    expect(JSON.parse(readFileSync(store.path, "utf8")).hosts[stub.url]).toEqual({
      token,
      id,
      user: { sub: "u_7d3f", name: "Ana" },
    });

    const whoami = await bin(["whoami"], env);
    expect(whoami.stderr).toBe("");
    expect(whoami.code).toBe(0);
    expect(whoami.stdout).toBe(`Ana (no handle yet)\nhost: ${stub.url}\n`);

    // The same command with the token in the environment and nothing stored.
    const ci = stub.mint("ci");
    const bare: Record<string, string> = {
      ...env,
      MELTEMI_TOKEN: ci.token,
      APPDATA: join(root, "x"),
      XDG_CONFIG_HOME: join(root, "y"),
    };
    const fromEnvironment = await bin(["whoami"], bare);
    expect(fromEnvironment.code, fromEnvironment.stderr).toBe(0);
    expect(fromEnvironment.stdout).toContain("token: from MELTEMI_TOKEN");
    expect(stub.requests.at(-1)!.headers.authorization).toBe(`Bearer ${ci.token}`);

    // Not signed in is exit code 3 and says to run login.
    const nobody = await bin(["whoami"], {
      ...env,
      APPDATA: join(root, "z"),
      XDG_CONFIG_HOME: join(root, "z"),
    });
    expect(nobody.code).toBe(3);
    expect(nobody.stderr).toContain('run "meltemi-diagrams login"');

    const logout = await bin(["logout"], env);
    expect(logout.code, logout.stderr).toBe(0);
    expect(existsSync(store.path)).toBe(false);
    expect(stub.tokens.has(token)).toBe(false);
    for (const output of [login, whoami, fromEnvironment, logout]) {
      expect(output.stdout + output.stderr).not.toContain(token);
      expect(output.stdout + output.stderr).not.toContain(ci.token);
    }
  }, 120_000);
});
