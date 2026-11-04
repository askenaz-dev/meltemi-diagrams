import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { CloudClient } from "../src/cloud-client.js";
import type { CloudHooks } from "../src/cloud-context.js";
import { CredentialsStore } from "../src/credentials.js";
import { approvalCheck, base32, languageOf } from "../src/login-listener.js";
import { run } from "../src/index.js";
import { CloudStub } from "./cloud-stub.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-login-"));
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
  stub.exchanges = 0;
  stub.refusedExchanges = 0;
  stub.approval = "approve";
  stub.account.handle = null;
});
afterEach(() => setLocale("en"));

let counter = 0;
/** A home of its own: its configuration folder is the only one the commands see. */
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
  const store = new CredentialsStore({ env });
  return { root, env, store };
}

interface Running {
  readonly out: () => string;
  readonly err: () => string;
  readonly events: readonly string[];
  readonly result: Promise<number>;
}

/** Starts a command with the cloud hooks given; `stdin` is what standard input holds. */
function start(
  args: string[],
  env: Record<string, string>,
  options: { stdin?: string; hooks?: CloudHooks; ask?: boolean } = {},
): Running {
  let stdout = "";
  let stderr = "";
  const events: string[] = [];
  const open = options.hooks?.openBrowser;
  const hooks: CloudHooks = {
    ...options.hooks,
    ...(open
      ? {
          openBrowser: (url: string) => {
            events.push("open");
            return open(url);
          },
        }
      : {}),
  };
  const result = Promise.resolve(
    run(args, {
      stdout: (text) => {
        stdout += text;
        events.push(`out:${text}`);
      },
      stderr: (text) => (stderr += text),
      cwd: scratch,
      env,
      ...(options.stdin !== undefined ? { stdin: async () => options.stdin! } : {}),
      cloud: hooks,
    }),
  );
  return { out: () => stdout, err: () => stderr, events, result };
}

async function mdg(
  args: string[],
  env: Record<string, string>,
  options: { stdin?: string; hooks?: CloudHooks } = {},
) {
  const running = start(args, env, options);
  const code = await running.result;
  return { code, stdout: running.out(), stderr: running.err(), events: running.events };
}

/** The browser of a person who approves: follows what the service sends back to the listener. */
function browser(
  options: {
    language?: string;
    before?: (port: number) => Promise<void>;
    /** Doing something while the request is in the air, before the redirect is followed. */
    beforeRedirect?: (url: string) => void;
  } = {},
) {
  const opened: string[] = [];
  const landed: { url: string; status: number; body: string; headers: Headers }[] = [];
  const errors: unknown[] = [];
  const pending: Promise<void>[] = [];
  return {
    opened,
    landed,
    errors,
    /** Starts the visit without waiting for it: the command is waiting for the visit's redirect. */
    open: (url: string): void => {
      opened.push(url);
      options.beforeRedirect?.(url);
      pending.push(
        (async () => {
          const port = Number(new URL(url).searchParams.get("port"));
          await options.before?.(port);
          const response = await fetch(url, {
            redirect: "follow",
            headers: options.language ? { "Accept-Language": options.language } : {},
          });
          landed.push({
            url: response.url,
            status: response.status,
            body: await response.text(),
            headers: response.headers,
          });
        })().catch((error: unknown) => {
          errors.push(error);
        }),
      );
    },
    settled: () => Promise.all(pending).then(() => undefined),
  };
}

/** An independent check of the six characters: the top 30 bits of SHA-256 as base32. */
function expectedCheck(state: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const digest = BigInt(`0x${createHash("sha256").update(state).digest("hex")}`);
  const top = digest >> BigInt(256 - 30);
  return Array.from(
    { length: 6 },
    (_, i) => alphabet[Number((top >> BigInt(5 * (5 - i))) & 31n)],
  ).join("");
}

const refused = (url: string) =>
  fetch(url).then(
    () => "answered",
    () => "refused",
  );

