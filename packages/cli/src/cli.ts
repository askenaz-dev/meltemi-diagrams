import {
  DEFAULT_LOCALE,
  isLocale,
  localeFromEnv,
  resolveLocale,
  setLocale,
  type Locale,
} from "@meltemi/diagrams-i18n";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { planEdit } from "@meltemi/diagrams-edit";
import {
  LANGUAGE_VERSION,
  applyTextEdits,
  formatSource,
  sortDiagnostics,
  type Diagnostic,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { BRAND_NAME, layoutDiagram } from "@meltemi/diagrams-layout";
import { convertOperation } from "@meltemi/diagrams-editor";
import { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { diagnosticsToJson, stringifyJson, toJson, type Point } from "@meltemi/diagrams-model";
import {
  Workspace,
  formatOptionsFor,
  projectTheme,
  themeDefinitionsFor,
  toProjectPath,
  type ProjectHost,
} from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { assetsCommand } from "./assets-command.js";
import { assistCommand } from "./assist-command.js";
import { buildCommand } from "./build-command.js";
import {
  cloudCommand,
  cloudContext,
  isCloudCommand,
  type CloudCommandIo,
} from "./cloud-command.js";
import type { CloudHooks } from "./cloud-context.js";
import { catalogScript } from "@meltemi/diagrams-catalog/node";
import { exportCommand, noDiagramDiagnostic } from "./export-command.js";
import { importCommand } from "./import-command.js";
import { initCommand } from "./init-command.js";
import { argumentsError, messages } from "./messages/index.js";
import { pluginsCommand } from "./plugins-command.js";
import { previewCommand } from "./preview.js";
import { reviewCommand } from "./review-command.js";

export { FONT_POLICIES, MOTION_MODES, WRITABLE_FORMATS, exportFileName } from "./export-command.js";

/** Command name (decision 0002). */
export const CLI_NAME = "meltemi-diagrams";
/** Short alias installed next to the full command name. */
export const CLI_ALIAS = "mdg";
/** Extension of `.meltemi` sources (decision 0002). */
export const MELTEMI_EXTENSION = ".meltemi";
export const CLI_VERSION = "1.8.0";

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;
/** The cloud commands: not signed in, or the service refused the token (run `login`). */
export const EXIT_AUTH = 3;

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** Where `assist` reads provider settings and keys; the process environment by default. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Asks a question in a terminal; absent when nobody can answer. */
  readonly ask?: (question: string) => Promise<string>;
  /** Reads standard input, for `login --token`; the binary passes it. */
  readonly stdin?: () => Promise<string>;
  /** What the cloud commands use besides the process: tests replace the network and the browser. */
  readonly cloud?: CloudHooks;
  /**
   * The system's language, for messages when neither `--lang` nor the environment names one;
   * the binary passes it. Written files never depend on it.
   */
  readonly locale?: string;
}

/** The language `--lang` asked for in this run: of the messages and of the files written. */
let contentLocale: Locale | undefined;

/** Project sessions of this run, writing content in the `--lang` language when given. */
function sessions(host?: ProjectHost): ProjectSessions {
  return new ProjectSessions({
    toolVersion: CLI_VERSION,
    ...(host ? { host } : {}),
    ...(contentLocale ? { locale: contentLocale } : {}),
  });
}

/**
 * Takes `--lang <en|es>` (or `--lang=<en|es>`) out of the arguments, wherever it is written:
 * every command accepts it.
 */
export function takeLang(
  argv: readonly string[],
): { args: string[]; lang: Locale | undefined } | { error: string } {
  const args: string[] = [];
  let lang: Locale | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = arg === "--lang" ? argv[++i] : arg.startsWith("--lang=") ? arg.slice(7) : null;
    if (value === null) {
      args.push(arg);
      continue;
    }
    if (!isLocale(value)) return { error: messages().common.lang };
    lang = value;
  }
  return { args, lang };
}

