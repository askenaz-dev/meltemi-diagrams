// The MCP server of one request (`mcp-server`, "The endpoint" and "The catalogue"): its name, its
// instructions and the catalogue of tools of `@meltemi/diagrams-mcp`, each answered by the Worker's
// implementation for the request's caller. The endpoint is stateless: the SDK builds a server for
// every request it serves (`endpoint.ts`), so nothing of a caller outlives the request.

import {
  CATALOGUE,
  SERVER_NAME,
  SERVER_TITLE,
  buildServer,
  instructions,
  type AnyHandler,
  type ToolName,
} from "@meltemi/diagrams-mcp";
import type { McpServer } from "@modelcontextprotocol/server";
import { productVersion, LIVE_TOOLS, PUBLISH_TOOLS } from "./tools-live.js";
import { PREVIEW_TOOLS } from "./tools-preview.js";
import { PROJECT_TOOLS } from "./tools-projects.js";
import { SHARING_TOOLS } from "./tools-sharing.js";
import { endpointHooks, type AnyImplementation, type McpSession } from "./tool.js";

export { CATALOGUE, SERVER_NAME };

/** The Worker's answer to every tool, by name. */
export const IMPLEMENTATIONS: Readonly<Record<ToolName, AnyImplementation>> = Object.fromEntries(
  [...PROJECT_TOOLS, ...PREVIEW_TOOLS, ...SHARING_TOOLS, ...LIVE_TOOLS, ...PUBLISH_TOOLS].map(
    (implementation) => [implementation.definition.name, implementation],
  ),
) as Record<ToolName, AnyImplementation>;

/** The handlers of one request: every implementation, given the request's session. */
function handlersFor(session: McpSession): Record<string, AnyHandler> {
  return Object.fromEntries(
    CATALOGUE.map((definition) => {
      const implementation = IMPLEMENTATIONS[definition.name as ToolName];
      return [definition.name, (args: unknown) => implementation.run(session, args)];
    }),
  );
}

/** The server for one request: every tool of the catalogue, for this caller. */
export async function createServer(session: McpSession): Promise<McpServer> {
  return buildServer(
    { name: SERVER_NAME, title: SERVER_TITLE, version: await productVersion(session.op) },
    instructions(session.op.config.origin) +
      (session.op.deps.local
        ? " This is a local single-user workspace with no authentication. Fifteen core project, file, version, account, open, preview and story inspection tools are available; the thirteen sharing, guest live-session and publishing tools return local.feature-unavailable. Use the same project as the browser and preserve revisions and idempotency keys."
        : ""),
    CATALOGUE,
    handlersFor(session),
    endpointHooks(session),
  );
}
