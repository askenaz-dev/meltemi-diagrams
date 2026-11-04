import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import { catalogScript } from "@meltemi/diagrams-catalog/node";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { buildCatalog, type ProjectSessions } from "@meltemi/diagrams-editor/node";
import { decimal, getLocale } from "@meltemi/diagrams-i18n";
import { toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { argumentsError, messages } from "./messages/index.js";

/** What the build command needs from the CLI: output, paths, projects and diagnostics. */
export interface BuildContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  readonly projects: () => ProjectSessions;
  /** The generator the catalog names, such as `Meltemi Diagrams 1.0.0`. */
  readonly generator: string;
  /** Prints the manifest and asset diagnostics of a project; returns whether there are errors. */
  readonly printProject: (workspace: Workspace) => boolean;
  readonly printDiagnostics: (path: string, diagnostics: readonly Diagnostic[]) => void;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;

/** A size for people: bytes, KB or MB, with the decimal sign of the interface language. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  const locale = getLocale();
  // English keeps its one fixed decimal ("2.0 MB"); Spanish writes "2 MB" and "2,5 MB".
  return `${locale === "en" ? megabytes.toFixed(1) : decimal(locale, megabytes)} MB`;
}

/** `meltemi-diagrams build catalog`. */
export function buildCommand(args: readonly string[], context: BuildContext): number {
  const [target, ...rest] = args;
  if (target === undefined || target === "-h" || target === "--help") {
    context.stdout(messages().help.build);
    return target === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (target !== "catalog") {
    context.stderr(`${context.name} build: ${messages().build.unknownTarget(target)}\n`);
    return EXIT_USAGE;
  }
  let values: { out?: string; title?: string; source: boolean; help: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...rest],
      options: {
        out: { type: "string" },
        title: { type: "string" },
        source: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as typeof values;
    positionals = parsed.positionals;
  } catch (error) {
    context.stderr(`${context.name} build catalog: ${argumentsError(error)}\n`);
    return EXIT_USAGE;
  }
  if (values.help) {
    context.stdout(messages().help.build);
    return EXIT_OK;
  }
  if (positionals.length > 1) {
    context.stderr(`${context.name} build catalog: ${messages().common.oneProject}\n`);
    return EXIT_USAGE;
  }
  if (values.title !== undefined && values.title.trim() === "") {
    context.stderr(`${context.name} build catalog: ${messages().build.title}\n`);
    return EXIT_USAGE;
  }
  const path = positionals[0] ?? ".";
  const absolute = toProjectPath(resolve(context.cwd, path));
  let isDirectory: boolean;
  try {
    isDirectory = statSync(absolute).isDirectory();
  } catch {
    context.stderr(`${context.name} build catalog: ${messages().common.pathNotFound(path)}\n`);
    return EXIT_USAGE;
  }
  const projects = context.projects();
  const workspace = isDirectory ? projects.forFolder(absolute) : projects.forFile(absolute);
  const out =
    values.out === undefined
      ? undefined
      : toProjectPath(isAbsolute(values.out) ? values.out : resolve(context.cwd, values.out));

  let errors = context.printProject(workspace);
  const build = buildCatalog(workspace, projects, {
    ...(out !== undefined ? { out } : {}),
    ...(values.title !== undefined ? { title: values.title.trim() } : {}),
    ...(values.source ? { source: true } : {}),
    generator: context.generator,
    script: catalogScript,
  });
  for (const [file, diagnostics] of [...build.diagnostics].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    context.printDiagnostics(context.display(file), diagnostics);
    errors ||= diagnostics.some((d) => d.severity === "error");
  }
  const t = messages().build;
  for (const entry of build.skipped) {
    context.stderr(
      `${context.name} build catalog: ${t.skipped(`${context.display(entry.path)}#${entry.id}`, entry.reason)}\n`,
    );
  }
  for (const warning of build.warnings) {
    context.stderr(`${context.name} build catalog: ${t.warning(warning)}\n`);
  }
  const { entries, entities } = build.data;
  if (entries.length === 0) {
    context.stderr(`${context.name} build catalog: ${t.empty(context.display(workspace.root))}\n`);
    return build.skipped.length > 0 ? EXIT_FINDINGS : EXIT_USAGE;
  }
  try {
    mkdirSync(dirname(build.out), { recursive: true });
    writeFileSync(build.out, build.html);
  } catch (error) {
    context.stderr(
      `${context.name} build catalog: ${messages().common.cannotWrite(context.display(build.out), (error as Error).message)}\n`,
    );
    return EXIT_USAGE;
  }
  const diagrams = entries.filter((e) => e.kind === "diagram").length;
  const parts = [
    t.diagrams(diagrams),
    t.stories(entries.length - diagrams),
    ...(entities.length > 0 ? [t.entities(entities.length)] : []),
  ];
  context.stdout(
    `${t.wrote(context.display(build.out), parts, formatSize(Buffer.byteLength(build.html)))}\n`,
  );
  return errors || build.skipped.length > 0 ? EXIT_FINDINGS : EXIT_OK;
}
