/**
 * The Worker under test, as `wrangler dev` runs it: a configuration written for the suite in a
 * temporary folder (a copy of `wrangler.jsonc` with absolute paths and the local identity service as
 * issuer, a `.dev.vars` that holds `DEV` and an inline key set, and a copy of the page's build, which
 * is what the Worker serves, so that a build made meanwhile by another program changes nothing for
 * this run), a local D1 with the migrations
 * applied, and `wrangler dev` started on a free port as a child process whose whole tree is ended
 * when the suite ends, however it ends. Nothing is written to `packages/cloud`, and
 * `wrangler.jsonc` never gains `DEV` or `IDENTITY_JWKS`.
 *
 * Wrangler is started with this program's own Node and its script, never through the `.cmd` shim or
 * a shell, so the process whose tree is killed is the one that holds the Worker.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { testJwks, testKeys, type TestKeys } from "@meltemi/identity/testing";

/** `packages/cloud`. */
export const CLOUD = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The site the Worker serves: the playground's build. */
export const SITE = resolve(CLOUD, "..", "playground", "dist");

/**
 * The identity service of the family on a laptop (`pnpm identity:dev` in Meltemi Web). The suite
 * does not run it: the session cookies are minted with test keys, and `identity.ts` stands in for
 * the one question the Worker asks it.
 */
export const IDENTITY = "http://localhost:8787";
export const IDENTITY_PORT = 8787;

/** How long wrangler may take to answer its first request, bundling and starting workerd included. */
const START_TIMEOUT_MS = 120_000;
/** The last bytes kept of the output of a program that failed: its error and what led to it. */
const KEPT_OUTPUT = 200_000;
/**
 * The last bytes kept of the Worker's own log. The suite reads it all at the end, to see that the Worker
 * printed nothing but its request lines, and a run answers tens of thousands of them (each file of the
 * page, each call, each socket): a log cut short would start in the middle of a line.
 */
const KEPT_WORKER_LOG = 32_000_000;

// ---------------------------------------------------------------------------------------------
// Child processes: ended with their whole tree, on every way out

const children = new Set<ChildProcess>();

/** Ends a process and everything it started. Synchronous, so it also works when the program is leaving. */
function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // `taskkill` is a program, not a shell: no command line is interpreted.
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    // The child leads its own process group (`detached`), so the group is the tree.
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/** The temporary folders of the Worker, removed when the program leaves if nothing else has. */
const folders = new Set<string>();

function removeFolder(folder: string): void {
  folders.delete(folder);
  try {
    // Windows releases the files of workerd a moment after it ends.
    rmSync(folder, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
  } catch (error) {
    console.warn(`Could not remove ${folder}: ${(error as Error).message}`);
  }
}

/** Everything that must not outlive the program: the processes first, then the folders they used. */
function leave(): void {
  for (const child of children) killTree(child);
  for (const folder of [...folders]) removeFolder(folder);
}

/** A folder this suite made: `mkdtemp` adds six characters to the prefix. */
const OWN_FOLDER = /^mdg-cloud-[A-Za-z0-9]{6}$/;

/**
 * Removes the folders of earlier runs that were killed before they could clean up. A run lasts
 * minutes, so a folder older than an hour belongs to none that is going on.
 */
function sweepStaleFolders(): void {
  const old = Date.now() - 60 * 60 * 1000;
  try {
    for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
      if (!entry.isDirectory() || !OWN_FOLDER.test(entry.name)) continue;
      const folder = join(tmpdir(), entry.name);
      if (statSync(folder).mtimeMs < old) removeFolder(folder);
    }
  } catch {
    // A folder that cannot be listed or read is nobody's business here.
  }
}

let guarded = false;

/** Ends the children when the program exits or is interrupted (Ctrl+C), once per program. */
function guardExits(): void {
  if (guarded) return;
  guarded = true;
  process.on("exit", leave);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
    process.on(signal, () => {
      leave();
      process.exit(130);
    });
  }
}

