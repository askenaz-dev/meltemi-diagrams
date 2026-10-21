/**
 * The real command line as a program, for `scenarios-cli.ts`: `mdg` run from its sources (the root
 * script `pnpm mdg` is `tsx --conditions=@meltemi/diagrams-source packages/cli/src/bin.ts`, which here
 * is this program's Node with the tsx loader, the same condition and the same entry) with an
 * arguments array and no shell, so that nothing a path or a name holds is read as syntax.
 *
 * Each `Cli` is a person's computer: a temporary folder that holds the home, the configuration
 * folders (`HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`) and a working folder,
 * and an environment with `MELTEMI_HOST` pointing at the Worker and no `MELTEMI_TOKEN` (nor anything
 * else of Meltemi's or Cloudflare's), in English whatever the machine speaks. Every command is given
 * about a minute; one that takes longer is ended with its whole tree. Whatever a command printed is
 * kept, to look for tokens in it at the end. The processes are ended and the folder removed when the
 * scenario leaves, and the processes also when the suite does, however it ends.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CLOUD } from "./worker.js";

/** What a command is given to finish, login's wait for the browser included. */
export const COMMAND_TIMEOUT_MS = 60_000;

/** The repository, the command line's entry and the loader that runs TypeScript. */
const REPOSITORY = resolve(CLOUD, "..", "..");
const ENTRY = join(REPOSITORY, "packages", "cli", "src", "bin.ts");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

/** The text a token has, as a pattern: `mdg_` and at least one base64url character. */
export const TOKEN_LIKE = /mdg_[A-Za-z0-9_-]+/g;

// ---------------------------------------------------------------------------------------------
// Processes: ended with their whole tree

const running = new Set<ChildProcess>();

/** Ends a process and everything it started. Synchronous, so it also works as the program leaves. */
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

let guarded = false;

/** Ends what is still running when the program exits (the suite's own handlers end it on a signal). */
function guardExits(): void {
  if (guarded) return;
  guarded = true;
  process.on("exit", () => {
    for (const child of running) killTree(child);
  });
}

// ---------------------------------------------------------------------------------------------
// A command

/** How a command ended, and all it printed. */
export interface Finished {
  /** The arguments, as they were given. */
  readonly args: readonly string[];
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Ended by this program because it did not finish in time. */
  readonly timedOut: boolean;
}

/** A command as a message: its line, how it ended (or that it still runs) and what it printed. */
export function describe(done: Finished, running = false): string {
  const how = running
    ? "is still running"
    : done.timedOut
      ? "did not finish in time"
      : `ended with ${done.code ?? "a signal"}`;
  return `mdg ${done.args.join(" ")} ${how}\n--- stdout\n${done.stdout}\n--- stderr\n${done.stderr}`;
}

/** A command that has started: what it printed so far, what it waits for and how it ended. */
export class Command {
  stdout = "";
  stderr = "";
  /** Resolves, never rejects, when the command has ended (or been ended after its time). */
  readonly finished: Promise<Finished>;
  private readonly watchers = new Set<() => void>();
  private ended: Finished | undefined;

  constructor(
    readonly args: readonly string[],
    private readonly child: ChildProcess,
    keep: (done: Finished) => void,
    timeoutMs: number,
  ) {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.stdout?.setEncoding("utf8").on("data", (text: string) => this.heard("stdout", text));
    child.stderr?.setEncoding("utf8").on("data", (text: string) => this.heard("stderr", text));
    this.finished = new Promise<Finished>((done) => {
      const end = (code: number | null, error?: string) => {
        clearTimeout(timer);
        running.delete(child);
        if (error !== undefined) this.stderr += `\n(could not run: ${error})`;
        const result: Finished = {
          args,
          code,
          stdout: this.stdout,
          stderr: this.stderr,
          timedOut,
        };
        this.ended = result;
        keep(result);
        for (const watcher of [...this.watchers]) watcher();
        done(result);
      };
      child.once("error", (error) => end(null, error.message));
      child.once("close", (code) => end(code));
    });
  }

  private heard(stream: "stdout" | "stderr", text: string): void {
    this[stream] += text;
    for (const watcher of [...this.watchers]) watcher();
  }

  /**
   * Waits until what the command printed holds a match for `pattern`, and answers it. Fails, with
   * all that was printed, when the command ends first or nothing matches in time.
   */
  waitFor(pattern: RegExp, what: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<RegExpExecArray> {
    return new Promise((done, fail) => {
      const timer = setTimeout(() => {
        this.watchers.delete(look);
        fail(new Error(`Timed out waiting for ${what}.\n${this.report()}`));
      }, timeoutMs);
      const look = (): void => {
        const found = pattern.exec(this.stdout);
        if (found === null && this.ended === undefined) return;
        clearTimeout(timer);
        this.watchers.delete(look);
        if (found !== null) done(found);
        else fail(new Error(`The command ended without ${what}.\n${this.report()}`));
      };
      this.watchers.add(look);
      look();
    });
  }

  /** What the command has printed so far, for a failure message. */
  report(): string {
    return describe(
      {
        args: this.args,
        code: this.ended?.code ?? null,
        stdout: this.stdout,
        stderr: this.stderr,
        timedOut: this.ended?.timedOut ?? false,
      },
      this.ended === undefined,
    );
  }

  /** Ends the command with its tree, if it is still running. */
  kill(): void {
    killTree(this.child);
  }
}

// ---------------------------------------------------------------------------------------------
// A person's computer

/** The folders of earlier runs that were killed before they could clean up are older than this. */
const STALE_MS = 60 * 60 * 1000;
const PREFIX = "mdg-cloud-cli-";

function sweepStaleFolders(): void {
  try {
    for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(PREFIX)) continue;
      const folder = join(tmpdir(), entry.name);
      if (statSync(folder).mtimeMs < Date.now() - STALE_MS) removeFolder(folder);
    }
  } catch {
    // A folder that cannot be listed or read is nobody's business here.
  }
}

