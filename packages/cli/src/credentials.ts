/**
 * Where the command line keeps its sign-in (`cli-cloud`, "Signing in from the command line"):
 * `credentials.json` in the user's configuration folder, one entry `{ token, id, user }` per host,
 * and how a command finds the host and the token it uses.
 *
 * - The host is `--host`, else `MELTEMI_HOST`, else `https://diagrams.meltemi.dev`: never a
 *   manifest's (`checkManifestHost` fails with `cloud.host-mismatch` when `project.json` names
 *   another one).
 * - The token is `MELTEMI_TOKEN` in the environment, else the file's entry for the host.
 * - The file is written owner-only (`0o600`, in a `0o700` folder) where the system has such modes,
 *   through a temporary file and a rename, so a failure never leaves half a file. Windows keeps the
 *   ACLs the user's profile folder has.
 * - A file that cannot be read as credentials is reported (`credentials.corrupt`) and never
 *   overwritten.
 */

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { cloudHostOrigin, parseCloudHost } from "@meltemi/diagrams-project";
import { CloudError } from "./cloud-errors.js";

/** The service every cloud command talks to unless `--host` or `MELTEMI_HOST` says otherwise. */
export const DEFAULT_HOST = "https://diagrams.meltemi.dev";

/** The folder of the configuration, and the file of the credentials in it. */
export const CONFIGURATION_FOLDER = "meltemi-diagrams";
export const CREDENTIALS_FILE = "credentials.json";

/** The most a credentials file may weigh: it holds a few entries. */
const MAX_FILE_BYTES = 1024 * 1024;

type Env = Readonly<Record<string, string | undefined>>;

export interface ConfigurationOptions {
  /** The environment: `APPDATA`, `XDG_CONFIG_HOME`, `HOME`, `USERPROFILE`. */
  readonly env: Env;
  /** The platform, `process.platform` by default. */
  readonly platform?: NodeJS.Platform;
  /** The user's home folder, from the environment or the system by default. */
  readonly home?: string;
}

/**
 * The folder of the configuration: `%APPDATA%\meltemi-diagrams` on Windows;
 * `$XDG_CONFIG_HOME/meltemi-diagrams` elsewhere (an absolute value only, as the specification
 * says), else `~/.config/meltemi-diagrams`.
 */
export function configurationFolder(options: ConfigurationOptions): string {
  const platform = options.platform ?? process.platform;
  const env = options.env;
  if (platform === "win32") {
    const home = options.home ?? (env["USERPROFILE"]?.trim() || homedir());
    const appData = env["APPDATA"]?.trim();
    return win32.join(
      appData ? appData : win32.join(home, "AppData", "Roaming"),
      CONFIGURATION_FOLDER,
    );
  }
  const home = options.home ?? (env["HOME"]?.trim() || homedir());
  const xdg = env["XDG_CONFIG_HOME"]?.trim();
  return posix.join(
    xdg && posix.isAbsolute(xdg) ? xdg : posix.join(home, ".config"),
    CONFIGURATION_FOLDER,
  );
}

/** The credentials file of an environment. */
export function credentialsPath(options: ConfigurationOptions): string {
  const platform = options.platform ?? process.platform;
  return (platform === "win32" ? win32 : posix).join(
    configurationFolder(options),
    CREDENTIALS_FILE,
  );
}

// ------------------------------------------------------------------------------------ hosts

/**
 * The host a cloud command talks to: `--host` (`flag`), else `MELTEMI_HOST`, else the default. An
 * empty `MELTEMI_HOST` counts as not set, as CI expands an unset variable. The answer is the
 * normalised origin. Throws `cloud.host-invalid` for a text that is not an origin and
 * `cloud.insecure-host` for `http:` anywhere but the loopback (`127.0.0.1`, `localhost`, `[::1]`),
 * before anything is sent.
 */
