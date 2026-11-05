// The MCP server of one request (`mcp-server`, "The endpoint" and "The catalogue"): its name, its
// instructions and the catalogue of tools, registered for the request's caller. The endpoint is
// stateless: the SDK builds a server for every request it serves (`routes/mcp.ts`), so nothing of a
// caller outlives the request.

import { McpServer } from "@modelcontextprotocol/server";
import { productVersion, LIVE_TOOLS, PUBLISH_TOOLS } from "./tools-live.js";
import { PREVIEW_TOOLS } from "./tools-preview.js";
import { PROJECT_TOOLS } from "./tools-projects.js";
import { SHARING_TOOLS } from "./tools-sharing.js";
import { register, type AnyTool, type McpSession } from "./tool.js";

/** The server's name in `initialize`. */
export const SERVER_NAME = "meltemi-diagrams";

/** Every tool, in the catalogue's order: the account and its projects, files, versions and address, previews, sharing, live sessions and publishing. */
export const CATALOGUE: readonly AnyTool[] = [
  ...PROJECT_TOOLS,
  ...PREVIEW_TOOLS,
  ...SHARING_TOOLS,
  ...LIVE_TOOLS,
  ...PUBLISH_TOOLS,
];

/** The three sentences `initialize` answers: what the tools do, the workflow, where the language is taught. */
export function instructions(origin: string): string {
  return [
    "These tools act on the Meltemi Diagrams projects of the signed-in account, where diagrams are `.meltemi` text files: they create and read projects, write files, preview the drawings, share projects, run live sessions and publish catalogs.",
    "Write with write_files (with the ifRevision that get_project or read_files gave, and an idempotencyKey per change), then validate and preview to judge the drawing, and give the person open_url's address; never print a token or an invitation's or a live session's link they did not ask for.",
    `The language and its rules are taught by the Meltemi Diagrams skill (${origin}/agent-setup).`,
  ].join(" ");
}

/** The server for one request: every tool of the catalogue, for this caller. */
export async function createServer(session: McpSession): Promise<McpServer> {
  const server = new McpServer(
    { name: SERVER_NAME, title: "Meltemi Diagrams", version: await productVersion(session.op) },
    { instructions: instructions(session.op.config.origin) },
  );
  for (const spec of CATALOGUE) register(server, session, spec);
  return server;
}
