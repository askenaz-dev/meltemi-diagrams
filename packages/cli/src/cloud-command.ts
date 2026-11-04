/**
 * The cloud commands (`cli-cloud`): one table of names to commands, and the dispatcher that gives
 * each the same context, keeps tokens out of everything it prints and turns a `CloudError` into a
 * line on standard error and an exit code (1, or 3 when the person has to run `login`).
 *
 * Adding a command is a file with a `CloudCommand` (`cloud-context.ts` has the helpers: `openCloud`
 * for the host, the token and the client, `usageError`) and one line in `CLOUD_COMMANDS`; `cli.ts`
 * and the help need nothing else but the words in `messages/`.
 */

import type { Locale } from "@meltemi/diagrams-i18n";
import { loginCommand, logoutCommand, whoamiCommand } from "./auth-command.js";
import {
  reportCloudError,
  type CloudCommand,
  type CloudContext,
  type CloudHooks,
} from "./cloud-context.js";
import { CloudError } from "./cloud-errors.js";
import { CredentialsStore } from "./credentials.js";
import { projectsCommand } from "./projects-command.js";
import { publishCommand } from "./publish-command.js";
import { pullCommand } from "./pull-command.js";
import { pushCommand } from "./push-command.js";
import { redactSecrets } from "./redact.js";

/** The cloud commands by name. */
const CLOUD_COMMANDS = {
  login: loginCommand,
  push: pushCommand,
  pull: pullCommand,
  logout: logoutCommand,
  whoami: whoamiCommand,
  projects: projectsCommand,
  publish: publishCommand,
} as const satisfies Readonly<Record<string, CloudCommand>>;

export type CloudCommandName = keyof typeof CLOUD_COMMANDS;

/** The names of the cloud commands. */
export const CLOUD_COMMAND_NAMES = Object.keys(CLOUD_COMMANDS) as CloudCommandName[];

/** Whether a command name is one of the cloud commands. */
export function isCloudCommand(name: string): name is CloudCommandName {
  return Object.hasOwn(CLOUD_COMMANDS, name);
}

/** What the dispatcher needs from the command line: its streams, its environment and its hooks. */
export interface CloudCommandIo {
  /** The command line's name, `meltemi-diagrams`. */
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  readonly display: (path: string) => string;
  readonly toolVersion: string;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly ask?: ((question: string) => Promise<string>) | undefined;
  readonly stdin?: (() => Promise<string>) | undefined;
  readonly cloud?: CloudHooks | undefined;
  /** The language of the files a command writes: `--lang`, when given (never the machine's). */
  readonly locale?: Locale | undefined;
}

/**
 * The context of a command, from the command line's streams and environment: its output goes
 * through `redactSecrets`, so a token that an answer, a file or an error carried is shown as
 * `mdg_…`. `cloudCommand` makes one for each cloud command; a command that is not one of them but
 * talks to the service (`review --base cloud`) makes its own with `command` set to its name.
 */
export function cloudContext(command: string, io: CloudCommandIo): CloudContext {
  const env = io.env ?? process.env;
  const hooks = io.cloud ?? {};
  const clean = (write: (text: string) => void) => (text: string) =>
    write(redactSecrets(text, env));
  return {
    name: io.name,
    command,
    stdout: clean(io.stdout),
    stderr: clean(io.stderr),
    cwd: io.cwd,
    display: io.display,
    env,
    toolVersion: io.toolVersion,
    ...(io.ask ? { ask: io.ask } : {}),
    ...(io.stdin ? { stdin: io.stdin } : {}),
    ...(io.locale ? { locale: io.locale } : {}),
    hooks,
    credentials: new CredentialsStore({
      env,
      ...(hooks.platform ? { platform: hooks.platform } : {}),
      ...(hooks.home ? { home: hooks.home } : {}),
    }),
    used: {},
  };
}

/**
 * Runs a cloud command. A `CloudError` it throws is printed as `<name> <command>: <code>: <sentence>`
 * on standard error (`reportCloudError`) and its exit code is returned.
 */
export async function cloudCommand(
  command: CloudCommandName,
  args: readonly string[],
  io: CloudCommandIo,
): Promise<number> {
  const context = cloudContext(command, io);
  try {
    return await CLOUD_COMMANDS[command](args, context);
  } catch (error) {
    if (error instanceof CloudError) return reportCloudError(error, context);
    throw error;
  }
}
