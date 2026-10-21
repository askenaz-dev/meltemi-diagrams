/**
 * `login`, `logout` and `whoami` (`cli-cloud`, "Signing in from the command line").
 *
 * What `logout` does when the service cannot be asked (offline, a server error): the entry is KEPT
 * and the command fails with exit code 1 (`logout.not-revoked`), because forgetting a token that is
 * still alive would leave one nobody can revoke from this computer. Only an answer that settles the
 * matter lets it go: the token revoked (204), or the service saying it does not know the token
 * (`token.invalid`). Nobody is stuck with an entry they cannot remove: the message names the file.
 */

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { getLocale } from "@meltemi/diagrams-i18n";
import { messages } from "./messages/index.js";
import {
  cloudHost,
  newClient,
  openCloud,
  usage,
  usageError,
  type CloudCommand,
  type CloudContext,
} from "./cloud-context.js";
import { CloudError, EXIT_OK, EXIT_USAGE, isCloudError } from "./cloud-errors.js";
import { environmentToken, type StoredEntry } from "./credentials.js";
import { LOGIN_TIMEOUT_MS, approvalCheck, listenForApproval, sameText } from "./login-listener.js";
import { openUrl } from "./open-url.js";

/** A token as the service makes them: `mdg_` and base64url characters. */
const TOKEN_SHAPE = /^mdg_[A-Za-z0-9_-]{4,512}$/;

/** The options of the three commands: `--host` and `--help`, and `login`'s own. */
function parse(
  context: CloudContext,
  args: readonly string[],
  help: string,
  withLogin: boolean,
): { host: string | undefined; noBrowser: boolean; token: boolean } | number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        host: { type: "string" },
        ...(withLogin
          ? {
              "no-browser": { type: "boolean", default: false },
              token: { type: "boolean", default: false },
            }
          : {}),
        help: { type: "boolean", short: "h", default: false },
      } as const,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageError(context, error, help);
  }
  const values = parsed.values as {
    host?: string;
    "no-browser"?: boolean;
    token?: boolean;
    help?: boolean;
  };
  if (values.help) {
    context.stdout(help);
    return EXIT_OK;
  }
  if (parsed.positionals.length > 0) {
    return usage(context, messages().cloud.noArguments(context.command), help);
  }
  return {
    host: values.host,
    noBrowser: values["no-browser"] === true,
    token: values.token === true,
  };
}

// ------------------------------------------------------------------------------------- login

export const loginCommand: CloudCommand = async (args, context) => {
  const help = messages().help.login;
  const options = parse(context, args, help, true);
  if (typeof options === "number") return options;

  if (environmentToken(context.env) !== undefined) {
    throw new CloudError("login.environment-token", "MELTEMI_TOKEN is set.");
  }
  const host = cloudHost(context, { host: options.host });
  // Read the file and make its folder first: a token made now must have somewhere to go.
  context.credentials.prepare();

  // Both flows keep the entry before they return it.
  const entry = options.token
    ? await loginWithToken(context, host)
    : await loginInBrowser(context, host, options.noBrowser);
  context.stdout(`${messages().cloud.login.signedIn(entry.user.name, host)}\n`);
  return EXIT_OK;
};

/** `--token`: the token comes from standard input; its id and owner from `GET /api/session`. */
async function loginWithToken(context: CloudContext, host: string): Promise<StoredEntry> {
  if (context.stdin === undefined) {
    throw new CloudError("login.token-input", "--token reads standard input.", {
      exitCode: EXIT_USAGE,
    });
  }
  // A byte order mark is what some shells put in front of what they pipe.
  const input = await context.stdin();
  const token = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).trim();
  if (token === "") throw new CloudError("login.no-token", "No token was given.");
  if (!TOKEN_SHAPE.test(token)) throw new CloudError("login.not-a-token", "Not an API token.");
  const { user, token: identity } = await newClient(context, host, token).session();
  const entry = { token, id: identity.id, user: { sub: user.sub, name: user.name } };
  context.credentials.save(host, entry);
  return entry;
}

