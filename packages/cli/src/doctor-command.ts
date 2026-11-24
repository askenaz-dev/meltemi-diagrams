/**
 * `meltemi-diagrams doctor [folder]` (`cli-doctor`): what this machine and a folder have for
 * Meltemi Diagrams, read without the network and without writing anything: Node, the browser of
 * the PNG, PDF and video exports, FFmpeg for video, the copies of the agents' skill and whether a
 * sign-in is stored. The browser and FFmpeg are found as the exports find them.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ffmpegVersion, findBrowser, findFfmpeg } from "@meltemi/diagrams-capture";
import { CloudError } from "./cloud-errors.js";
import { CredentialsStore, DEFAULT_HOST, resolveHost } from "./credentials.js";
import { argumentsError, messages } from "./messages/index.js";
import { SKILL_AGENTS, SKILL_NAME } from "./skill-command.js";

export type DoctorStatus = "ok" | "warn" | "fail";

/** One check: its id, its status, what it found and, unless it is `ok`, what to do. */
export interface DoctorCheck {
  readonly id: "node" | "browser" | "ffmpeg" | "skill" | "sign-in";
  readonly status: DoctorStatus;
  readonly detail: string;
  readonly fix?: string;
}

/** What the command needs, and what a test replaces. */
export interface DoctorContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly toolVersion: string;
  /** The person's home folder; the system's by default. */
  readonly home?: string;
  readonly platform?: NodeJS.Platform;
  /** The running Node's version (`process.versions.node`). */
  readonly nodeVersion?: string;
  readonly findBrowser?: typeof findBrowser;
  readonly findFfmpeg?: typeof findFfmpeg;
  readonly ffmpegVersion?: typeof ffmpegVersion;
  /** Displays a path as printed: relative to the working folder. */
  readonly display?: (path: string) => string;
}

/** The least Node the command line runs on. */
const NODE_MAJOR = 22;
const NODE_MINOR = 12;

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

