import { statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { LOCK_NAME, formatLock, searchIcons } from "@meltemi/diagrams-assets";
import { BUNDLED_FAMILIES, FONT_GROUPS } from "@meltemi/diagrams-fonts";
import { joinPath, toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { argumentsError, messages } from "./messages/index.js";

/** What the assets command needs from the CLI: output, paths, project lookup and diagnostics. */
export interface AssetsContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  readonly workspaceFor: (path: string, isDirectory: boolean) => Workspace;
  /** Prints the manifest and asset diagnostics of a project; returns whether there are errors. */
  readonly printProject: (workspace: Workspace) => boolean;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;

function project(
  context: AssetsContext,
  path: string | undefined,
  command: string,
): Workspace | undefined {
  const absolute = toProjectPath(resolve(context.cwd, path ?? "."));
  let isDirectory: boolean;
  try {
    isDirectory = statSync(absolute).isDirectory();
  } catch {
    context.stderr(
      `${context.name} assets ${command}: ${messages().common.pathNotFound(path ?? ".")}\n`,
    );
    return undefined;
  }
  return context.workspaceFor(absolute, isDirectory);
}

/** `meltemi-diagrams assets list|icons|lock`. */
export function assetsCommand(args: readonly string[], context: AssetsContext): number {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined || subcommand === "-h" || subcommand === "--help") {
    context.stdout(messages().help.assets);
    return subcommand === undefined ? EXIT_USAGE : EXIT_OK;
  }
  let values: { project?: string; limit?: string };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...rest],
      options: { project: { type: "string" }, limit: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    context.stderr(`${context.name} assets: ${argumentsError(error)}\n`);
    return EXIT_USAGE;
  }
  switch (subcommand) {
    case "list":
      return list(context, positionals[0]);
    case "icons":
      return icons(context, positionals.join(" "), values.project, values.limit);
    case "lock":
      return lock(context, positionals[0]);
    default:
      context.stderr(
        `${context.name} assets: ${messages().assets.unknownSubcommand(subcommand)}\n`,
      );
      return EXIT_USAGE;
  }
}

/** `assets list`: the bundled fonts, the icon packs and aliases, and the project's fonts. */
function list(context: AssetsContext, path: string | undefined): number {
  const workspace = project(context, path, "list");
  if (!workspace) return EXIT_USAGE;
  const assets = workspace.assets();
  const t = messages().assets;
  // The families every diagram can be measured, embedded and outlined with (decision 0067).
  const bundled = [...BUNDLED_FAMILIES]
    .map((family, index) => ({ family, index }))
    .sort(
      (a, b) =>
        FONT_GROUPS.indexOf(a.family.group) - FONT_GROUPS.indexOf(b.family.group) ||
        a.index - b.index,
    )
    .map(({ family }) => [
      family.family,
      t.fontGroups[family.group],
      family.weights.join(" "),
      family.license,
    ]);
  context.stdout(`${t.bundledFonts}\n`);
  context.stdout(table(bundled));
  const rows: string[][] = [];
  for (const pack of assets.registry.list()) {
    const meta = pack.metadata;
    rows.push([
      pack.prefix,
      meta.version ?? "-",
      meta.source,
      meta.license ?? t.noLicence,
      t.icons(pack.names().length),
      meta.redistribute ? "" : t.noRedistribution,
    ]);
  }
  context.stdout(`${t.packs}\n`);
  context.stdout(table(rows));
  const aliases = Object.entries(assets.registry.aliasList());
  if (aliases.length > 0) {
    context.stdout(`${t.aliases}\n`);
    for (const [alias, target] of aliases.sort()) context.stdout(`  ${alias} -> ${target}\n`);
  }
  if (assets.fonts.length > 0) {
    context.stdout(`${t.fonts}\n`);
    context.stdout(
      table(
        assets.fonts.map((font) => [
          font.family ?? "?",
          String(font.weight ?? "-"),
          font.style ?? "-",
          font.relative,
          font.license ?? t.noLicence,
          font.restricted ? t.noEmbedding : "",
        ]),
      ),
    );
  }
  return context.printProject(workspace) ? EXIT_FINDINGS : EXIT_OK;
}

function table(rows: readonly string[][]): string {
  const widths: number[] = [];
  for (const row of rows)
    row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows
    .map(
      (row) =>
        `  ${row
          .map((cell, i) => cell.padEnd(widths[i]!))
          .join("  ")
          .trimEnd()}\n`,
    )
    .join("");
}

function icons(
  context: AssetsContext,
  query: string,
  projectPath: string | undefined,
  limitText: string | undefined,
): number {
  if (query.trim() === "") {
    context.stderr(`${context.name} assets icons: ${messages().assets.noWords}\n`);
    return EXIT_USAGE;
  }
  const limit = limitText === undefined ? 50 : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1) {
    context.stderr(`${context.name} assets icons: ${messages().assets.limit}\n`);
    return EXIT_USAGE;
  }
  const workspace = project(context, projectPath, "icons");
  if (!workspace) return EXIT_USAGE;
  const found = searchIcons(workspace.assets().registry, query, limit);
  for (const reference of found) context.stdout(`${reference}\n`);
  if (found.length === 0) {
    context.stderr(`${messages().assets.noMatch(query)}\n`);
    return EXIT_FINDINGS;
  }
  return EXIT_OK;
}

function lock(context: AssetsContext, path: string | undefined): number {
  const workspace = project(context, path, "lock");
  if (!workspace) return EXIT_USAGE;
  const target = joinPath(workspace.root, LOCK_NAME);
  try {
    writeFileSync(target, formatLock(workspace.assets().lock), "utf8");
  } catch (error) {
    context.stderr(
      `${context.name} assets lock: ${messages().common.cannotWrite(target, (error as Error).message)}\n`,
    );
    return EXIT_USAGE;
  }
  workspace.invalidate(target);
  context.stdout(`${messages().common.wrote(context.display(target))}\n`);
  return EXIT_OK;
}