/** Runs the command line and returns the exit code; `assist`, which waits for a model, a promise of it. */
export function run(input: readonly string[], io: CliIo): number | Promise<number> {
  // Messages: `--lang`, else the environment, else the system; files: `--lang`, else the project.
  const machine =
    localeFromEnv(io.env ?? {}) ??
    (io.locale !== undefined ? resolveLocale(io.locale) : DEFAULT_LOCALE);
  setLocale(machine);
  const taken = takeLang(input);
  if ("error" in taken) {
    io.stderr(`${CLI_NAME}: ${taken.error}\n`);
    return EXIT_USAGE;
  }
  contentLocale = taken.lang;
  setLocale(taken.lang ?? machine);
  const argv = taken.args;
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    io.stdout(messages().help.main(CLI_NAME, CLI_ALIAS));
    return command === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (command === "-v" || command === "--version") {
    io.stdout(`${CLI_VERSION}\n`);
    return EXIT_OK;
  }
  if (command === "validate") return validate(rest, io);
  if (command === "export") {
    return exportCommand(rest, {
      name: CLI_NAME,
      io,
      display: (path) => displayPath(io.cwd, path),
      projects: () => sessions(),
      readSource: (path) => readSource(io, "export", path),
      projectDiagnostics,
      printDiagnostics: (out, path, diagnostics) =>
        printDiagnostics({ ...io, stdout: out }, path, diagnostics),
    });
  }
  if (command === "layout") return layoutCommand(rest, io);
  if (command === "convert") return convertCommand(rest, io);
  if (command === "format") return formatCommand(rest, io);
  if (command === "import") {
    const projects = sessions();
    return importCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      workspaceFor: (path) => projects.forFile(path),
      contentLocale: (workspace) => projects.contentLocale(workspace),
    });
  }
  if (command === "assets") {
    const projects = sessions();
    return assetsCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      workspaceFor: (path, isDirectory) =>
        isDirectory ? projects.forFolder(path) : projects.forFile(path),
      printProject: (workspace) => {
        let errors = false;
        for (const [path, diagnostics] of projectDiagnostics(workspace)) {
          printDiagnostics(io, displayPath(io.cwd, path), diagnostics);
          errors ||= diagnostics.some((d) => d.severity === "error");
        }
        return errors;
      },
    });
  }
  if (command === "assist") {
    return assistCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      toolVersion: CLI_VERSION,
      ...(contentLocale ? { locale: contentLocale } : {}),
      env: io.env ?? process.env,
      ...(io.ask ? { ask: io.ask } : {}),
    });
  }
  if (command === "init") {
    return initCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      toolVersion: CLI_VERSION,
      languageVersion: LANGUAGE_VERSION,
    });
  }
  if (command === "plugins") {
    const projects = sessions();
    return pluginsCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      workspaceFor: (path, isDirectory) =>
        isDirectory ? projects.forFolder(path) : projects.forFile(path),
      printDiagnostics: (path, diagnostics) => printDiagnostics(io, path, diagnostics),
    });
  }
  if (command === "preview") {
    return previewCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      projects: () => sessions(),
      generator: `${BRAND_NAME} ${CLI_VERSION}`,
      script: catalogScript,
      printDiagnostics: (path, diagnostics) => printDiagnostics(io, path, diagnostics),
    });
  }
  if (command === "review") {
    return reviewCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      toolVersion: CLI_VERSION,
      ...(contentLocale ? { locale: contentLocale } : {}),
      // For `--base cloud[:<n>]`; nothing is read from it, and no request made, otherwise.
      cloud: cloudContext("review", cloudIo(io)),
    });
  }
  if (command === "build") {
    return buildCommand(rest, {
      name: CLI_NAME,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      display: (path) => displayPath(io.cwd, path),
      projects: () => sessions(),
      generator: `${BRAND_NAME} ${CLI_VERSION}`,
      printProject: (workspace) => {
        let errors = false;
        for (const [path, diagnostics] of projectDiagnostics(workspace)) {
          printDiagnostics(io, displayPath(io.cwd, path), diagnostics);
          errors ||= diagnostics.some((d) => d.severity === "error");
        }
        return errors;
      },
      printDiagnostics: (path, diagnostics) => printDiagnostics(io, path, diagnostics),
    });
  }
  if (isCloudCommand(command)) return cloudCommand(command, rest, cloudIo(io));
  io.stderr(`${messages().common.unknownCommand(CLI_NAME, command)}\n`);
  return EXIT_USAGE;
}

/**
 * What the cloud commands need from a run: its streams, environment, terminal and hooks. A command
 * that is not a cloud command but talks to the service (`review --base cloud`) passes this to
 * `cloudContext` (`cloud-command.ts`).
 */
