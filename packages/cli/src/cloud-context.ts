/**
 * What every cloud command shares (`cli-cloud`): the context the dispatcher gives it, the way it
 * finds its host and its token, how it reports a usage error, and how a failure reads in the
 * interface language. A command is `(args, context) => Promise<number>` in a file of its own,
 * registered in `cloud-command.ts`.
 *
 * ```ts
 * export const pushCommand: CloudCommand = async (args, context) => {
 *   const { values, positionals } = parseArgs(...); // usageError(context, error, help) on a throw
 *   const { host, client } = openCloud(context, { host: values.host, manifestHost: manifest.cloud?.host });
 *   const files = await client.files(projectId);
 *   ...
 *   return EXIT_OK;
 * };
 * ```
 *
 * A command reports a failure by throwing a `CloudError` (`cloud-errors.ts`); the dispatcher prints
 * it as `<name> <command>: <code>: <sentence>` on standard error and exits with the error's code.
 */

import type { Locale } from "@meltemi/diagrams-i18n";
import { formatSize } from "./build-command.js";
import { argumentsError, messages } from "./messages/index.js";
import { CloudClient, type Fetch } from "./cloud-client.js";
import { CloudError, EXIT_USAGE } from "./cloud-errors.js";
import { describeProjectError } from "./project-errors.js";
import {
  CredentialsStore,
  checkManifestHost,
  resolveHost,
  type ResolvedToken,
} from "./credentials.js";

/** What a test replaces: the network, the browser, the clock of the wait, the configuration folder. */
export interface CloudHooks {
  /** Replaces `fetch`. */
  readonly fetch?: Fetch;
  /** Opens an address in the browser; rejects when it cannot. */
  readonly openBrowser?: (url: string) => Promise<void> | void;
  /** Milliseconds `login` waits for the approval; five minutes by default. */
  readonly loginTimeoutMs?: number;
  /** The platform and home folder the credentials folder is derived from. */
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
}

export interface CloudContext {
  /** The command line's name, `meltemi-diagrams`, for messages that name a command to run. */
  readonly name: string;
  /** The cloud command being run: `login`, `push`, … */
  readonly command: string;
  /** Output, with API tokens already replaced by `mdg_…`. */
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly toolVersion: string;
  /** Asks a question in a terminal; absent when nobody can answer (then refuse unless `--force`). */
  readonly ask?: (question: string) => Promise<string>;
  /** Reads standard input (for `login --token`); absent when the host gave none. */
  readonly stdin?: () => Promise<string>;
  /** The language of the files the command writes: `--lang`, when given (never the machine's). */
  readonly locale?: Locale;
  readonly hooks: CloudHooks;
  readonly credentials: CredentialsStore;
  /** What the command has settled on so far, so that a failure can name it. */
  readonly used: { host?: string; project?: string };
}

/** A cloud command: its arguments after its name, and the exit code. */
export type CloudCommand = (args: readonly string[], context: CloudContext) => Promise<number>;

/** A client for a host, with the token given (none for the calls that need none). */
export function newClient(context: CloudContext, host: string, token?: string): CloudClient {
  return new CloudClient({
    host,
    token,
    userAgent: `${context.name}/${context.toolVersion}`,
    ...(context.hooks.fetch ? { fetch: context.hooks.fetch } : {}),
  });
}

/**
 * The host of a command: `--host`, else `MELTEMI_HOST`, else the default (never a manifest's). When
 * `manifestHost` is given (`project.json`'s `cloud.host`) and is another host, it fails with
 * `cloud.host-mismatch` before anything is sent.
 */
export function cloudHost(
  context: CloudContext,
  options: {
    readonly host?: string | undefined;
    readonly manifestHost?: string | null | undefined;
  } = {},
): string {
  const host = resolveHost({ flag: options.host, env: context.env });
  context.used.host = host;
  checkManifestHost(host, options.manifestHost);
  return host;
}

/** A command's connection to the service. */
export interface CloudSession {
  readonly host: string;
  readonly client: CloudClient;
  /** Where the token came from (`MELTEMI_TOKEN`, or the credentials file). */
  readonly token: ResolvedToken;
}

/**
 * The host and a client with its token, for a command that needs to be signed in: resolves the host
 * (`cloudHost`), then the token (`MELTEMI_TOKEN`, else the stored entry for that host); with none,
 * `cloud.not-signed-in` (exit code 3, "run login"). Nothing has been sent when it returns or throws.
 */
export function openCloud(
  context: CloudContext,
  options: {
    readonly host?: string | undefined;
    readonly manifestHost?: string | null | undefined;
  } = {},
): CloudSession {
  const host = cloudHost(context, options);
  const token = context.credentials.resolveToken(host, context.env);
  if (token === undefined) {
    throw new CloudError("cloud.not-signed-in", `There is no token for ${host}.`, {
      details: { host },
    });
  }
  return { host, client: newClient(context, host, token.token), token };
}