/** Ends a child with its tree and waits (a few seconds at most) until it is gone. */
function end(child: ChildProcess): Promise<void> {
  killTree(child);
  children.delete(child);
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(done, 10_000);
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
  });
}

/** A program run to its end: its output when it succeeds, an error holding that output when it does not. */
export async function runToEnd(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; shell?: boolean },
): Promise<string> {
  guardExits();
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: options.shell ?? false,
    detached: process.platform !== "win32",
  });
  children.add(child);
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  try {
    const code = await new Promise<number | null>((done, fail) => {
      child.once("error", fail);
      child.once("close", done);
    });
    if (code !== 0) {
      throw new Error(`${command} ${args.join(" ")} ended with ${code}:\n${tail(output)}`);
    }
    return output;
  } finally {
    killTree(child);
    children.delete(child);
  }
}

function tail(text: string, bytes = KEPT_OUTPUT): string {
  return text.length > bytes ? `…${text.slice(text.length - bytes)}` : text;
}

// ---------------------------------------------------------------------------------------------
// Ports

/** A port nothing is listening on, on any interface. */
export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

// ---------------------------------------------------------------------------------------------
// The configuration

/**
 * JSON with comments and trailing commas, as `wrangler.jsonc` is written; a comma before a closing
 * bracket and a comment are dropped outside strings only.
 */
export function parseJsonc(text: string): Record<string, unknown> {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === ",") {
      // A comma before a closing bracket is dropped, and the comments between them do not hide it.
      let j = i + 1;
      for (;;) {
        while (j < text.length && /\s/.test(text[j]!)) j++;
        if (text[j] === "/" && text[j + 1] === "/") {
          while (j < text.length && text[j] !== "\n") j++;
        } else if (text[j] === "/" && text[j + 1] === "*") {
          const end = text.indexOf("*/", j + 2);
          j = end < 0 ? text.length : end + 2;
        } else break;
      }
      if (text[j] !== "}" && text[j] !== "]") out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out) as Record<string, unknown>;
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`wrangler.jsonc: ${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * The test configuration: `wrangler.jsonc` as it is, with `main`, the assets' directory and the
 * migrations' directory made absolute (the file is not next to them any more), its own name, no
 * development port (the suite picks one) and the local identity service as issuer. `DEV` and the
 * key set are not here: they belong to `.dev.vars`. `site` is the folder the assets are served from
 * (the suite gives a copy of the build, so that another program that builds the page meanwhile does
 * not change what this run serves nor make wrangler reload the Worker); the build's own folder when
 * it is not given.
 */
export function testConfig(
  deployed: Record<string, unknown>,
  site?: string,
): Record<string, unknown> {
  const assets = record(deployed["assets"], "assets");
  const databases = deployed["d1_databases"];
  if (!Array.isArray(databases) || databases.length === 0) {
    throw new Error("wrangler.jsonc: d1_databases is not a list");
  }
  const { dev: _dev, $schema: _schema, ...rest } = deployed;
  // The workspace packages the Worker is built from sources of: their paths are relative to the
  // configuration file, which is not next to them any more.
  const alias =
    deployed["alias"] === undefined
      ? {}
      : {
          alias: Object.fromEntries(
            Object.entries(record(deployed["alias"], "alias")).map(([name, path]) => [
              name,
              resolve(CLOUD, String(path)),
            ]),
          ),
        };
  const config: Record<string, unknown> = {
    ...rest,
    ...alias,
    name: "meltemi-diagrams-cloud-test",
    main: resolve(CLOUD, String(deployed["main"])),
    assets: { ...assets, directory: site ?? resolve(CLOUD, String(assets["directory"])) },
    d1_databases: databases.map((entry) => {
      const database = record(entry, "a d1 database");
      return {
        ...database,
        migrations_dir: resolve(CLOUD, String(database["migrations_dir"] ?? "migrations")),
      };
    }),
    vars: {
      ...record(deployed["vars"], "vars"),
      IDENTITY_ISSUER: IDENTITY,
      IDENTITY_JWKS_URL: `${IDENTITY}/.well-known/jwks.json`,
    },
  };
  for (const key of ["DEV", "IDENTITY_JWKS"]) {
    if (key in (config["vars"] as Record<string, unknown>)) {
      throw new Error(`The test configuration must not define ${key} in its vars.`);
    }
  }
  return config;
}

/** One line of a `.dev.vars` file; the value is quoted so that nothing in it is read as syntax. */
function devVar(name: string, value: string): string {
  if (/['\r\n]/.test(value)) throw new Error(`${name} cannot be written to .dev.vars`);
  return `${name}='${value}'`;
}

/** A secret made up for one run: nothing real is ever written to the test configuration. */
const madeUpSecret = (): string => randomBytes(24).toString("base64url");

/**
 * The one administrator of the run: the `sub` `ADMIN_SUBS` lists, so that a scenario can take a
 * publication down (nobody else can, and a run that did not list one could not test the route).
 */
export const ADMIN_SUB = "u-admin-suite";

/** The development values: `DEV`, the identity settings, two secrets, the inline key set and the administrator. */
export function devVars(keys: TestKeys, eventsSecret: string): string {
  return [
    devVar("DEV", "true"),
    devVar("IDENTITY_ISSUER", IDENTITY),
    devVar("IDENTITY_JWKS_URL", `${IDENTITY}/.well-known/jwks.json`),
    devVar("IDENTITY_EVENTS_SECRET", eventsSecret),
    devVar("FORMS_SECRET", madeUpSecret()),
    devVar("IDENTITY_JWKS", JSON.stringify(testJwks(keys))),
    devVar("ADMIN_SUBS", ADMIN_SUB),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// The running Worker

export interface RunningWorker {
  /** `http://localhost:<port>`: the Worker's own origin, where the page and its API are. */
  readonly origin: string;
  /** The keys the Worker accepts sessions from: the suite signs its cookies with them. */
  readonly keys: TestKeys;
  /** The secret the Worker verifies the identity service's events with: the suite signs one. */
  readonly eventsSecret: string;
  /** The copy of the page's build this Worker serves its assets from (in the temporary folder). */
  readonly site: string;
  /** What wrangler printed last (for the report of a failure). */
  output(): string;
  /** Ends wrangler and everything it started, and removes the temporary folder. */
  stop(): Promise<void>;
}