function cloudIo(io: CliIo): CloudCommandIo {
  return {
    name: CLI_NAME,
    stdout: io.stdout,
    stderr: io.stderr,
    cwd: io.cwd,
    display: (path) => displayPath(io.cwd, path),
    toolVersion: CLI_VERSION,
    env: io.env,
    ask: io.ask,
    stdin: io.stdin,
    cloud: io.cloud,
    locale: contentLocale,
  };
}

interface FileResult {
  readonly path: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** Diagnostics of `project.json`, of the project's plugins and of its assets, by file. */
function projectDiagnostics(workspace: Workspace): Map<string, readonly Diagnostic[]> {
  const manifest = workspace.manifest();
  const byPath = new Map<string, Diagnostic[]>();
  if (manifest.diagnostics.length > 0) byPath.set(manifest.path, [...manifest.diagnostics]);
  for (const [path, list] of [
    ...workspace.limits(),
    ...workspace.plugins().diagnostics,
    ...workspace.assets().diagnostics,
  ]) {
    byPath.set(path, [...(byPath.get(path) ?? []), ...list]);
  }
  return new Map([...byPath].map(([path, list]) => [path, sortDiagnostics(list)]));
}

function printDiagnostics(io: CliIo, path: string, diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) {
    io.stdout(
      `${path}:${d.range.start.line}:${d.range.start.column}: ${d.severity} ${d.code} ${d.message}\n`,
    );
    for (const hint of d.hints ?? []) io.stdout(`    ${messages().common.hint}: ${hint}\n`);
  }
}

function readSource(
  io: CliIo,
  command: string,
  path: string,
): { file: string; text: string } | undefined {
  const file = isAbsolute(path) ? path : resolve(io.cwd, path);
  try {
    return { file, text: readFileSync(file, "utf8") };
  } catch (error) {
    io.stderr(
      `${CLI_NAME} ${command}: ${messages().common.cannotRead(path, (error as Error).message)}\n`,
    );
    return undefined;
  }
}

// ---------------------------------------------------------------------------- validate

function validate(args: readonly string[], io: CliIo): number {
  let options: { json: boolean; strict: boolean; help: boolean };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        json: { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    io.stderr(`${CLI_NAME} validate: ${argumentsError(error)}\n`);
    return EXIT_USAGE;
  }
  if (options.help) {
    io.stdout(messages().help.main(CLI_NAME, CLI_ALIAS));
    return EXIT_OK;
  }
  if (paths.length === 0) {
    io.stderr(`${CLI_NAME} validate: ${messages().common.atLeastOnePath}\n`);
    return EXIT_USAGE;
  }

  const host = createNodeHost();
  const projects = sessions(host);
  /** A file's diagnostics with the composition of its diagrams, as the editor shows them. */
  const withComposition = (diagnostics: readonly Diagnostic[], file: string): Diagnostic[] => {
    const layout = projects.analyze(file).diagnostics.filter((d) => d.code.startsWith("layout."));
    const seen = new Set(diagnostics.map((d) => `${d.code}@${d.range.start.offset}|${d.message}`));
    return sortDiagnostics([
      ...diagnostics,
      ...layout.filter((d) => !seen.has(`${d.code}@${d.range.start.offset}|${d.message}`)),
    ]);
  };
  const results: FileResult[] = [];
  const reported = new Set<string>();
  const add = (path: string, diagnostics: readonly Diagnostic[]) => {
    if (reported.has(path)) return;
    reported.add(path);
    results.push({ path: displayPath(io.cwd, path), diagnostics });
  };
  const addManifest = (workspace: Workspace) => {
    for (const [path, diagnostics] of projectDiagnostics(workspace)) add(path, diagnostics);
  };
  for (const path of paths) {
    const absolute = toProjectPath(isAbsolute(path) ? path : resolve(io.cwd, path));
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      io.stderr(`${CLI_NAME} validate: ${messages().common.pathNotFound(path)}\n`);
      return EXIT_USAGE;
    }
    if (stats.isDirectory()) {
      const workspace = projects.forFolder(absolute);
      addManifest(workspace);
      const program = workspace.compileProject();
      for (const [file, compiled] of program.files) {
        if (file === absolute || file.startsWith(`${absolute}/`)) {
          add(file, withComposition(compiled.diagnostics, file));
        }
      }
    } else {
      const workspace = projects.forFile(absolute);
      if (workspace.text(absolute) === undefined) {
        io.stderr(`${CLI_NAME} validate: ${messages().common.cannotRead(path)}\n`);
        return EXIT_USAGE;
      }
      addManifest(workspace);
      add(absolute, withComposition(workspace.file(absolute)!.diagnostics, absolute));
    }
  }

  const all = results.flatMap((r) => r.diagnostics);
  const summary = {
    files: results.length,
    errors: all.filter((d) => d.severity === "error").length,
    warnings: all.filter((d) => d.severity === "warning").length,
    infos: all.filter((d) => d.severity === "info").length,
  };

  if (options.json) {
    io.stdout(
      stringifyJson({
        files: results.map((r) => ({
          path: r.path,
          diagnostics: diagnosticsToJson(r.diagnostics),
        })),
        summary,
      }),
    );
  } else {
    for (const result of results) printDiagnostics(io, result.path, result.diagnostics);
    io.stdout(`${messages().validate.summary(summary.files, summary.errors, summary.warnings)}\n`);
  }

  const failed = summary.errors > 0 || (options.strict && summary.warnings > 0);
  return failed ? EXIT_FINDINGS : EXIT_OK;
}

