import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  IMPORT_EXTENSIONS,
  importText,
  mergeImport,
  stemOf,
  type ImportFinding,
  type ImportFormat,
} from "@meltemi/diagrams-import";
import type { Locale } from "@meltemi/diagrams-i18n";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { argumentsError, messages } from "./messages/index.js";

/** What the import command needs from the CLI. */
export interface ImportContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  readonly workspaceFor: (path: string) => Workspace;
  /**
   * The language of the words the importer writes into a sheet: `--lang`, else the project's
   * `locale`, else English.
   */
  readonly contentLocale: (workspace: Workspace) => Locale;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;
const FORMATS: readonly ImportFormat[] = ["mermaid", "plantuml", "markdown"];

interface ImportOptions {
  readonly from?: string;
  readonly force: boolean;
  readonly merge: boolean;
  readonly check: boolean;
  readonly json: boolean;
}

/** The outcome of one file, as `--json` prints it. */
interface FileReport {
  readonly source: string;
  readonly output: string;
  readonly status: "complete" | "partial" | "failed";
  readonly written: boolean;
  readonly refused: boolean;
  readonly diagrams: unknown;
  readonly findings: readonly ImportFinding[];
  readonly merge: readonly Diagnostic[];
  readonly coverage: readonly {
    readonly diagram: string;
    readonly mapped: number;
    readonly approximated: number;
    readonly dropped: number;
  }[];
}

/** Every importable file below a folder, sorted; hidden folders and `node_modules` are skipped. */
function importableFiles(folder: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const extension = entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase();
        // Include files are imported through the files that include them.
        if (extension !== "iuml" && IMPORT_EXTENSIONS.includes(extension)) found.push(path);
      }
    }
  };
  walk(folder);
  return found.sort();
}

