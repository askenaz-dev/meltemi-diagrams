import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { cloudHost, openCloud, type CloudContext, type CloudHooks } from "../src/cloud-context.js";
import { CloudError } from "../src/cloud-errors.js";
import { CredentialsStore, type StoredEntry } from "../src/credentials.js";
import { run } from "../src/index.js";
import { CloudStub } from "./cloud-stub.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-session-"));
const stub = new CloudStub();
beforeAll(async () => {
  await stub.start();
});
afterAll(async () => {
  await stub.stop();
  rmSync(scratch, { recursive: true, force: true });
});
beforeEach(() => {
  stub.requests.length = 0;
  stub.account.name = "Ana";
  stub.account.handle = null;
});
afterEach(() => setLocale("en"));

let counter = 0;
function home(extra: Record<string, string> = {}) {
  const root = join(scratch, `home-${counter++}`);
  mkdirSync(root, { recursive: true });
  const env: Record<string, string> = {
    APPDATA: join(root, "AppData"),
    XDG_CONFIG_HOME: join(root, "config"),
    HOME: root,
    USERPROFILE: root,
    MELTEMI_HOST: stub.url,
    ...extra,
  };
  return { root, env, store: new CredentialsStore({ env }) };
}

/** Signs a person in the way `login` leaves them: a token the stub knows, kept for the host. */
function signedIn(store: CredentialsStore, host = stub.url): StoredEntry {
  const { token, id } = stub.mint("CLI");
  const entry = { token, id, user: { sub: "u_7d3f", name: "Ana" } };
  store.save(host, entry);
  return entry;
}

async function mdg(args: string[], env: Record<string, string>, hooks: CloudHooks = {}) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: scratch,
    env,
    cloud: hooks,
  });
  return { code, stdout, stderr };
}

/** The port of a server that has just been closed: nothing listens there. */
async function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