describe("the check", () => {
  it("is the first six characters of the base32 of the SHA-256 of the state", () => {
    expect(base32(new Uint8Array([0]))).toBe("AA");
    expect(base32(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
    expect(base32(new TextEncoder().encode("fooba"))).toBe("MZXW6YTB");
    for (const state of [
      "a".repeat(43),
      "0123456789abcdefghij_-ABCDEFGHIJKLMNOP",
      "x".repeat(16),
    ]) {
      expect(approvalCheck(state)).toMatch(/^[A-Z2-7]{6}$/);
      expect(approvalCheck(state)).toBe(expectedCheck(state));
    }
    // The service's own page shows the same six for the same state (docs/cloud.md).
    expect(approvalCheck("a".repeat(43))).not.toBe(approvalCheck("b".repeat(43)));
  });

  it("reads the language of a page from Accept-Language, by preference", () => {
    expect(languageOf("es-CL,es;q=0.9,en;q=0.8")).toBe("es");
    expect(languageOf("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(languageOf("fr-FR,es;q=0.6,en;q=0.3")).toBe("es");
    expect(languageOf("de;q=0.9, en;q=0.1")).toBe("en");
    expect(languageOf("es;q=0, en")).toBe("en");
    expect(languageOf("fr, de", "es")).toBe("es");
    expect(languageOf(undefined, "es")).toBe("es");
    expect(languageOf("*", "en")).toBe("en");
  });
});

describe("mdg login in a browser", () => {
  it("prints the check first, exchanges the code once and keeps the token under the host", async () => {
    const { env, store } = home();
    const visit = browser();
    const running = start(["login"], env, { hooks: { openBrowser: visit.open } });
    const code = await running.result;
    await visit.settled();
    expect(visit.errors).toEqual([]);
    expect(code, running.err()).toBe(0);

    // What the browser was sent to, and what the service saw.
    const [url] = visit.opened;
    const opened = new URL(url!);
    expect(opened.origin).toBe(stub.url);
    expect(opened.pathname).toBe("/cli-auth");
    const state = opened.searchParams.get("state")!;
    const port = Number(opened.searchParams.get("port"));
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(port).toBeGreaterThanOrEqual(1024);
    expect(stub.to("/cli-auth", "GET")).toHaveLength(1);

    // The check is printed before the browser is opened, and is the one the page shows.
    const first = running.events.findIndex((e) => e.startsWith("out:check: "));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(running.events.indexOf("open"));
    expect(running.events[0]).toMatch(/^out:check: [A-Z2-7]{6}\n/);
    expect(running.out()).toContain(`check: ${expectedCheck(state)}\n`);

    // One exchange, with the code and the state, and no token with it.
    expect(stub.exchanges).toBe(1);
    expect(stub.refusedExchanges).toBe(0);
    const [exchange] = stub.to("/cli-auth/token", "POST");
    expect(exchange!.headers.authorization).toBeUndefined();
    expect(Object.keys(JSON.parse(exchange!.body.toString())).sort()).toEqual(["code", "state"]);
    expect(JSON.parse(exchange!.body.toString()).state).toBe(state);

    // The token is kept with its id and the person, under the host.
    const written = JSON.parse(readFileSync(store.path, "utf8"));
    const entry = written.hosts[stub.url];
    expect(Object.keys(written.hosts)).toEqual([stub.url]);
    expect(entry.token).toMatch(/^mdg_[A-Za-z0-9_-]+$/);
    expect(entry.id).toBe(stub.tokens.get(entry.token)!.id);
    expect(entry.user).toEqual({ sub: "u_7d3f", name: "Ana" });
    expect(running.out()).toContain("Signed in as Ana");

    // The session was asked with the new token; the token is in no address and in no output.
    expect(stub.to("/api/session", "GET").at(-1)!.headers.authorization).toBe(
      `Bearer ${entry.token}`,
    );
    for (const request of stub.requests) {
      expect(`${request.path}${request.query}`).not.toContain(entry.token);
    }
    expect(running.out() + running.err()).not.toContain(entry.token);
    const landing = new URL(visit.landed[0]!.url);
    const secretCode = landing.searchParams.get("code")!;
    expect(secretCode.length).toBeGreaterThan(20);
    expect(running.out() + running.err()).not.toContain(secretCode);
    expect(running.out() + running.err()).not.toContain(landing.search.slice(1));

    // The page the browser got says it is done, and the listener is closed.
    expect(visit.landed[0]!.status).toBe(200);
    expect(visit.landed[0]!.body).toContain("Done. You can close this window");
    expect(visit.landed[0]!.headers.get("content-type")).toContain("text/html");
    expect(visit.landed[0]!.headers.get("referrer-policy")).toBe("no-referrer");
    expect(visit.landed[0]!.headers.get("cache-control")).toBe("no-store");
    expect(landing.hostname).toBe("127.0.0.1");
    expect(Number(landing.port)).toBe(port);
    expect(await refused(`http://127.0.0.1:${port}/`)).toBe("refused");
    expect(await refused(`http://127.0.0.1:${port}/?code=${secretCode}&state=${state}`)).toBe(
      "refused",
    );

    // The service refuses the same code again: it is answered once.
    const again = await new CloudClient({ host: stub.url }).exchangeCode(secretCode, state).then(
      () => "made a token",
      (error: { code: string }) => error.code,
    );
    expect(again).toBe("cli.invalid");
    expect(stub.exchanges).toBe(1);
  });

  it("is told in Spanish by Accept-Language, and falls back to the command's language", async () => {
    const spanish = browser({ language: "es-CL,es;q=0.9,en;q=0.8" });
    const one = home();
    expect((await mdg(["login"], one.env, { hooks: { openBrowser: spanish.open } })).code).toBe(0);
    await spanish.settled();
    expect(spanish.landed[0]!.body).toContain('<html lang="es">');
    expect(spanish.landed[0]!.body).toContain(
      "Listo. Puedes cerrar esta ventana y volver a la terminal.",
    );

    const neither = browser({ language: "fr-FR,de;q=0.5" });
    const two = home();
    await mdg(["login"], two.env, { hooks: { openBrowser: neither.open } });
    await neither.settled();
    expect(neither.landed[0]!.body).toContain("Done. You can close this window");

    const lang = browser({ language: "fr-FR" });
    const three = home();
    const result = await mdg(["login", "--lang", "es"], three.env, {
      hooks: { openBrowser: lang.open },
    });
    await lang.settled();
    expect(lang.landed[0]!.body).toContain("Listo.");
    expect(result.stdout).toMatch(/^comprobación: [A-Z2-7]{6}\n/);
    expect(result.stdout).toContain("Sesión iniciada como Ana");
  });

  it("turns away everything but a request with a code and a state, and goes on waiting", async () => {
    const { env } = home();
    const answers: Record<string, number> = {};
    const visit = browser({
      before: async (port) => {
        const base = `http://127.0.0.1:${port}`;
        const status = async (label: string, url: string, init: RequestInit = {}) => {
          answers[label] = (await fetch(`${base}${url}`, init)).status;
        };
        await status("post", "/", { method: "POST", body: "code=x&state=y" });
        await status("put", "/?code=x&state=y", { method: "PUT" });
        await status("other path", "/favicon.ico");
        await status("other path with code", "/steal?code=x&state=y");
        await status("no query", "/");
        await status("no state", "/?code=x");
        await status("no code", "/?state=y");
        await status("empty code", "/?code=&state=y");
        await status("two codes", "/?code=x&code=y&state=z");
        await new Promise<void>((resolve, reject) => {
          // A name of its own for this machine (DNS rebinding) is not the listener's name.
          const spoofed = httpRequest(
            {
              host: "127.0.0.1",
              port,
              path: "/?code=x&state=y",
              headers: { Host: "evil.example" },
            },
            (response) => {
              answers["spoofed host"] = response.statusCode ?? 0;
              response.resume();
              resolve();
            },
          );
          spoofed.on("error", reject);
          spoofed.end();
        });
      },
    });
    const result = await mdg(["login"], env, { hooks: { openBrowser: visit.open } });
    await visit.settled();
    expect(visit.errors).toEqual([]);
    expect(answers).toEqual({
      post: 405,
      put: 405,
      "other path": 404,
      "other path with code": 404,
      "no query": 400,
      "no state": 400,
      "no code": 400,
      "empty code": 400,
      "two codes": 400,
      "spoofed host": 421,
    });
    expect(result.code).toBe(0);
    expect(stub.exchanges).toBe(1);
  });

  it("does not open a browser with --no-browser: it prints the address and waits for it to be used", async () => {
    const { env, store } = home();
    const running = start(["login", "--no-browser"], env, {
      hooks: {
        openBrowser: () => {
          throw new Error("the browser must not be opened");
        },
      },
    });
    const address = await waitFor(
      () =>
        /(http:\/\/127\.0\.0\.1:\d+\/cli-auth\?port=\d+&state=[A-Za-z0-9_-]+)/.exec(
          running.out(),
        )?.[1],
    );
    expect(running.out()).toMatch(/^check: [A-Z2-7]{6}\n/);
    expect(running.events).not.toContain("open");
    expect(existsSync(store.path)).toBe(false);
    // Somebody opens the address.
    expect((await fetch(address)).status).toBe(200);
    expect(await running.result).toBe(0);
    expect(store.entry(stub.url)?.user.name).toBe("Ana");
    expect(new URL(address).searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("says so and goes on when the browser cannot be opened", async () => {
    const { env } = home();
    let url = "";
    const running = start(["login"], env, {
      hooks: {
        openBrowser: (address) => {
          url = address;
          return Promise.reject(new Error("no xdg-open"));
        },
      },
    });
    await waitFor(() => (running.out().includes("could not be opened") ? true : undefined));
    expect((await fetch(url)).status).toBe(200);
    expect(await running.result).toBe(0);
    // The address was printed before it was tried, so the person has it.
    expect(running.out()).toContain(url);
  });

  it("fails with exit code 1 and stores nothing when the state is another", async () => {
    const { env, store } = home();
    stub.approval = "other-state";
    const visit = browser();
    const result = await mdg(["login"], env, { hooks: { openBrowser: visit.open } });
    await visit.settled();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("login.state-mismatch");
    expect(stub.exchanges).toBe(0);
    expect(stub.refusedExchanges).toBe(0);
    expect(stub.to("/cli-auth/token")).toHaveLength(0);
    expect(stub.to("/api/session")).toHaveLength(0);
    expect(existsSync(store.path)).toBe(false);
    expect(result.stdout).not.toContain("Signed in");
    // The browser is told it did not finish, and nobody listens any more.
    expect(visit.landed[0]!.status).toBe(400);
    expect(visit.landed[0]!.body).toContain("Signing in did not finish");
    const port = new URL(visit.opened[0]!).searchParams.get("port");
    expect(await refused(`http://127.0.0.1:${port}/`)).toBe("refused");
  });

  it("fails with exit code 1 and stores nothing when the exchange says cli.invalid", async () => {
    const { env, store } = home();
    stub.fail("POST /cli-auth/token", {
      status: 400,
      body: { code: "cli.invalid", message: "The request cannot be used." },
    });
    const visit = browser();
    const result = await mdg(["login"], env, { hooks: { openBrowser: visit.open } });
    await visit.settled();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "meltemi-diagrams login: cli.invalid: the service refused the one-time code",
    );
    expect(existsSync(store.path)).toBe(false);
    expect(stub.to("/api/session")).toHaveLength(0);
    expect(visit.landed[0]!.status).toBe(400);
    expect(visit.landed[0]!.body).toContain("did not finish");
  });

  it("tells a person with 20 tokens to revoke one, and a caller rate-limited to wait", async () => {
    const { env, store } = home();
    stub.fail("POST /cli-auth/token", {
      status: 413,
      body: { code: "quota.tokens", message: "Too many tokens." },
    });
    const first = browser();
    const full = await mdg(["login"], env, { hooks: { openBrowser: first.open } });
    await first.settled();
    expect(full.code).toBe(1);
    expect(full.stderr).toContain("quota.tokens: this account already holds 20 API tokens");
    stub.fail("POST /cli-auth/token", {
      status: 429,
      body: { code: "cli.rate", message: "Slow down." },
      headers: { "Retry-After": "60" },
    });
    const second = browser();
    const limited = await mdg(["login"], env, { hooks: { openBrowser: second.open } });
    await second.settled();
    expect(limited.code).toBe(1);
    expect(limited.stderr).toContain("wait 60 seconds");
    expect(existsSync(store.path)).toBe(false);
  });

  it("gives up after the time allowed, with exit code 1 and nothing stored", async () => {
    const { env, store } = home();
    stub.approval = "none";
    const visit = browser();
    const result = await mdg(["login"], env, {
      hooks: { openBrowser: visit.open, loginTimeoutMs: 80 },
    });
    await visit.settled();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("login.timeout: no approval arrived within 5 minutes");
    expect(existsSync(store.path)).toBe(false);
    expect(stub.exchanges).toBe(0);
    const port = new URL(visit.opened[0]!).searchParams.get("port");
    expect(await refused(`http://127.0.0.1:${port}/`)).toBe("refused");
  });

  it("revokes the token again when it cannot be kept, and says the page did not finish", async () => {
    const { env, store } = home();
    const known = new Set(stub.tokens.keys());
    const visit = browser({
      // After the folder was made and before the token is kept: something is in the way.
      beforeRedirect: () => mkdirSync(store.path, { recursive: true }),
    });
    const result = await mdg(["login"], env, { hooks: { openBrowser: visit.open } });
    await visit.settled();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("login.not-stored: the token could not be kept");
    expect(result.stderr).toContain("so it was revoked");
    // The token the exchange made is gone again.
    expect([...stub.tokens.keys()].filter((token) => !known.has(token))).toEqual([]);
    expect(stub.exchanges).toBeGreaterThan(0);
    expect(visit.landed[0]!.status).toBe(400);
  });

  it("keeps the entries of other hosts", async () => {
    const { env, store } = home();
    const other = { token: "mdg_other0123456789", id: "o1", user: { sub: "u_9", name: "Bo" } };
    store.save("https://elsewhere.example", other);
    const visit = browser();
    expect((await mdg(["login"], env, { hooks: { openBrowser: visit.open } })).code).toBe(0);
    await visit.settled();
    expect(store.entry("https://elsewhere.example")).toEqual(other);
    expect(store.entry(stub.url)?.user.name).toBe("Ana");
  });

  it("goes to the host of --host, which wins over MELTEMI_HOST", async () => {
    const { env, store } = home({ MELTEMI_HOST: "https://not-this.example" });
    const visit = browser();
    const result = await mdg(["login", "--host", `${stub.url}/`], env, {
      hooks: { openBrowser: visit.open },
    });
    await visit.settled();
    expect(result.code).toBe(0);
    expect(store.hosts()).toEqual([stub.url]);
    expect(result.stdout).toContain(`Signed in as Ana (${stub.url})`);
  });
});

describe("mdg login --token", () => {
  it("reads the token from standard input and learns its id and owner from the session", async () => {
    const { env, store } = home();
    const { token, id } = stub.mint("laptop");
    const result = await mdg(["login", "--token"], env, { stdin: `${token}\n` });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Signed in as Ana");
    expect(store.entry(stub.url)).toEqual({ token, id, user: { sub: "u_7d3f", name: "Ana" } });
    // Only the session was asked: no listener, no approval, no exchange.
    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /api/session"]);
    expect(stub.requests[0]!.headers.authorization).toBe(`Bearer ${token}`);
    expect(result.stdout + result.stderr).not.toContain(token);
  });

  it("reads a token that a shell sent with a byte order mark and a CRLF", async () => {
    const { env, store } = home();
    const { token } = stub.mint("laptop");
    const result = await mdg(["login", "--token"], env, {
      stdin: `${String.fromCharCode(0xfeff)}${token}\r\n`,
    });
    expect(result.code, result.stderr).toBe(0);
    expect(store.entry(stub.url)?.token).toBe(token);
  });

  it("never takes the token from an argument", async () => {
    const { env, store } = home();
    const { token } = stub.mint();
    const result = await mdg(["login", "--token", token], env, { stdin: token });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("login takes no arguments");
    expect(result.stderr).toContain("Usage: login");
    expect(stub.requests).toHaveLength(0);
    expect(existsSync(store.path)).toBe(false);
  });

  it("is refused with exit code 3 when the service does not know the token", async () => {
    const { env, store } = home();
    const result = await mdg(["login", "--token"], env, { stdin: "mdg_NotAKnownToken0123\n" });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("token.invalid");
    expect(result.stderr).toContain('run "meltemi-diagrams login"');
    expect(existsSync(store.path)).toBe(false);
  });

  it("explains an input that is no token, without asking the service", async () => {
    const { env, store } = home();
    for (const [stdin, code] of [
      ["", "login.no-token"],
      ["  \n", "login.no-token"],
      ["hello", "login.not-a-token"],
      ["mdg_two words", "login.not-a-token"],
      ["mdg_", "login.not-a-token"],
      ["sk-ant-0123456789", "login.not-a-token"],
    ] as const) {
      const result = await mdg(["login", "--token"], env, { stdin });
      expect(result.code, stdin).toBe(1);
      expect(result.stderr, stdin).toContain(code);
    }
    const noInput = await mdg(["login", "--token"], env);
    expect(noInput.code).toBe(2);
    expect(noInput.stderr).toContain("login.token-input");
    expect(stub.requests).toHaveLength(0);
    expect(existsSync(store.path)).toBe(false);
  });
});

describe("mdg login and the environment", () => {
  it("explains and does nothing when MELTEMI_TOKEN is set, before any request or browser", async () => {
    const { env, store } = home({ MELTEMI_TOKEN: "mdg_fromtheenvironment" });
    let opened = false;
    for (const args of [["login"], ["login", "--token"], ["login", "--no-browser"]]) {
      const result = await mdg(args, env, {
        stdin: "mdg_other",
        hooks: {
          openBrowser: () => {
            opened = true;
          },
        },
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("login.environment-token: MELTEMI_TOKEN is set");
      expect(result.stderr).not.toContain("mdg_fromtheenvironment");
    }
    expect(opened).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(existsSync(store.path)).toBe(false);
    // Help is still help.
    const help = await mdg(["login", "--help"], env);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: login");
  });

  it("reports a credentials file that is not credentials before opening a browser, and leaves it", async () => {
    const { env, store } = home();
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(store.path, "{ not json");
    let opened = false;
    const result = await mdg(["login"], env, {
      hooks: {
        openBrowser: () => {
          opened = true;
        },
      },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("credentials.corrupt");
    expect(result.stderr).toContain(store.path);
    expect(opened).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(readFileSync(store.path, "utf8")).toBe("{ not json");
  });

  it("reports a configuration folder it cannot make before opening a browser", async () => {
    const { env, root } = home();
    writeFileSync(join(root, "AppData"), "in the way");
    writeFileSync(join(root, "config"), "in the way");
    const result = await mdg(["login"], env, { hooks: { openBrowser: () => undefined } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("credentials.unwritable");
    expect(stub.requests).toHaveLength(0);
  });

  it("refuses plain http to a host that is not this machine, naming it, before anything happens", async () => {
    const { env, store } = home({ MELTEMI_HOST: "" });
    let fetched = false;
    let opened = false;
    const result = await mdg(["login", "--host", "http://diagrams.example"], env, {
      hooks: {
        fetch: () => {
          fetched = true;
          return Promise.reject(new Error("must not be called"));
        },
        openBrowser: () => {
          opened = true;
        },
      },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cloud.insecure-host");
    expect(result.stderr).toContain("http://diagrams.example");
    expect(fetched || opened).toBe(false);
    expect(existsSync(store.path)).toBe(false);
  });

  it("puts a usage error with the usage of the command, in either language", async () => {
    const { env } = home();
    const unknown = await mdg(["login", "--sync"], env);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("meltemi-diagrams login:");
    expect(unknown.stderr).toContain("Usage: login [options]");
    const extra = await mdg(["login", "extra"], env);
    expect(extra.code).toBe(2);
    const spanish = await mdg(["login", "--sync", "--lang", "es"], env);
    expect(spanish.code).toBe(2);
    expect(spanish.stderr).toContain("Uso: login [opciones]");
    const help = await mdg(["login", "--help", "--lang", "es"], env);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Uso: login [opciones]");
    expect(stub.requests).toHaveLength(0);
  });

  it("is listed by --help beside logout and whoami, in both languages", async () => {
    const { env } = home();
    const english = await mdg(["--help"], env);
    expect(english.stdout).toMatch(/^ {2}login {2,}Sign in to the cloud service/m);
    expect(english.stdout).toMatch(/^ {2}logout {2,}Revoke the stored cloud token/m);
    expect(english.stdout).toMatch(/^ {2}whoami {2,}Print the name and handle/m);
    expect(english.stdout).toContain("Options for login:");
    const spanish = await mdg(["--help", "--lang", "es"], env);
    expect(spanish.stdout).toMatch(/^ {2}login {2,}Iniciar sesión en el servicio de la nube/m);
    expect(spanish.stdout).toMatch(/^ {2}logout {2,}Revocar el token/m);
    expect(spanish.stdout).toMatch(/^ {2}whoami {2,}Imprimir el nombre/m);
    expect(spanish.stdout).toContain("Opciones de login:");
  });
});

/** Waits until a function gives something, up to five seconds. */
async function waitFor<T>(find: () => T | undefined): Promise<T> {
  const until = Date.now() + 5000;
  for (;;) {
    const found = find();
    if (found !== undefined) return found;
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
