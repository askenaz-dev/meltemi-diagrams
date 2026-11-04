/**
 * `projects` (`cli-cloud`, "Projects and review against the cloud"): the person's cloud projects
 * with id, name, role and last change, most recent first, as a table or as JSON.
 *
 * The JSON is one object whose field names are the service's own and are stable:
 * `{ "host": "<origin>", "projects": [{ "id", "name", "description", "role", "updated_at" }] }`,
 * `role` being `owner`, `editor` or `viewer` and `updated_at` an ISO 8601 time in UTC. The table is
 * for people: its words follow the interface language, and a name that holds a control character
 * (an escape sequence in a project somebody shared) is printed with spaces instead.
 */

import { parseArgs } from "node:util";
import { openCloud, usage, usageError, type CloudCommand } from "./cloud-context.js";
import type { CloudProject } from "./cloud-client.js";
import { EXIT_OK } from "./cloud-errors.js";
import { messages } from "./messages/index.js";

/** Text safe for a terminal: control characters (C0, DEL and C1) become spaces. */
function plain(text: string): string {
  return Array.from(text, (character) => {
    const code = character.codePointAt(0)!;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : character;
  }).join("");
}

/** A time as the table shows it: ISO 8601 in UTC to the second, `2026-10-15T09:41:02Z`. */
function shown(time: string): string {
  return plain(time.replace(/\.\d+Z$/, "Z"));
}

/** The table, columns padded to the width of their widest cell. */
function table(projects: readonly CloudProject[]): string {
  const t = messages().cloud.projects;
  const rows = [
    [t.header.id, t.header.name, t.header.role, t.header.changed],
    ...projects.map((p) => [plain(p.id), plain(p.name), t.roles[p.role], shown(p.updated_at)]),
  ];
  const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows
    .map((row) =>
      [...row.slice(0, 3).map((cell, i) => cell.padEnd(widths[i]!)), row[3]!].join("  ").trimEnd(),
    )
    .join("\n");
}

export const projectsCommand: CloudCommand = async (args, context) => {
  const help = messages().help.projects;
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        json: { type: "boolean", default: false },
        host: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      } as const,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageError(context, error, help);
  }
  if (parsed.values.help) {
    context.stdout(help);
    return EXIT_OK;
  }
  if (parsed.positionals.length > 0) {
    return usage(context, messages().cloud.noArguments(context.command), help);
  }
  const { host, client } = openCloud(context, { host: parsed.values.host });
  const projects = await client.projects();
  if (parsed.values.json) {
    context.stdout(
      `${JSON.stringify(
        {
          host,
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            role: p.role,
            updated_at: p.updated_at,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return EXIT_OK;
  }
  if (projects.length === 0) {
    context.stdout(`${messages().cloud.projects.none(context.name)}\n`);
    return EXIT_OK;
  }
  context.stdout(`${table(projects)}\n`);
  return EXIT_OK;
};