function removeFolder(folder: string): void {
  try {
    // Windows lets go of the files of a process that has just ended a moment later.
    rmSync(folder, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
  } catch (error) {
    console.warn(`Could not remove ${folder}: ${(error as Error).message}`);
  }
}

/** Sets a variable, replacing the one of the same name in any letter case (Windows has no cases). */
function setVariable(env: Record<string, string>, name: string, value: string): void {
  for (const existing of Object.keys(env)) {
    if (existing.toLowerCase() === name.toLowerCase()) delete env[existing];
  }
  env[name] = value;
}

/** A computer with the command line on it, signed in to nothing, that talks to one service. */
export class Cli {
  /** The temporary folder that holds the home and the working folder. */
  readonly root: string;
  /** Where commands run, and where a scenario makes its folders. */
  readonly work: string;
  /** The environment of every command. */
  readonly env: Readonly<Record<string, string>>;
  /** What every finished command printed, in order of ending. */
  readonly finishedCommands: Finished[] = [];
  private readonly started = new Set<Command>();

  private constructor(root: string, host: string) {
    this.root = root;
    this.work = join(root, "work");
    mkdirSync(this.work);
    const env: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      // Nothing of the person's own Meltemi or Cloudflare sign-in, language or colours is used.
      if (/^(MELTEMI_|CLOUDFLARE_|CF_|LC_|LANG$|NO_COLOR$|FORCE_COLOR$)/i.test(name)) continue;
      env[name] = value;
    }
    const home = join(root, "home");
    const variables: [string, string][] = [
      ["HOME", home],
      ["USERPROFILE", home],
      ["APPDATA", join(home, "AppData", "Roaming")],
      ["LOCALAPPDATA", join(home, "AppData", "Local")],
      ["XDG_CONFIG_HOME", join(home, ".config")],
      ["MELTEMI_HOST", host],
      ["MELTEMI_LANG", "en"],
      ["NO_COLOR", "1"],
    ];
    for (const [name, value] of variables) setVariable(env, name, value);
    this.env = env;
  }

  /** A computer whose commands talk to `host` (the Worker's origin). */
  static create(host: string): Cli {
    guardExits();
    sweepStaleFolders();
    return new Cli(mkdtempSync(join(tmpdir(), PREFIX)), host);
  }

  /** The credentials file the command line keeps, where the platform has it (see `credentials.ts`). */
  get credentialsFile(): string {
    const folder =
      process.platform === "win32" ? this.env["APPDATA"]! : this.env["XDG_CONFIG_HOME"]!;
    return join(folder, "meltemi-diagrams", "credentials.json");
  }

  /** Starts a command; it runs in `cwd` (the working folder by default). */
  start(
    args: readonly string[],
    options: { readonly cwd?: string; readonly timeoutMs?: number } = {},
  ): Command {
    const child = spawn(
      process.execPath,
      ["--import", TSX, "--conditions=@meltemi/diagrams-source", ENTRY, ...args],
      {
        cwd: options.cwd ?? this.work,
        env: this.env,
        // Nobody types: standard input is closed, so a command that would ask refuses instead.
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      },
    );
    running.add(child);
    const command = new Command(
      args,
      child,
      (done) => this.finishedCommands.push(done),
      options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    );
    this.started.add(command);
    return command;
  }

  /** Runs a command to its end. */
  run(
    args: readonly string[],
    options: { readonly cwd?: string; readonly timeoutMs?: number } = {},
  ): Promise<Finished> {
    return this.start(args, options).finished;
  }

  /** Everything every command printed, the standard error with the standard output. */
  printed(): string[] {
    return this.finishedCommands.flatMap((done) => [done.stdout, done.stderr]);
  }

  /** Ends what still runs and removes the folder. */
  async dispose(): Promise<void> {
    for (const command of this.started) command.kill();
    const ended = Promise.all([...this.started].map((command) => command.finished));
    // A process that does not end is not waited for: its tree was killed, and the folder goes anyway.
    await Promise.race([ended, new Promise((done) => setTimeout(done, 10_000))]);
    removeFolder(this.root);
  }
}

/** The tokens in some texts (`mdg_` and base64url characters), each as it was printed. */
export function tokensIn(texts: readonly string[]): string[] {
  return texts.flatMap((text) => text.match(TOKEN_LIKE) ?? []);
}