// ---------------------------------------------------------------------------- layout

/**
 * Arranges diagrams with ELK and writes the result as `place` statements: for unplaced elements
 * around the placed ones (as `layout assisted` renders them), or for every element with `--all`.
 */
function layoutCommand(args: readonly string[], io: CliIo): number {
  let options: { diagram?: string; all: boolean; check: boolean; stdout: boolean; help: boolean };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        diagram: { type: "string" },
        all: { type: "boolean", default: false },
        check: { type: "boolean", default: false },
        stdout: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    io.stderr(`${CLI_NAME} layout: ${argumentsError(error)}\n`);
    return EXIT_USAGE;
  }
  if (options.help) {
    io.stdout(messages().help.main(CLI_NAME, CLI_ALIAS));
    return EXIT_OK;
  }
  if (paths.length !== 1) {
    io.stderr(`${CLI_NAME} layout: ${messages().common.oneMeltemiFile}\n`);
    return EXIT_USAGE;
  }
  if (options.stdout && options.check) {
    io.stderr(`${CLI_NAME} layout: ${messages().common.cannotCombine("--stdout", "--check")}\n`);
    return EXIT_USAGE;
  }

  const source = readSource(io, "layout", paths[0]!);
  if (!source) return EXIT_USAGE;
  // With --stdout, stdout holds only the output; diagnostics go to stderr.
  const log: CliIo = options.stdout ? { ...io, stdout: io.stderr } : io;
  const path = displayPath(io.cwd, source.file);
  const projectPath = toProjectPath(source.file);
  const projects = sessions();
  const workspace = projects.forFile(projectPath);
  const file = workspace.file(projectPath)!;
  const compilation = file.compilation;
  const errors = (list: readonly Diagnostic[]) => list.filter((d) => d.severity === "error");
  printDiagnostics(log, path, errors(file.diagnostics));
  let failed = errors(file.diagnostics).length > 0;

  const renderable = compilation.document.diagrams.filter((d) => !d.hasErrors);
  let selected = renderable;
  if (options.diagram !== undefined) {
    selected = renderable.filter((d) => d.id === options.diagram);
    if (selected.length === 0) {
      const available = renderable.map((d) => d.id);
      io.stderr(
        `${CLI_NAME} layout: ${messages().common.noDiagram(options.diagram, path, available)}\n`,
      );
      return EXIT_USAGE;
    }
  }
  if (selected.length === 0) {
    printDiagnostics(log, path, [noDiagramDiagnostic(compilation)]);
    return EXIT_FINDINGS;
  }

  const scope = options.all ? "all" : "unplaced";
  const edits: TextEdit[] = [];
  const changed: string[] = [];
  for (const diagram of selected) {
    // Sequence diagrams are laid out from the order of their events; they hold no positions.
    if (diagram.type === "sequence") {
      if (options.diagram !== undefined) {
        io.stderr(`${CLI_NAME} layout: ${messages().layout.sequence(diagram.id)}\n`);
        return EXIT_USAGE;
      }
      continue;
    }
    const result = layoutDiagram(compilation, diagram, {
      defaultTheme: projectTheme(file.program),
      themes: themeDefinitionsFor(file),
      measurer: projects.fontsFor(workspace),
      icons: workspace.assets().registry,
      engine: projects.engine,
      images: workspace.imageResolver(projectPath),
      // What `layout assisted` would draw, or a fresh arrangement of everything.
      layout: options.all ? "auto" : "assisted",
    });
    printDiagnostics(log, path, errors(result.diagnostics));
    if (!result.scene || !result.boxes) {
      failed = true;
      continue;
    }
    const positions = new Map<string, Point>();
    const sizes = new Map<string, { width: number; height: number }>();
    // Free diagrams place group children inside their group, and give groups a place and a size.
    const free = diagram.type === "free";
    for (const element of diagram.elements) {
      const box = result.boxes.get(element.id);
      if (!box) continue;
      const origin = free ? result.origins?.get(element.id) : undefined;
      positions.set(element.id, {
        x: box.x + box.width / 2 - (origin?.x ?? 0),
        y: box.y + box.height / 2 - (origin?.y ?? 0),
      });
      if (element.kind === "group") sizes.set(element.id, { width: box.width, height: box.height });
    }
    // `--all` also writes the bends of the connectors the engine drew.
    const routes =
      options.all && result.connectors
        ? new Map([...result.connectors].map(([key, c]) => [key, c.points]))
        : undefined;
    const planned = planEdit(compilation, {
      kind: "arrange",
      diagram: diagram.id,
      positions,
      sizes,
      ...(routes ? { routes } : {}),
      scope,
      ...(free ? { writeGroups: true } : {}),
    });
    if (!planned.ok) {
      io.stderr(
        `${CLI_NAME} layout: ${messages().layout.cannotWrite(diagram.id, planned.rejection.reason)}\n`,
      );
      failed = true;
      continue;
    }
    if (planned.plan.edits.length === 0) continue;
    edits.push(...planned.plan.edits);
    changed.push(diagram.id);
  }

  const text = applyTextEdits(compilation.text, edits);
  if (options.stdout) {
    io.stdout(text);
    return failed ? EXIT_FINDINGS : EXIT_OK;
  }
  if (changed.length === 0) {
    io.stdout(`${messages().layout.unchanged(path)}\n`);
    return failed ? EXIT_FINDINGS : EXIT_OK;
  }
  if (options.check) {
    io.stdout(`${messages().layout.wouldArrange(changed, path)}\n`);
    return EXIT_FINDINGS;
  }
  try {
    writeFileSync(source.file, text, "utf8");
  } catch (error) {
    io.stderr(
      `${CLI_NAME} layout: ${messages().common.cannotWrite(path, (error as Error).message)}\n`,
    );
    return EXIT_USAGE;
  }
  io.stdout(`${messages().layout.arranged(changed, path)}\n`);
  return failed ? EXIT_FINDINGS : EXIT_OK;
}

