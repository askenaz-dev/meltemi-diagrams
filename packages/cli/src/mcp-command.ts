/**
 * `meltemi-diagrams mcp` (`mcp-local-server`): the Model Context Protocol on this machine, over
 * Streamable HTTP at `http://127.0.0.1:<port>/mcp`, so that a coding agent that runs here gets the
 * hosted endpoint's tools with the drawing, the checks and the catalogs made in this process
 * (`mcp-cloud.ts`), or, with `--folder`, `validate` and `preview` over a folder's files with no
 * account (`mcp-folder.ts`). The listener and the requests it refuses are `mcp-http.ts`'s.
 *
 * Nothing listens until the options, the host, the folder and the key are settled: a usage error,
 * an insecure host, a folder that does not exist, a short key and a port in use are exit code 2.
 * The first line on standard output is the server's address; each call leaves its line on standard
 * error. It runs until `SIGINT` or `SIGTERM`, then exits with code 0.
 */

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { catalogScript } from "@meltemi/diagrams-catalog/node";
import {
  CATALOGUE,
  FOLDER_TOOLS,
  SERVER_NAME,
  SERVER_TITLE,
  buildServer,
  folderInstructions,
  instructions,
  statelessHandler,
  type AnyHandler,
  type ServeHooks,
  type ToolDefinition,
} from "@meltemi/diagrams-mcp";
import { CloudClient } from "./cloud-client.js";
import {
  cloudHost,
  describeCloudError,
  usage,
  usageError,
  type CloudCommand,
  type CloudContext,
} from "./cloud-context.js";
import { CloudError, EXIT_OK, EXIT_USAGE } from "./cloud-errors.js";
import { cloudHandlers, cloudRefusal } from "./mcp-cloud.js";
import { LocalEngine } from "./mcp-engine.js";
import { folderHandlers, realFolder } from "./mcp-folder.js";
import {
  DEFAULT_MCP_PORT,
  MIN_KEY_LENGTH,
  PortInUse,
  startLocalServer,
  type LocalServer,
} from "./mcp-http.js";
import { messages } from "./messages/index.js";

/** A port as `--port` gives it: a whole number from 0 to 65535, or undefined. */
function parsePort(text: string): number | undefined {
  if (!/^\d{1,5}$/.test(text)) return undefined;
  const port = Number(text);
  return port <= 65535 ? port : undefined;
}

/** What the server is made of: its tools, their handlers and its instructions. */
interface Served {
  readonly catalogue: readonly ToolDefinition[];
  readonly handlers: Readonly<Record<string, AnyHandler>>;
  readonly instructions: string;
  /** The folder it serves, as printed; undefined for the cloud projects. */
  readonly folder?: string;
}

/** The server's tools for the cloud projects of the sign-in, or a usage error's exit code. */
function cloudServed(
  context: CloudContext,
  host: string | undefined,
  engine: LocalEngine,
): Served | number {
  let origin: string;
  try {
    origin = cloudHost(context, { host });
    // The host's rules are the client's: refused here, before anything listens.
    new CloudClient({ host: origin });
  } catch (error) {
    if (!(error instanceof CloudError)) throw error;
    context.stderr(`${context.name} ${context.command}: ${describeCloudError(error, context)}\n`);
    return EXIT_USAGE;
  }
  return {
    catalogue: CATALOGUE,
    handlers: cloudHandlers({
      host: origin,
      // Asked at each call: a sign-in made meanwhile is used at once.
      token: () => context.credentials.resolveToken(origin, context.env)?.token,
      engine,
      toolVersion: context.toolVersion,
      catalogScript,
      fetch: context.hooks.fetch,
      userAgent: `${context.name}/${context.toolVersion}`,
    }),
    instructions: instructions(origin),
  };
}

export const mcpCommand: CloudCommand = async (args, context) => {
  const help = messages().help.mcp;
  const t = messages().cloud.mcp;
  let values: { folder?: string; host?: string; port?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        folder: { type: "string" },
        host: { type: "string" },
        port: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (error) {
    return usageError(context, error, help);
  }
  if (values.help) {
    context.stdout(help);
    return EXIT_OK;
  }
  const port = values.port === undefined ? DEFAULT_MCP_PORT : parsePort(values.port);
  if (port === undefined) return usage(context, t.badPort(values.port ?? ""), help);
  const key = context.env["MELTEMI_MCP_KEY"];
  if (key !== undefined && key !== "" && key.length < MIN_KEY_LENGTH) {
    return usage(context, t.shortKey(MIN_KEY_LENGTH), help);
  }

  const engine = new LocalEngine(context.toolVersion);
  let served: Served;
  if (values.folder !== undefined) {
    if (values.host !== undefined) return usage(context, t.folderAndHost, help);
    const root = realFolder(resolve(context.cwd, values.folder));
    if (root === undefined) {
      context.stderr(`${context.name} ${context.command}: ${t.notAFolder(values.folder)}\n`);
      return EXIT_USAGE;
    }
    served = {
      catalogue: Object.values(FOLDER_TOOLS),
      handlers: folderHandlers(root, engine, context.toolVersion),
      instructions: folderInstructions(),
      // As the person wrote it: a folder far from the working one reads better so than relative.
      folder: values.folder,
    };
  } else {
    const cloud = cloudServed(context, values.host, engine);
    if (typeof cloud === "number") return cloud;
    served = cloud;
  }

  const hooks: ServeHooks = {
    refusal: cloudRefusal,
    checkOutput: true,
    log: (line) => context.stderr(`${line}\n`),
    // The message of an error never holds a secret (the context's output is redacted too).
    unexpected: (error) =>
      context.stderr(
        `mcp: unexpected error: ${error instanceof Error ? error.message : "unknown"}\n`,
      ),
  };
  const handler = statelessHandler(() =>
    buildServer(
      { name: SERVER_NAME, title: SERVER_TITLE, version: context.toolVersion },
      served.instructions,
      served.catalogue,
      served.handlers,
      hooks,
    ),
  );

  let server: LocalServer;
  try {
    server = await startLocalServer({ port, handler, key: key === "" ? undefined : key });
  } catch (error) {
    if (!(error instanceof PortInUse)) throw error;
    context.stderr(`${context.name} ${context.command}: ${t.portInUse(error.port)}\n`);
    return EXIT_USAGE;
  }
  context.stdout(`${server.url}\n`);
  context.stderr(`${t.listening(server.url, served.folder)}\n`);
  const stop = () => void server.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  context.hooks.mcpStarted?.(server);
  try {
    await server.closed;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  return EXIT_OK;
};
