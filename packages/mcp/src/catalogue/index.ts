// The catalogue (`mcp-server`, "The catalogue"): every tool both servers list, defined once. The
// hosted endpoint answers each with the Worker's operations; the command line's local server
// (`mdg mcp`, `mcp-local-server`) through the service's HTTP API, drawing on the person's machine. A
// test builds both servers and compares their `tools/list`.

import type { ToolDefinition } from "../serve.js";
import { LIVE_TOOLS, PUBLISH_TOOLS } from "./live.js";
import { PREVIEW_TOOLS } from "./preview.js";
import { PROJECT_TOOLS } from "./projects.js";
import { SHARING_TOOLS } from "./sharing.js";

export { FOLDER_TOOLS, folderInstructions, type FolderToolName } from "./folder.js";
export { reportSchema } from "./preview.js";
export { versionSchema } from "./projects.js";

/** The server's name in `initialize`, the same for both servers. */
export const SERVER_NAME = "meltemi-diagrams";

/** The server's title in `initialize`. */
export const SERVER_TITLE = "Meltemi Diagrams";

/** Every tool by name. */
export const TOOLS = {
  ...PROJECT_TOOLS,
  ...PREVIEW_TOOLS,
  ...SHARING_TOOLS,
  ...LIVE_TOOLS,
  ...PUBLISH_TOOLS,
} as const;

export type ToolName = keyof typeof TOOLS;

/** Every tool, in the catalogue's order: the account and its projects, files, versions and address, previews, sharing, live sessions and publishing. */
export const CATALOGUE: readonly ToolDefinition[] = Object.values(TOOLS);

/** The three sentences `initialize` answers: what the tools do, the workflow, where the language is taught. */
export function instructions(origin: string): string {
  return [
    "These tools act on the Meltemi Diagrams projects of the signed-in account, where diagrams are `.meltemi` text files: they create and read projects, write files, preview the drawings, share projects, run live sessions and publish catalogs.",
    "Write with write_files (with the ifRevision that get_project or read_files gave, and an idempotencyKey per change), then validate and preview to judge the drawing, and give the person open_url's address; never print a token or an invitation's or a live session's link they did not ask for.",
    `The language and its rules are taught by the Meltemi Diagrams skill (${origin}/agent-setup).`,
  ].join(" ");
}