export function resolveHost(options: {
  readonly flag?: string | undefined;
  readonly env: Env;
}): string {
  const fromEnvironment = options.env["MELTEMI_HOST"]?.trim();
  const raw = options.flag ?? (fromEnvironment ? fromEnvironment : DEFAULT_HOST);
  const parsed = parseCloudHost(raw);
  if (parsed.ok) return parsed.origin;
  if (parsed.reason === "insecure") {
    throw new CloudError(
      "cloud.insecure-host",
      `${raw} is an http: address; a token only travels over https:, or http: to 127.0.0.1, localhost or [::1].`,
      { details: { host: raw } },
    );
  }
  throw new CloudError(
    "cloud.host-invalid",
    `${raw} is not the address of a service; use an origin such as ${DEFAULT_HOST}.`,
    { details: { host: raw } },
  );
}

/**
 * Fails with `cloud.host-mismatch`, naming both hosts and `--host`, when a project's `cloud.host`
 * is not the host the command resolved. A manifest never chooses where a token goes. Call it before
 * any request; `manifestHost` is `project.json`'s `cloud.host` (absent when it names none).
 */
export function checkManifestHost(resolved: string, manifestHost: string | null | undefined): void {
  if (manifestHost === null || manifestHost === undefined) return;
  if (cloudHostOrigin(manifestHost) === resolved) return;
  throw new CloudError(
    "cloud.host-mismatch",
    `project.json names ${manifestHost}, but this command talks to ${resolved}; pass --host ${manifestHost} to use it.`,
    { details: { manifestHost, host: resolved } },
  );
}

// ----------------------------------------------------------------------------------- entries

export interface StoredUser {
  readonly sub: string;
  readonly name: string;
}

/** What is kept for one host: the token, its id at the service, and who it is for. */
export interface StoredEntry {
  readonly token: string;
  readonly id: string;
  readonly user: StoredUser;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The entry a value is, or undefined when it is not one. */
function readEntry(value: unknown): StoredEntry | undefined {
  if (!isRecord(value) || !isRecord(value["user"])) return undefined;
  const { token, id } = value;
  const { sub, name } = value["user"];
  if (typeof token !== "string" || token === "" || /\s/.test(token)) return undefined;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof sub !== "string" || typeof name !== "string") return undefined;
  return { token, id, user: { sub, name } };
}

/** The token a command uses, and where it came from. */
export interface ResolvedToken {
  readonly token: string;
  /** `environment`: `MELTEMI_TOKEN`; `file`: the credentials file's entry for the host. */
  readonly source: "environment" | "file";
  /** The stored entry, when the token came from the file. */
  readonly entry?: StoredEntry;
}

/** The token of `MELTEMI_TOKEN`, when it is set to something. */
export function environmentToken(env: Env): string | undefined {
  const token = env["MELTEMI_TOKEN"]?.trim();
  return token ? token : undefined;
}

// ------------------------------------------------------------------------------------- store

/** The parts of a credentials file: what the command line reads, and what it keeps as it found it. */
interface Document {
  readonly hosts: Record<string, unknown>;
  readonly others: Record<string, unknown>;
}

/**
 * The credentials file. A missing file is an empty one. A file that is not JSON, not an object, or
 * whose `hosts` is not an object, or whose entry for the host asked about is not an entry, is
 * `credentials.corrupt`; nothing is written over it, so the person can read what is there.
 * Entries of other hosts and fields it does not know are kept as they were found.
 */
export class CredentialsStore {
  readonly path: string;
  readonly folder: string;

  constructor(options: ConfigurationOptions) {
    const platform = options.platform ?? process.platform;
    this.folder = configurationFolder(options);
    this.path = (platform === "win32" ? win32 : posix).join(this.folder, CREDENTIALS_FILE);
  }

  private corrupt(reason: string): CloudError {
    return new CloudError(
      "credentials.corrupt",
      `The credentials file ${this.path} cannot be used: ${reason}. Fix it or delete it.`,
      { details: { path: this.path, reason } },
    );
  }