/** `major.minor` of a version, as numbers; undefined when it is not one. */
function minorOf(version: string): [number, number] | undefined {
  const match = /^(\d+)\.(\d+)/.exec(version.replace(/^v/, ""));
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

const compare = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

/** The skill copies of a folder's and of the home's agent folders, with the version each says. */
function skillCopies(folder: string, home: string): { path: string; version: string | null }[] {
  const roots = [...new Set(Object.values(SKILL_AGENTS))];
  const found: { path: string; version: string | null }[] = [];
  for (const base of [folder, home]) {
    for (const root of roots) {
      const path = join(base, root, SKILL_NAME);
      const skill = join(path, "SKILL.md");
      if (!existsSync(skill)) continue;
      const version = /^ {2}version: (\S+)\s*$/m.exec(readFileSync(skill, "utf8"))?.[1] ?? null;
      if (!found.some((copy) => copy.path === path)) found.push({ path, version });
    }
  }
  return found;
}

/** The five checks, in order. */
export function doctorChecks(folder: string, context: DoctorContext): DoctorCheck[] {
  const t = messages().doctor;
  const display = context.display ?? ((path: string) => path);
  const env = context.env as Record<string, string | undefined>;
  const checks: DoctorCheck[] = [];

  const node = context.nodeVersion ?? process.versions.node;
  const nodeMinor = minorOf(node);
  checks.push(
    nodeMinor && compare(nodeMinor, [NODE_MAJOR, NODE_MINOR]) >= 0
      ? { id: "node", status: "ok", detail: t.node(node) }
      : { id: "node", status: "fail", detail: t.nodeOld(node), fix: t.nodeFix },
  );

  const browser = (context.findBrowser ?? findBrowser)(env, context.platform);
  checks.push(
    browser
      ? { id: "browser", status: "ok", detail: t.browser(browser) }
      : { id: "browser", status: "warn", detail: t.noBrowser, fix: t.browserFix },
  );

  const ffmpeg = (context.findFfmpeg ?? findFfmpeg)(env, context.platform);
  if (ffmpeg) {
    let version = "";
    try {
      version = (context.ffmpegVersion ?? ffmpegVersion)(ffmpeg);
    } catch {
      // A version that cannot be read does not make FFmpeg missing.
    }
    checks.push({
      id: "ffmpeg",
      status: "ok",
      detail: t.ffmpeg(ffmpeg, version, browser !== null),
    });
  } else {
    checks.push({ id: "ffmpeg", status: "warn", detail: t.noFfmpeg, fix: t.ffmpegFix });
  }

  const tool = minorOf(context.toolVersion);
  const copies = skillCopies(folder, context.home ?? homedir());
  if (copies.length === 0) {
    checks.push({ id: "skill", status: "ok", detail: t.noSkill });
  } else {
    const described = copies.map((copy) => t.skillCopy(display(copy.path), copy.version));
    const older = copies.filter((copy) => {
      const minor = copy.version ? minorOf(copy.version) : undefined;
      return !minor || (tool !== undefined && compare(minor, tool) < 0);
    });
    const newer = copies.filter((copy) => {
      const minor = copy.version ? minorOf(copy.version) : undefined;
      return minor !== undefined && tool !== undefined && compare(minor, tool) > 0;
    });
    if (older.length > 0) {
      checks.push({
        id: "skill",
        status: "warn",
        detail: t.skillOlder(described, context.toolVersion),
        fix: t.skillOlderFix,
      });
    } else if (newer.length > 0) {
      checks.push({
        id: "skill",
        status: "warn",
        detail: t.skillNewer(described, context.toolVersion),
        fix: t.skillNewerFix,
      });
    } else {
      checks.push({ id: "skill", status: "ok", detail: t.skillCurrent(described) });
    }
  }

  let host = DEFAULT_HOST;
  let hostProblem: string | undefined;
  try {
    host = resolveHost({ env });
  } catch (error) {
    if (!(error instanceof CloudError)) throw error;
    hostProblem = error.message;
  }
  if (hostProblem !== undefined) {
    checks.push({ id: "sign-in", status: "warn", detail: hostProblem, fix: t.hostFix });
  } else if (env["MELTEMI_TOKEN"]) {
    checks.push({ id: "sign-in", status: "ok", detail: t.tokenInEnvironment(host) });
  } else {
    const store = new CredentialsStore({
      env,
      ...(context.platform ? { platform: context.platform } : {}),
      ...(context.home ? { home: context.home } : {}),
    });
    try {
      checks.push(
        store.entry(host) === undefined
          ? { id: "sign-in", status: "ok", detail: t.notSignedIn(host) }
          : { id: "sign-in", status: "ok", detail: t.signedIn(host) },
      );
    } catch (error) {
      if (!(error instanceof CloudError)) throw error;
      checks.push({
        id: "sign-in",
        status: "warn",
        detail: t.credentialsUnreadable(display(store.path)),
        fix: t.credentialsFix,
      });
    }
  }
  return checks;
}

/** `meltemi-diagrams doctor [folder] [--json]`. */
export function doctorCommand(args: readonly string[], context: DoctorContext): number {
  const words = messages();
  let values: { json: boolean; help: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as typeof values;
    positionals = parsed.positionals;
  } catch (error) {
    context.stderr(
      `${context.name} doctor: ${argumentsError(error)} ${words.doctor.seeHelp(context.name)}\n`,
    );
    return EXIT_USAGE;
  }
  if (values.help) {
    context.stdout(words.help.doctor);
    return EXIT_OK;
  }
  if (positionals.length > 1) {
    context.stderr(
      `${context.name} doctor: ${words.doctor.oneFolder} ${words.doctor.seeHelp(context.name)}\n`,
    );
    return EXIT_USAGE;
  }
  const folder = resolve(context.cwd, positionals[0] ?? ".");
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    context.stderr(`${context.name} doctor: ${words.doctor.notAFolder(positionals[0] ?? ".")}\n`);
    return EXIT_USAGE;
  }
  const checks = doctorChecks(folder, context);
  const failed = checks.some((check) => check.status === "fail");
  if (values.json) {
    context.stdout(`${JSON.stringify({ version: context.toolVersion, checks }, null, 2)}\n`);
    return failed ? EXIT_FAILED : EXIT_OK;
  }
  const width = Math.max(...checks.map((check) => check.id.length));
  for (const check of checks) {
    context.stdout(`${check.status.padEnd(5)} ${check.id.padEnd(width)}  ${check.detail}\n`);
    if (check.fix) context.stdout(`${" ".repeat(6 + width + 2)}${check.fix}\n`);
  }
  const count = (status: DoctorStatus) => checks.filter((check) => check.status === status).length;
  context.stdout(`${words.doctor.summary(count("ok"), count("warn"), count("fail"))}\n`);
  return failed ? EXIT_FAILED : EXIT_OK;
}