/** The program of wrangler: its Node script, so the process we hold is the one that runs the Worker. */
function wranglerScript(): string {
  const script = join(CLOUD, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(script)) {
    throw new Error(`wrangler is not installed (${script} is missing): run pnpm install.`);
  }
  return script;
}

/**
 * Whether the Worker answers at `origin`: an anonymous request for the session gets the Worker's
 * own JSON (with the way to sign in), not the static file of the same path (`{"user":null}`).
 */
async function answers(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(5_000) });
    if (response.status !== 200) return false;
    const body = (await response.json()) as { user?: unknown; signIn?: unknown };
    return body.user === null && typeof body.signIn === "string";
  } catch {
    return false;
  }
}

/** The ways a start of `wrangler dev` ends without a Worker: the port was taken, or something else. */
class StartFailed extends Error {
  constructor(
    message: string,
    readonly portTaken: boolean,
  ) {
    super(message);
  }
}

/** How many times the Worker is started when its port is taken between choosing it and binding it. */
const START_ATTEMPTS = 3;

/**
 * Starts the Worker: a temporary folder with the configuration and `.dev.vars`, the migrations
 * applied to a local D1 kept in that folder, and `wrangler dev` on a free port. Resolves when the
 * Worker answers; rejects, after cleaning up, when it does not.
 */