// ---------------------------------------------------------------------------- convert

/**
 * Copies a flow diagram, laid out as `export` draws it, into a new free diagram after it, with
 * every object linked to its source (decision 0018); or writes a file's model JSON.
 */
function convertCommand(args: readonly string[], io: CliIo): number {
  let options: {
    to?: string;
    out?: string;
    diagram?: string;
    id?: string;
    check: boolean;
    stdout: boolean;
    help: boolean;
  };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        to: { type: "string" },
        out: { type: "string" },
        diagram: { type: "string" },
        id: { type: "string" },
        check: { type: "boolean", default: false },
        stdout: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    io.stderr(`${CLI_NAME} convert: ${argumentsError(error)}\n`);
    return EXIT_USAGE;
  }
  if (options.help) {
    io.stdout(messages().help.main(CLI_NAME, CLI_ALIAS));
    return EXIT_OK;
  }
  if (options.to === "json") return convertToJson(paths, options, io);
  if (options.to !== "free") {
    io.stderr(`${CLI_NAME} convert: ${messages().convert.giveTo}\n`);
    return EXIT_USAGE;
  }
  if (options.out !== undefined) {
    io.stderr(`${CLI_NAME} convert: ${messages().convert.outWithJson}\n`);
    return EXIT_USAGE;
  }
  if (paths.length !== 1) {
    io.stderr(`${CLI_NAME} convert: ${messages().common.oneMeltemiFile}\n`);
    return EXIT_USAGE;
  }
  if (options.stdout && options.check) {
    io.stderr(`${CLI_NAME} convert: ${messages().common.cannotCombine("--stdout", "--check")}\n`);
    return EXIT_USAGE;
  }
  const source = readSource(io, "convert", paths[0]!);
  if (!source) return EXIT_USAGE;
  const log: CliIo = options.stdout ? { ...io, stdout: io.stderr } : io;
  const path = displayPath(io.cwd, source.file);
  const projects = sessions();
  const analysis = projects.analyze(toProjectPath(source.file));
  const flows = analysis.diagrams.filter((d) => d.diagram.type === "flow");
  let chosen: (typeof flows)[number] | undefined = flows[0];
  if (options.diagram !== undefined) {
    chosen = flows.find((d) => d.id === options.diagram);
    if (!chosen) {
      const available = flows.map((d) => d.id);
      io.stderr(
        `${CLI_NAME} convert: ${messages().convert.noFlowDiagram(options.diagram, path, available)}\n`,
      );
      return EXIT_USAGE;
    }
  } else if (flows.length !== 1) {
    const ids = flows.map((d) => d.id);
    io.stderr(
      `${CLI_NAME} convert: ${ids.length === 0 ? messages().convert.noFlow(path) : messages().convert.severalFlows(path, ids)}\n`,
    );
    return EXIT_USAGE;
  }
  const diagram = chosen!;
  const operation = convertOperation(analysis, diagram.id, options.id);
  if (!operation) {
    const problems = analysis.diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        d.range.start.offset >= diagram.diagram.node.start &&
        d.range.start.offset <= diagram.diagram.node.end,
    );
    printDiagnostics(log, path, problems);
    io.stderr(`${CLI_NAME} convert: ${messages().convert.cannotDraw(diagram.id)}\n`);
    return EXIT_FINDINGS;
  }
  const planned = planEdit(analysis.compilation, operation);
  if (!planned.ok) {
    io.stderr(`${CLI_NAME} convert: ${planned.rejection.reason}\n`);
    return planned.rejection.code === "edit.id-conflict" ? EXIT_USAGE : EXIT_FINDINGS;
  }
  const text = applyTextEdits(analysis.text, planned.plan.edits);
  if (options.stdout) {
    io.stdout(text);
    return EXIT_OK;
  }
  if (options.check) {
    io.stdout(`${messages().convert.wouldConvert(diagram.id, operation.id, path)}\n`);
    return EXIT_FINDINGS;
  }
  try {
    writeFileSync(source.file, text, "utf8");
  } catch (error) {
    io.stderr(
      `${CLI_NAME} convert: ${messages().common.cannotWrite(path, (error as Error).message)}\n`,
    );
    return EXIT_USAGE;
  }
  io.stdout(`${messages().convert.converted(diagram.id, operation.id, path)}\n`);
  return EXIT_OK;
}