  private load(): Document {
    let text: string;
    try {
      const size = statSync(this.path).size;
      if (size > MAX_FILE_BYTES) throw this.corrupt("it is too large");
      text = readFileSync(this.path, "utf8");
    } catch (error) {
      if (error instanceof CloudError) throw error;
      // Nothing there, or a folder in the path that is not one: no file yet (writing says why not).
      const reason = (error as NodeJS.ErrnoException).code;
      if (reason === "ENOENT" || reason === "ENOTDIR") return { hosts: {}, others: {} };
      throw new CloudError(
        "credentials.unreadable",
        `The credentials file ${this.path} cannot be read: ${(error as Error).message}`,
        { details: { path: this.path, reason: (error as Error).message } },
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch (error) {
      throw this.corrupt(`it is not valid JSON (${(error as Error).message})`);
    }
    if (!isRecord(parsed)) throw this.corrupt("it is not a JSON object");
    const { hosts, ...others } = parsed;
    if (hosts === undefined) return { hosts: {}, others };
    if (!isRecord(hosts)) throw this.corrupt('"hosts" is not an object');
    return { hosts, others };
  }

  /** Reads the file and makes its folder, so that a command finds out before it asks for a token. */
  prepare(): void {
    this.load();
    try {
      mkdirSync(this.folder, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw new CloudError(
        "credentials.unwritable",
        `The credentials folder ${this.folder} cannot be made: ${(error as Error).message}`,
        { details: { path: this.folder, reason: (error as Error).message } },
      );
    }
  }

  /** The hosts that have an entry. */
  hosts(): string[] {
    return Object.keys(this.load().hosts);
  }

  /** The entry of a host, or undefined; `credentials.corrupt` when what is there is not an entry. */
  entry(host: string): StoredEntry | undefined {
    const stored = this.load().hosts[host];
    if (stored === undefined) return undefined;
    const entry = readEntry(stored);
    if (entry === undefined) {
      throw this.corrupt(
        `the entry for ${host} needs "token", "id" and "user" with "sub" and "name"`,
      );
    }
    return entry;
  }

  /** Keeps the entry of a host, replacing the one it had. */
  save(host: string, entry: StoredEntry): void {
    const { hosts, others } = this.load();
    this.write({ ...others, hosts: { ...hosts, [host]: entry } });
  }

  /** Forgets the entry of a host; whether there was one. The file goes when nothing is left in it. */
  remove(host: string): boolean {
    const { hosts, others } = this.load();
    if (!(host in hosts)) return false;
    const { [host]: _removed, ...rest } = hosts;
    if (Object.keys(rest).length === 0 && Object.keys(others).length === 0) {
      try {
        rmSync(this.path, { force: true });
      } catch (error) {
        throw this.unwritable(error as Error);
      }
      return true;
    }
    this.write({ ...others, hosts: rest });
    return true;
  }

  private unwritable(error: Error): CloudError {
    return new CloudError(
      "credentials.unwritable",
      `The credentials file ${this.path} cannot be written: ${error.message}`,
      { details: { path: this.path, reason: error.message } },
    );
  }

  /** Writes owner-only through a temporary file in the same folder, then renames it into place. */
  private write(document: Record<string, unknown>): void {
    const temporary = `${this.path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      mkdirSync(this.folder, { recursive: true, mode: 0o700 });
      writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      // The mode of a new file is subject to the umask and ignored where it is already there.
      if (process.platform !== "win32") chmodSync(temporary, 0o600);
      renameSync(temporary, this.path);
    } catch (error) {
      try {
        rmSync(temporary, { force: true });
      } catch {
        // Nothing more to do with a temporary file that will not go.
      }
      throw this.unwritable(error as Error);
    }
  }

  /**
   * The token a command uses for a host: `MELTEMI_TOKEN` when it is set (the file is not even
   * read), else the host's entry. Undefined when there is none.
   */
  resolveToken(host: string, env: Env): ResolvedToken | undefined {
    const token = environmentToken(env);
    if (token !== undefined) return { token, source: "environment" };
    const entry = this.entry(host);
    return entry === undefined ? undefined : { token: entry.token, source: "file", entry };
  }
}