/** The browser flow: approve in the browser, receive the code here, exchange it, learn who it is. */
async function loginInBrowser(
  context: CloudContext,
  host: string,
  noBrowser: boolean,
): Promise<StoredEntry> {
  const t = messages().cloud.login;
  const state = randomBytes(32).toString("base64url");
  let listener;
  try {
    listener = await listenForApproval({
      timeoutMs: context.hooks.loginTimeoutMs ?? LOGIN_TIMEOUT_MS,
      fallbackLocale: getLocale(),
    });
  } catch (error) {
    throw new CloudError("login.listener", "Cannot listen.", {
      details: { reason: (error as Error).message },
    });
  }
  try {
    // Built here, from the host and numbers and letters of our own, never from what a server says.
    const url = new URL("/cli-auth", host);
    url.searchParams.set("port", String(listener.port));
    url.searchParams.set("state", state);

    // The check first, so that the person recognises their own request on the page.
    context.stdout(`${t.check(approvalCheck(state))}\n${t.checkNote}\n`);
    if (noBrowser) {
      context.stdout(`${t.visit(url.href)}\n`);
    } else {
      context.stdout(`${t.opening(url.href)}\n`);
      try {
        await (context.hooks.openBrowser ?? openUrl)(url.href);
      } catch {
        context.stdout(`${t.openFailed}\n`);
      }
    }
    context.stdout(`${t.waiting}\n`);

    const arrival = await listener.outcome;
    if (arrival === "timeout") throw new CloudError("login.timeout", "No approval arrived.");
    if (!sameText(arrival.state, state)) {
      arrival.reply(false);
      throw new CloudError("login.state-mismatch", "The state does not match.");
    }
    try {
      const entry = await finishLogin(context, host, arrival.code, state);
      arrival.reply(true);
      return entry;
    } catch (error) {
      arrival.reply(false);
      throw error;
    }
  } finally {
    await listener.close();
  }
}

/**
 * Exchanges the one-time code (once; it is a secret and is never printed) and asks who the token is
 * for. A token that could not be completed is revoked again, so that none is left that nobody holds.
 */
async function finishLogin(
  context: CloudContext,
  host: string,
  code: string,
  state: string,
): Promise<StoredEntry> {
  const issued = await newClient(context, host).exchangeCode(code, state);
  const client = newClient(context, host, issued.token);
  const revoke = () =>
    client.deleteToken(issued.id).then(
      () => true,
      () => false,
    );
  let entry: StoredEntry;
  try {
    const { user } = await client.session();
    entry = { token: issued.token, id: issued.id, user: { sub: user.sub, name: user.name } };
    // Kept before the browser is answered: the page says "done" only when it is.
    context.credentials.save(host, entry);
  } catch (error) {
    const revoked = await revoke();
    if (isCloudError(error) && error.code.startsWith("credentials.")) {
      const reason = String(error.details["reason"] ?? error.message);
      throw new CloudError(
        revoked ? "login.not-stored" : "login.not-stored-not-revoked",
        `The token could not be kept: ${reason}`,
        { details: { reason } },
      );
    }
    throw error;
  }
  return entry;
}

// ------------------------------------------------------------------------------------ logout

export const logoutCommand: CloudCommand = async (args, context) => {
  const help = messages().help.logout;
  const options = parse(context, args, help, false);
  if (typeof options === "number") return options;
  const t = messages().cloud.logout;
  const host = cloudHost(context, { host: options.host });
  const note = environmentToken(context.env) !== undefined ? `${t.environment}\n` : "";

  const entry = context.credentials.entry(host);
  if (entry === undefined) {
    context.stdout(`${t.none(host)}\n${note}`);
    return EXIT_OK;
  }
  const client = newClient(context, host, entry.token);
  try {
    try {
      await client.deleteToken(entry.id);
    } catch (error) {
      // The stored id is not this token's (the file was edited): the token knows its own.
      if (!isCloudError(error, "not-found")) throw error;
      await client.deleteToken((await client.session()).token.id);
    }
  } catch (error) {
    if (isCloudError(error, "token.invalid")) {
      context.credentials.remove(host);
      context.stdout(`${t.alreadyRevoked(host)}\n${note}`);
      return EXIT_OK;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new CloudError("logout.not-revoked", `The token could not be revoked: ${reason}`, {
      details: { host, reason, path: context.credentials.path },
    });
  }
  context.credentials.remove(host);
  context.stdout(`${t.done(host)}\n${note}`);
  return EXIT_OK;
};

// ------------------------------------------------------------------------------------ whoami

export const whoamiCommand: CloudCommand = async (args, context) => {
  const help = messages().help.whoami;
  const options = parse(context, args, help, false);
  if (typeof options === "number") return options;
  const t = messages().cloud.whoami;
  const { host, client, token } = openCloud(context, { host: options.host });
  const { user } = await client.session();
  context.stdout(`${t.who(user.name, user.handle)}\n${t.host(host)}\n`);
  if (token.source === "environment") context.stdout(`${t.environment}\n`);
  return EXIT_OK;
};