/**
 * `convert --to json`: the model JSON of a file (format `model-json`), the interchange format for
 * other tools. Diagrams with errors are left out and their problems are in `diagnostics`; the
 * command exits 1 then.
 */
function convertToJson(
  paths: readonly string[],
  options: { out?: string; diagram?: string; id?: string; check: boolean; stdout: boolean },
  io: CliIo,
): number {
  const clash =
    options.diagram !== undefined
      ? "--diagram"
      : options.id !== undefined
        ? "--id"
        : options.check
          ? "--check"
          : null;
  if (clash) {
    io.stderr(`${CLI_NAME} convert: ${messages().convert.notForJson(clash)}\n`);
    return EXIT_USAGE;
  }
  if (paths.length !== 1) {
    io.stderr(`${CLI_NAME} convert: ${messages().common.oneMeltemiFile}\n`);
    return EXIT_USAGE;
  }
  if (options.stdout && options.out !== undefined) {
    io.stderr(`${CLI_NAME} convert: ${messages().common.cannotCombine("--stdout", "--out")}\n`);
    return EXIT_USAGE;
  }
  const source = readSource(io, "convert", paths[0]!);
  if (!source) return EXIT_USAGE;
  const projects = sessions();
  const analysis = projects.analyze(toProjectPath(source.file));
  const json = stringifyJson(toJson(analysis.compilation));
  const ok = analysis.compilation.ok;
  if (options.stdout) {
    io.stdout(json);
    return ok ? EXIT_OK : EXIT_FINDINGS;
  }
  const target =
    options.out === undefined
      ? `${source.file.replace(/\.meltemi$/i, "")}.model.json`
      : isAbsolute(options.out)
        ? options.out
        : resolve(io.cwd, options.out);
  try {
    writeFileSync(target, json, "utf8");
  } catch (error) {
    io.stderr(
      `${CLI_NAME} convert: ${messages().common.cannotWrite(displayPath(io.cwd, target), (error as Error).message)}\n`,
    );
    return EXIT_USAGE;
  }
  io.stdout(
    `${messages().convert.wroteJson(displayPath(io.cwd, source.file), displayPath(io.cwd, target), ok)}\n`,
  );
  return ok ? EXIT_OK : EXIT_FINDINGS;
}