describe("mdg logout", () => {
  it("revokes the stored token with its id and forgets the entry", async () => {
    const { env, store } = home();
    const entry = signedIn(store);
    const result = await mdg(["logout"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Signed out of ${stub.url}`);
    expect(stub.tokens.has(entry.token)).toBe(false);
    const [request] = stub.requests;
    expect(`${request!.method} ${request!.path}`).toBe(`DELETE /api/tokens/${entry.id}`);
    expect(request!.headers.authorization).toBe(`Bearer ${entry.token}`);
    expect(existsSync(store.path)).toBe(false);
    expect(result.stdout + result.stderr).not.toContain(entry.token);
  });

  it("forgets the entry of a token that is already revoked: the answer 401 token.invalid", async () => {
    const { env, store } = home();
    const entry = signedIn(store);
    stub.tokens.delete(entry.token);
    const result = await mdg(["logout"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already revoked");
    expect(store.entry(stub.url)).toBeUndefined();
    expect(existsSync(store.path)).toBe(false);
  });

  it("keeps the other hosts' entries", async () => {
    const { env, store } = home();
    signedIn(store);
    const other = { token: "mdg_other0123456789", id: "o1", user: { sub: "u_9", name: "Bo" } };
    store.save("https://elsewhere.example", other);
    expect((await mdg(["logout"], env)).code).toBe(0);
    expect(store.hosts()).toEqual(["https://elsewhere.example"]);
    expect(store.entry("https://elsewhere.example")).toEqual(other);
  });

  it("keeps the entry and fails when the service cannot be reached, so the token can be revoked later", async () => {
    const { env, store } = home();
    const host = `http://127.0.0.1:${await closedPort()}`;
    const entry = signedIn(store, host);
    const result = await mdg(["logout"], { ...env, MELTEMI_HOST: host });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("logout.not-revoked");
    expect(result.stderr).toContain("was not forgotten");
    expect(result.stderr).toContain(store.path);
    expect(result.stdout).toBe("");
    expect(store.entry(host)).toEqual(entry);
  });

  it("keeps the entry on a server error, with the reason", async () => {
    const { env, store } = home();
    const entry = signedIn(store);
    stub.fail(`DELETE /api/tokens/${entry.id}`, {
      status: 500,
      body: { code: "internal", message: "Something broke." },
    });
    const result = await mdg(["logout"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Something broke.");
    expect(store.entry(stub.url)).toEqual(entry);
    expect(stub.tokens.has(entry.token)).toBe(true);
    // Run again and it goes.
    expect((await mdg(["logout"], env)).code).toBe(0);
    expect(stub.tokens.has(entry.token)).toBe(false);
  });

  it("asks the token for its own id when the stored one is not its", async () => {
    const { env, store } = home();
    const entry = signedIn(store);
    store.save(stub.url, { ...entry, id: "stale-id" });
    const result = await mdg(["logout"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "DELETE /api/tokens/stale-id",
      "GET /api/session",
      `DELETE /api/tokens/${entry.id}`,
    ]);
    expect(stub.tokens.has(entry.token)).toBe(false);
    expect(store.entry(stub.url)).toBeUndefined();
  });

  it("has nothing to do when nobody is signed in", async () => {
    const { env } = home();
    const result = await mdg(["logout"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Not signed in to ${stub.url}; nothing to do.`);
    expect(stub.requests).toHaveLength(0);
  });

  it("never revokes MELTEMI_TOKEN, and says it stays in use", async () => {
    const fromEnvironment = stub.mint("ci");
    const { env, store } = home({ MELTEMI_TOKEN: fromEnvironment.token });
    const entry = signedIn(store);
    const result = await mdg(["logout"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("MELTEMI_TOKEN is set in the environment and stays in use");
    expect(stub.tokens.has(fromEnvironment.token)).toBe(true);
    expect(stub.tokens.has(entry.token)).toBe(false);
    expect(stub.requests[0]!.headers.authorization).toBe(`Bearer ${entry.token}`);
    // With nothing stored there is nothing to do but say so.
    const again = await mdg(["logout"], env);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Not signed in");
    expect(again.stdout).toContain("MELTEMI_TOKEN is set");
  });

  it("refuses plain http to a remote host, reports a corrupt file and takes only its option", async () => {
    const { env, store } = home();
    let fetched = false;
    const hooks: CloudHooks = {
      fetch: () => {
        fetched = true;
        return Promise.reject(new Error("no"));
      },
    };
    const insecure = await mdg(["logout", "--host", "http://diagrams.example"], env, hooks);
    expect(insecure.code).toBe(1);
    expect(insecure.stderr).toContain("cloud.insecure-host");
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(store.path, "[");
    const corrupt = await mdg(["logout"], env, hooks);
    expect(corrupt.code).toBe(1);
    expect(corrupt.stderr).toContain("credentials.corrupt");
    expect(readFileSync(store.path, "utf8")).toBe("[");
    const unknown = await mdg(["logout", "--force"], env, hooks);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("Usage: logout");
    expect((await mdg(["logout", "now"], env, hooks)).code).toBe(2);
    expect(fetched).toBe(false);
  });

  it("speaks Spanish with --lang es", async () => {
    const { env, store } = home();
    signedIn(store);
    const result = await mdg(["logout", "--lang", "es"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `Sesión cerrada en ${stub.url}: el token se revocó y se olvidó.`,
    );
  });
});

describe("mdg whoami", () => {
  it("prints the name, the handle and the host, and nothing of the token", async () => {
    const { env, store } = home();
    const entry = signedIn(store);
    stub.account.handle = "ana";
    const result = await mdg(["whoami"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`Ana (@ana)\nhost: ${stub.url}\n`);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(entry.token);
    expect(result.stdout).not.toContain(entry.id);
    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /api/session"]);
    expect(stub.requests[0]!.headers.authorization).toBe(`Bearer ${entry.token}`);
  });

  it("says when there is no handle yet, and in Spanish", async () => {
    const { env, store } = home();
    signedIn(store);
    expect((await mdg(["whoami"], env)).stdout).toBe(`Ana (no handle yet)\nhost: ${stub.url}\n`);
    expect((await mdg(["whoami", "--lang", "es"], env)).stdout).toBe(
      `Ana (sin handle todavía)\nservidor: ${stub.url}\n`,
    );
  });

  it("uses MELTEMI_TOKEN before the stored token, without needing the file", async () => {
    const fromEnvironment = stub.mint("ci");
    const { env, store } = home({ MELTEMI_TOKEN: fromEnvironment.token });
    // A stored token that would be refused, and then a file that cannot even be read.
    store.save(stub.url, { token: "mdg_dead0123456789", id: "x", user: { sub: "u", name: "Old" } });
    const first = await mdg(["whoami"], env);
    expect(first.code, first.stderr).toBe(0);
    expect(first.stdout).toBe(
      `Ana (no handle yet)\nhost: ${stub.url}\ntoken: from MELTEMI_TOKEN\n`,
    );
    expect(stub.requests[0]!.headers.authorization).toBe(`Bearer ${fromEnvironment.token}`);
    writeFileSync(store.path, "{ not json");
    expect((await mdg(["whoami"], env)).code).toBe(0);
  });

  it("selects the host with MELTEMI_HOST and --host, each with its own token", async () => {
    const { env, store } = home();
    const here = signedIn(store);
    const elsewhere = await new CloudStub().start();
    try {
      const there = elsewhere.mint("there");
      elsewhere.account.name = "Bo";
      store.save(elsewhere.url, {
        token: there.token,
        id: there.id,
        user: { sub: "u_9", name: "Bo" },
      });
      expect((await mdg(["whoami"], env)).stdout).toContain("Ana");
      const other = await mdg(["whoami", "--host", elsewhere.url], env);
      expect(other.stdout).toContain(`Bo (no handle yet)\nhost: ${elsewhere.url}`);
      // Each service saw its own token, and only its own.
      expect(stub.requests.map((r) => r.headers.authorization)).toEqual([`Bearer ${here.token}`]);
      expect(elsewhere.requests.map((r) => r.headers.authorization)).toEqual([
        `Bearer ${there.token}`,
      ]);
      // MELTEMI_HOST names the same thing.
      const viaEnvironment = await mdg(["whoami"], { ...env, MELTEMI_HOST: elsewhere.url });
      expect(viaEnvironment.stdout).toContain("Bo");
    } finally {
      await elsewhere.stop();
    }
  });

  it("sends the token to the development host over http, and to nowhere else", async () => {
    const { env, store } = home();
    const dev = `http://localhost:${stub.port}`;
    const entry = signedIn(store, dev);
    // Another host's token is not this host's.
    store.save("https://diagrams.meltemi.dev", {
      token: "mdg_production0123456789",
      id: "p",
      user: { sub: "u_1", name: "Prod" },
    });
    const seen: string[] = [];
    const result = await mdg(["whoami", "--host", dev], env, {
      fetch: (input, init) => {
        seen.push(String(input));
        return fetch(input, init);
      },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(seen).toEqual([`${dev}/api/session`]);
    expect(stub.requests.map((r) => r.headers.authorization)).toEqual([`Bearer ${entry.token}`]);
    expect(stub.requests.map((r) => r.headers.authorization).join()).not.toContain("production");
  });

  it("exits with 3 and says to run login when there is no token, before any request", async () => {
    const { env } = home();
    const result = await mdg(["whoami"], env);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain(
      `meltemi-diagrams whoami: cloud.not-signed-in: not signed in to ${stub.url}; run "meltemi-diagrams login".`,
    );
    expect(result.stdout).toBe("");
    expect(stub.requests).toHaveLength(0);
    const spanish = await mdg(["whoami", "--lang", "es"], env);
    expect(spanish.code).toBe(3);
    expect(spanish.stderr).toContain(
      `no has iniciado sesión en ${stub.url}; ejecuta "meltemi-diagrams login".`,
    );
  });

  it("exits with 3 and says to run login when the service refuses the token", async () => {
    const { env, store } = home();
    const entry = signedIn(store);
    stub.tokens.delete(entry.token);
    const result = await mdg(["whoami"], env);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("token.invalid");
    expect(result.stderr).toContain(`${stub.url} refused the token`);
    expect(result.stderr).toContain('run "meltemi-diagrams login"');
    // The entry is left for login or logout to deal with.
    expect(store.entry(stub.url)).toEqual(entry);
    const fromEnvironment = await mdg(["whoami"], {
      ...env,
      MELTEMI_TOKEN: "mdg_unknown0123456789",
    });
    expect(fromEnvironment.code).toBe(3);
    expect(fromEnvironment.stderr).not.toContain("mdg_unknown0123456789");
  });

  it("exits with 1 when the service cannot be reached or does not answer in the time allowed", async () => {
    const { env, store } = home();
    const host = `http://127.0.0.1:${await closedPort()}`;
    signedIn(store, host);
    const result = await mdg(["whoami"], { ...env, MELTEMI_HOST: host });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cloud.unreachable");
    expect(result.stderr).toContain(host);
  });

  it("shows no token in anything it prints, whatever the service sends", async () => {
    const { env, store } = home();
    signedIn(store);
    stub.account.name = "mdg_LeakedByTheService-123";
    const result = await mdg(["whoami"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("mdg_… (no handle yet)");
    expect(result.stdout).not.toContain("LeakedByTheService");
    // An error message the service fills with a token is shown redacted too.
    stub.fail("GET /api/session", {
      status: 500,
      body: { code: "internal", message: "Failed for mdg_AnotherSecret_456 today." },
    });
    const failed = await mdg(["whoami"], env);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("internal: Failed for mdg_… today.");
    expect(failed.stderr).not.toContain("AnotherSecret");
  });

  it("refuses plain http to a remote host, naming it, and takes no arguments", async () => {
    const { env } = home();
    let fetched = false;
    const result = await mdg(["whoami", "--host", "http://diagrams.example"], env, {
      fetch: () => {
        fetched = true;
        return Promise.reject(new Error("no"));
      },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cloud.insecure-host");
    expect(result.stderr).toContain("http://diagrams.example");
    expect(fetched).toBe(false);
    expect((await mdg(["whoami", "me"], env)).code).toBe(2);
    expect((await mdg(["whoami", "--json"], env)).code).toBe(2);
    const help = await mdg(["whoami", "--help"], env);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: whoami");
  });
});

describe("what a cloud command shares", () => {
  /** A context as the dispatcher builds it, for the helpers a command calls. */
  function context(env: Record<string, string>, hooks: CloudHooks = {}): CloudContext {
    return {
      name: "meltemi-diagrams",
      command: "push",
      stdout: () => undefined,
      stderr: () => undefined,
      cwd: scratch,
      display: (path) => path,
      env,
      toolVersion: "1.7.0",
      hooks,
      credentials: new CredentialsStore({ env }),
      used: {},
    };
  }

  it("fails with cloud.host-mismatch before any request when a manifest names another host", () => {
    const { env } = home({ MELTEMI_HOST: "" });
    let fetched = false;
    const ctx = context(env, {
      fetch: () => {
        fetched = true;
        return Promise.reject(new Error("no"));
      },
    });
    for (const open of [
      () => cloudHost(ctx, { manifestHost: "https://evil.example" }),
      () => openCloud(ctx, { manifestHost: "https://evil.example" }),
    ]) {
      try {
        open();
        expect.unreachable();
      } catch (error) {
        const caught = error as CloudError;
        expect(caught.code).toBe("cloud.host-mismatch");
        expect(caught.message).toContain("https://evil.example");
        expect(caught.message).toContain("https://diagrams.meltemi.dev");
        expect(caught.message).toContain("--host");
      }
    }
    // The host the manifest names is the one given: no mismatch, and then no token is the matter.
    expect(
      cloudHost(ctx, { host: "https://evil.example", manifestHost: "https://evil.example" }),
    ).toBe("https://evil.example");
    expect(fetched).toBe(false);
  });

  it("opens a session with the token of the host, else says to sign in with exit code 3", () => {
    const { env, store } = home();
    const ctx = context(env);
    let caught: CloudError | undefined;
    try {
      openCloud(ctx, { manifestHost: stub.url });
    } catch (error) {
      caught = error as CloudError;
    }
    expect(caught?.code).toBe("cloud.not-signed-in");
    expect(caught?.exitCode).toBe(3);
    const entry = signedIn(store);
    const session = openCloud(ctx, { manifestHost: stub.url });
    expect(session.host).toBe(stub.url);
    expect(session.token).toEqual({ token: entry.token, source: "file", entry });
    expect(ctx.used.host).toBe(stub.url);
    const viaEnvironment = openCloud(context({ ...env, MELTEMI_TOKEN: "mdg_envtoken0123" }));
    expect(viaEnvironment.token.source).toBe("environment");
  });

  it("is a command like the others for the binary: an unknown cloud-looking name is unknown", async () => {
    const { env } = home();
    const result = await mdg(["signin"], env);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('unknown command "signin"');
  });
});