export async function startWorker(): Promise<RunningWorker> {
  guardExits();
  const script = wranglerScript();
  const deployed = parseJsonc(readFileSync(join(CLOUD, "wrangler.jsonc"), "utf8"));
  const keys = await testKeys();
  const eventsSecret = madeUpSecret();

  sweepStaleFolders();
  const folder = mkdtempSync(join(tmpdir(), "mdg-cloud-"));
  folders.add(folder);
  const state = join(folder, "state");
  mkdirSync(state);
  // The build, copied: a build another session makes meanwhile (the playground's own suite, say)
  // rewrites `SITE`, which would make wrangler reload the Worker in the middle of a scenario.
  const site = join(folder, "site");
  cpSync(SITE, site, { recursive: true });
  const config = join(folder, "wrangler.test.jsonc");
  writeFileSync(config, `${JSON.stringify(testConfig(deployed, site), null, 2)}\n`);
  writeFileSync(join(folder, ".dev.vars"), devVars(keys, eventsSecret));

  const env: NodeJS.ProcessEnv = { ...process.env };
  // Whatever Cloudflare credentials the person has are not for a Worker that runs on this laptop.
  for (const name of Object.keys(env)) if (/^(CLOUDFLARE|CF)_/.test(name)) delete env[name];
  Object.assign(env, {
    // Nothing is sent anywhere and nothing is asked of the network: no metrics or error reports,
    // no check for a new wrangler (it belongs to the banner), no download of the `request.cf` object.
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_SEND_ERROR_REPORTS: "false",
    WRANGLER_HIDE_BANNER: "true",
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    // Its logs and the registry of its running Workers stay in the temporary folder, not the home.
    WRANGLER_LOG_PATH: join(folder, "logs"),
    WRANGLER_REGISTRY_PATH: join(folder, "registry"),
    // Nothing is coloured and nothing asks a question.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    CI: "1",
  });
  const common = ["--config", config, "--persist-to", state];

  let log = "";
  let running: ChildProcess | undefined;
  const stop = async (): Promise<void> => {
    const child = running;
    running = undefined;
    if (child) await end(child);
    removeFolder(folder);
  };

  /** `wrangler dev` on these ports, until the Worker answers at the first of them. */
  const launch = async (port: number, inspectorPort: number): Promise<RunningWorker> => {
    const origin = `http://localhost:${port}`;
    const child = spawn(
      process.execPath,
      [script, "dev", ...common, "--port", String(port), "--inspector-port", String(inspectorPort)],
      {
        cwd: folder,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      },
    );
    children.add(child);
    log = "";
    const keep = (chunk: Buffer) => {
      log = tail(log + chunk.toString("utf8"), KEPT_WORKER_LOG);
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    let exit: string | undefined;
    child.once("exit", (code, signal) => (exit = `exit code ${code}, signal ${signal}`));
    child.once("error", (error) => (exit = `error: ${error.message}`));

    try {
      const deadline = Date.now() + START_TIMEOUT_MS;
      for (;;) {
        if (exit !== undefined) {
          const taken = /EADDRINUSE|address already in use|already in use/i.test(log);
          throw new StartFailed(`wrangler dev ended before it answered (${exit}):\n${log}`, taken);
        }
        if (await answers(origin)) break;
        if (Date.now() > deadline) {
          const seconds = START_TIMEOUT_MS / 1000;
          throw new StartFailed(`wrangler dev did not answer within ${seconds} s:\n${log}`, false);
        }
        await new Promise((done) => setTimeout(done, 200));
      }
    } catch (error) {
      await end(child);
      throw error;
    }
    running = child;
    return { origin, keys, eventsSecret, site, output: () => log, stop };
  };

  try {
    await runToEnd(
      process.execPath,
      [script, "d1", "migrations", "apply", "DB", "--local", ...common],
      { cwd: folder, env },
    );
    for (let attempt = 1; ; attempt++) {
      try {
        return await launch(await freePort(), await freePort());
      } catch (error) {
        // A port taken in the moments between choosing it and binding it is worth another try.
        if (!(error instanceof StartFailed) || !error.portTaken || attempt >= START_ATTEMPTS) {
          throw error;
        }
      }
    }
  } catch (error) {
    await stop();
    throw error;
  }
}