/** `meltemi-diagrams import <file or folder>`. */
export function importCommand(args: readonly string[], context: ImportContext): number {
  const fail = (message: string) => {
    context.stderr(`${context.name} import: ${message}\n`);
    return EXIT_USAGE;
  };
  let options: ImportOptions & { out?: string; help: boolean };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        from: { type: "string" },
        out: { type: "string" },
        force: { type: "boolean", default: false },
        merge: { type: "boolean", default: false },
        check: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    return fail(argumentsError(error));
  }
  const t = messages().import;
  if (options.help) {
    context.stdout(messages().help.import);
    return EXIT_OK;
  }
  if (paths.length !== 1) return fail(t.oneSource);
  if (options.from !== undefined && !FORMATS.includes(options.from as ImportFormat)) {
    return fail(t.from(options.from, FORMATS));
  }
  if (options.force && options.merge) return fail(t.forceAndMerge);
  const source = isAbsolute(paths[0]!) ? paths[0]! : resolve(context.cwd, paths[0]!);
  let folder = false;
  try {
    folder = statSync(source).isDirectory();
  } catch {
    // Reading the file reports it.
  }
  if (!folder) {
    const out =
      options.out !== undefined
        ? resolve(context.cwd, options.out)
        : join(dirname(source), `${stemOf(source)}.meltemi`);
    const result = importFile(context, source, out, options, false);
    if (typeof result === "string") return fail(result);
    if (options.json) {
      const { refused: _refused, ...report } = result;
      context.stdout(`${JSON.stringify(report, null, 2)}\n`);
    }
    if (result.refused || result.status === "failed") return EXIT_USAGE;
    return result.status === "partial" ? EXIT_FINDINGS : EXIT_OK;
  }

  if (options.from !== undefined) return fail(t.fromInFolder);
  const files = importableFiles(source);
  if (files.length === 0) return fail(t.noSources(context.display(source)));
  const outRoot = options.out === undefined ? null : resolve(context.cwd, options.out);
  const reports: FileReport[] = [];
  let passed = 0;
  for (const file of files) {
    const out =
      outRoot === null
        ? join(dirname(file), `${stemOf(file)}.meltemi`)
        : join(outRoot, dirname(relative(source, file)), `${stemOf(file)}.meltemi`);
    const result = importFile(context, file, out, options, true);
    if (typeof result === "string") {
      context.stderr(`${context.name} import: ${result}\n`);
      reports.push({
        source: context.display(file),
        output: context.display(out),
        status: "failed",
        written: false,
        refused: false,
        diagrams: [],
        findings: [],
        merge: [],
        coverage: [],
      });
      continue;
    }
    // A Markdown file without diagram blocks is documentation, not a failed import.
    if (result.status === "failed" && /\.(md|markdown)$/i.test(file) && !result.written) {
      passed++;
      continue;
    }
    reports.push(result);
  }
  const count = (status: FileReport["status"]) => reports.filter((r) => r.status === status).length;
  const refused = reports.filter((r) => r.refused).length;
  if (options.json) {
    context.stdout(
      `${JSON.stringify(
        {
          folder: context.display(source),
          files: reports.map(({ refused: _refused, ...report }) => report),
          skipped: passed,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const parts = [
      t.folder.complete(count("complete")),
      t.folder.partial(count("partial")),
      ...(count("failed") > 0 ? [t.folder.failed(count("failed"))] : []),
      ...(refused > 0 ? [t.folder.notReplaced(refused)] : []),
      ...(passed > 0 ? [t.folder.withoutDiagrams(passed)] : []),
    ];
    context.stdout(
      `${t.folderSummary(options.check, reports.length, context.display(source), parts)}\n`,
    );
  }
  if (refused > 0 || count("failed") > 0) return EXIT_USAGE;
  return count("partial") > 0 ? EXIT_FINDINGS : EXIT_OK;
}

/** Imports one file into `out`; the report, or a message when it cannot even be read. */
function importFile(
  context: ImportContext,
  source: string,
  out: string,
  options: ImportOptions,
  quietNothing: boolean,
): (FileReport & { refused: boolean }) | string {
  let text: string;
  try {
    text = readFileSync(source, "utf8");
  } catch (error) {
    return messages().common.cannotRead(context.display(source), (error as Error).message);
  }
  const t = messages().import;
  if (out === source) return t.replacesSource;
  // Includes stay inside the source's project, or its folder when it has none.
  const workspace = context.workspaceFor(toProjectPath(source));
  const registry = workspace.assets().registry;
  const result = importText(text, {
    ...(options.from !== undefined ? { format: options.from as ImportFormat } : {}),
    fileName: toProjectPath(source),
    includeRoot: workspace.root,
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    hasIcon: (name) => registry.lookup(name).status === "found",
    locale: context.contentLocale(workspace),
  });
  const sourceName = context.display(source);
  const outName = context.display(out);

  let sheet = result.text;
  let mergeFindings: readonly Diagnostic[] = [];
  const exists = existsSync(out);
  let refused = false;
  if (sheet !== null && exists) {
    if (options.merge) {
      try {
        const merged = mergeImport(readFileSync(out, "utf8"), sheet);
        sheet = merged.text;
        mergeFindings = merged.findings;
      } catch (error) {
        return messages().common.cannotRead(outName, (error as Error).message);
      }
    } else if (!options.force) refused = true;
  }
  const written = sheet !== null && !refused && !options.check;
  if (written) {
    try {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, sheet!, "utf8");
    } catch (error) {
      return messages().common.cannotWrite(outName, (error as Error).message);
    }
  }

  if (!options.json && !(quietNothing && sheet === null)) {
    printFindings(context, sourceName, result.findings);
    printFindings(context, outName, mergeFindings);
    for (const c of result.coverage) {
      context.stdout(`${t.coverage(c.diagram, c.mapped, c.approximated, c.dropped)}\n`);
    }
    const status = t.status[result.status];
    if (refused) {
      context.stderr(`${context.name} import: ${t.exists(outName)}\n`);
    } else if (sheet === null) {
      context.stderr(`${context.name} import: ${t.nothing(sourceName)}\n`);
    } else if (options.check) {
      context.stdout(`${t.wouldImport(sourceName, outName, status)}\n`);
    } else {
      context.stdout(`${t.imported(sourceName, outName, status, options.merge && exists)}\n`);
    }
  }
  return {
    source: sourceName,
    output: outName,
    status: result.status,
    written,
    refused,
    diagrams: result.diagrams,
    findings: result.findings,
    merge: mergeFindings,
    coverage: result.coverage,
  };
}

function printFindings(
  context: ImportContext,
  path: string,
  findings: readonly (ImportFinding | Diagnostic)[],
): void {
  for (const f of findings) {
    context.stdout(
      `${path}:${f.range.start.line}:${f.range.start.column}: ${f.severity} ${f.code} ${f.message}\n`,
    );
    for (const hint of f.hints ?? []) {
      context.stdout(`    ${messages().common.hint}: ${hint}\n`);
    }
  }
}
