// The local servers of `pnpm acceptance:mcp --local` (change `local-mcp-server`, `mcp-acceptance`,
// "The suite through the local server"): one `mdg mcp` process of the built command line for each
// test account, on a free loopback port, with that account's token in its own environment only, the
// target's origin as its host and an empty configuration folder, so that no credentials file is
// read. The suite's agents connect to the addresses they print, with no bearer. Their standard error
// (a line a call) goes to a file the run scans like the Worker's log.

import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What the run's agents connect to, and how the run ends them. */
export interface LocalServers {
  readonly first?: string;
  readonly second?: string;
  /** The file the processes' standard error goes to. */
  readonly log: string;
  stop(): Promise<void>;
}

/** The first line `mdg mcp` prints: its address. */
const ADDRESS = /^http:\/\/127\.0\.0\.1:\d+\/mcp$/;

/** How long a process may take to listen: its first answer loads nothing heavy. */
const START_MS = 60_000;

/** The environment of a process: this one's, without any token or key of the run, then its own. */
function environment(origin: string, token: string, home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["MELTEMI_TOKEN", "MELTEMI_TOKEN_2", "MELTEMI_MCP_KEY", "MELTEMI_HOST"]) {
    delete env[name];
  }
  return {
    ...env,
    MELTEMI_HOST: origin,
    MELTEMI_TOKEN: token,
    MELTEMI_LANG: "en",
    APPDATA: home,
    XDG_CONFIG_HOME: home,
    HOME: home,
    USERPROFILE: home,
  };
}

/** Starts one server and answers its address, or rejects with why it did not listen. */
function startOne(
  bin: string,
  origin: string,
  token: string,
  log: string,
  children: ChildProcess[],
): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), "mdg-mcp-acceptance-"));
  const child = spawn(process.execPath, [bin, "mcp", "--port", "0"], {
    env: environment(origin, token, home),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push(child);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => appendFileSync(log, chunk));
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(
      () => reject(new Error(`mdg mcp did not listen within ${START_MS / 1000} s`)),
      START_MS,
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      const line = out.split(/\r?\n/)[0]!;
      if (out.includes("\n") && ADDRESS.test(line.trim())) {
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`mdg mcp exited with code ${code} before it listened`));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Starts a local server for each token given. Throws, naming the command, when the built command
 * line is missing, before anything is started.
 */
export async function startLocalServers(options: {
  readonly bin: string;
  readonly origin: string;
  readonly tokens: { readonly first?: string | undefined; readonly second?: string | undefined };
  readonly log: string;
}): Promise<LocalServers> {
  if (!existsSync(options.bin)) {
    throw new Error(
      `--local runs the built command line, ${options.bin}, which is missing: run pnpm --filter "@meltemi/diagrams-cli..." build first`,
    );
  }
  writeFileSync(options.log, "");
  const children: ChildProcess[] = [];
  const stop = async () => {
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((done) => {
            if (child.exitCode !== null || child.signalCode !== null) return done();
            child.once("exit", () => done());
            child.kill("SIGTERM");
          }),
      ),
    );
  };
  try {
    const [first, second] = await Promise.all(
      [options.tokens.first, options.tokens.second].map((token) =>
        token === undefined
          ? Promise.resolve(undefined)
          : startOne(options.bin, options.origin, token, options.log, children),
      ),
    );
    return {
      ...(first !== undefined ? { first } : {}),
      ...(second !== undefined ? { second } : {}),
      log: options.log,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