/** Prints a usage error with the command's usage, and the exit code 2 (`parseArgs` threw). */
export function usageError(context: CloudContext, error: unknown, help: string): number {
  return usage(context, argumentsError(error), help);
}

/** Prints a usage message with the command's usage, and the exit code 2. */
export function usage(context: CloudContext, message: string, help: string): number {
  context.stderr(`${context.name} ${context.command}: ${message}\n\n${help}`);
  return EXIT_USAGE;
}

/**
 * Prints a failure on standard error as `<name> <command>: <code>: <sentence>` and answers the exit
 * code it carries (3 when the person has to run `login`, else 1).
 */
export function reportCloudError(error: CloudError, context: CloudContext): number {
  context.stderr(`${context.name} ${context.command}: ${describeCloudError(error, context)}\n`);
  return error.exitCode;
}

/** What a `details` entry is, as text. */
const text = (value: unknown, fallback: string): string =>
  typeof value === "string" && value !== "" ? value : fallback;

/**
 * A failure as a person reads it: the stable code, then a sentence in the interface language when
 * the code is one the command line knows, else the service's own English message.
 */
export function describeCloudError(error: CloudError, context: CloudContext): string {
  const t = messages().cloud.errors;
  const host = text(error.details["host"], context.used.host ?? "the service");
  const path = text(error.details["path"], "");
  const reason = text(error.details["reason"], error.message);
  const sentence = ((): string => {
    switch (error.code) {
      case "cloud.host-mismatch":
        return t.hostMismatch(text(error.details["manifestHost"], "?"), host);
      case "cloud.insecure-host":
        return t.insecureHost(host);
      case "cloud.host-invalid":
        return t.hostInvalid(host);
      case "cloud.unreachable":
        return t.unreachable(host, reason);
      case "cloud.timeout":
        return t.timeout(host);
      case "cloud.response-too-large":
        return t.tooLarge(host);
      case "cloud.redirect":
        return t.redirect(host, error.status);
      case "cloud.bad-response":
        return t.badResponse(host, error.status);
      case "cloud.not-signed-in":
        return t.notSignedIn(context.name, host);
      case "token.invalid":
      case "auth.required":
        return t.tokenRefused(context.name, host);
      case "credentials.corrupt":
        return t.credentialsCorrupt(path, reason);
      case "credentials.unreadable":
        return t.credentialsUnreadable(path, reason);
      case "credentials.unwritable":
        return t.credentialsUnwritable(path, reason);
      case "cli.invalid":
        return t.cliInvalid;
      case "cli.rate":
        return t.cliRate(error.retryAfter ?? 60);
      case "quota.tokens":
        return t.quotaTokens;
      case "login.timeout":
        return t.loginTimeout;
      case "login.state-mismatch":
        return t.stateMismatch;
      case "login.environment-token":
        return t.environmentToken;
      case "login.token-input":
        return t.tokenInput;
      case "login.no-token":
        return t.noToken;
      case "login.not-a-token":
        return t.notAToken;
      case "login.not-stored":
        return t.notStored(reason);
      case "login.not-stored-not-revoked":
        return t.notStoredNotRevoked(reason);
      case "login.listener":
        return t.listener(reason);
      case "logout.not-revoked":
        return t.notRevoked(host, reason, path);
      case "cloud.no-project":
        return t.noProject(context.name);
      case "pull.unsafe-path":
        return t.unsafePath(path);
      case "version.not-found":
        return t.versionNotFound(
          text(String(error.details["version"] ?? ""), "that was asked for"),
        );
      case "project.not-found":
        return t.projectNotFound(text(error.details["project"], context.used.project ?? "?"));
      case "access.denied":
        return t.accessDenied;
      case "handle.taken":
        return t.handleTaken(text(error.details["handle"], "chosen"));
      case "handle.locked":
        // The handle the account has, which cannot change; else the one asked for.
        return t.handleLocked(text(error.details["current"], text(error.details["handle"], "?")));
      case "handle.invalid":
        return t.handleInvalid(text(error.details["handle"], "that"));
      case "handle.required":
        return t.handleRequired(context.name);
      case "publish.handle-in-page":
        return t.handleInPage(text(error.details["handle"], "you want"));
      case "publish.too-large":
        return t.publishTooLarge(
          typeof error.details["bytes"] === "number"
            ? formatSize(error.details["bytes"])
            : undefined,
        );
      case "publish.rate":
        return t.publishRate(error.retryAfter ?? 3600);
      case "publish.taken":
        return t.publishTaken(text(error.details["slug"], "that name"));
      case "publish.not-published":
        return t.notPublished(text(error.details["slug"], "that name"));
      case "publish.empty":
        return t.publishEmpty;
      case "publish.errors":
        return t.publishErrors;
      default:
        return describeProjectError(error) ?? error.message;
    }
  })();
  return `${error.code}: ${sentence}`;
}