// ---------------------------------------------------------------------------- format

function formatCommand(args: readonly string[], io: CliIo): number {
  let options: { check: boolean; stdout: boolean; help: boolean };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        check: { type: "boolean", default: false },
        stdout: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    io.stderr(`${CLI_NAME} format: ${argumentsError(error)}\n`);
    return EXIT_USAGE;
  }
  if (options.help) {
    io.stdout(messages().help.main(CLI_NAME, CLI_ALIAS));
    return EXIT_OK;
  }
  if (paths.length === 0) {
    io.stderr(`${CLI_NAME} format: ${messages().common.atLeastOnePath}\n`);
    return EXIT_USAGE;
  }
  if (options.stdout && (paths.length !== 1 || options.check)) {
    io.stderr(`${CLI_NAME} format: ${messages().format.stdoutOne}\n`);
    return EXIT_USAGE;
  }

  const projects = sessions();
  const targets: { file: string; workspace: Workspace }[] = [];
  for (const path of paths) {
    const absolute = toProjectPath(isAbsolute(path) ? path : resolve(io.cwd, path));
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      io.stderr(`${CLI_NAME} format: ${messages().common.pathNotFound(path)}\n`);
      return EXIT_USAGE;
    }
    if (stats.isDirectory()) {
      if (options.stdout) {
        io.stderr(`${CLI_NAME} format: ${messages().format.stdoutOneFile}\n`);
        return EXIT_USAGE;
      }
      const workspace = projects.forFolder(absolute);
      for (const file of workspace.sources()) {
        if (file.startsWith(`${absolute}/`)) targets.push({ file, workspace });
      }
    } else {
      targets.push({ file: absolute, workspace: projects.forFile(absolute) });
    }
  }

  const seen = new Set<string>();
  let refused = 0;
  let changed = 0;
  let total = 0;
  for (const { file, workspace } of targets) {
    if (seen.has(file)) continue;
    seen.add(file);
    total++;
    const shown = displayPath(io.cwd, file);
    const text = workspace.text(file);
    if (text === undefined) {
      io.stderr(`${CLI_NAME} format: ${messages().common.cannotRead(shown)}\n`);
      return EXIT_USAGE;
    }
    const result = formatSource(text, formatOptionsFor(workspace.manifest().manifest));
    if (!result.ok) {
      refused++;
      printDiagnostics(io, shown, result.diagnostics);
      io.stdout(`${shown}:1:1: error format.syntax-errors ${messages().format.syntaxErrors}\n`);
      continue;
    }
    if (options.stdout) {
      io.stdout(result.text);
      continue;
    }
    if (!result.changed) continue;
    changed++;
    if (options.check) {
      io.stdout(`${messages().format.wouldFormat(shown)}\n`);
      continue;
    }
    try {
      writeFileSync(file, result.text, "utf8");
    } catch (error) {
      io.stderr(
        `${CLI_NAME} format: ${messages().common.cannotWrite(shown, (error as Error).message)}\n`,
      );
      return EXIT_USAGE;
    }
    io.stdout(`${messages().format.formatted(shown)}\n`);
  }

  if (!options.stdout) {
    const t = messages().format;
    if (options.check) {
      io.stdout(
        `${changed === 0 && refused === 0 ? t.checkedAll(total) : t.checked(total, changed, refused)}\n`,
      );
    } else {
      io.stdout(`${t.summary(changed, total)}\n`);
    }
  }
  if (refused > 0 || (options.check && changed > 0)) return EXIT_FINDINGS;
  return EXIT_OK;
}

function displayPath(cwd: string, file: string): string {
  const rel = relative(cwd, file);
  return (rel === "" ? "." : rel).split(sep).join("/");
}
