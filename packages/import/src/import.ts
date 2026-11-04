import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import { LineIndex } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { detectFormat, stemOf } from "./detect.js";
import { isFailure, type FrontContext, type FrontDiagram, type FrontOutcome } from "./front.js";
import { IdMap, slugId } from "./ids.js";
import { markdownBlocks } from "./markdown.js";
import { messages } from "./messages/index.js";
import { importMermaid } from "./mermaid/index.js";
import { importPlantUml } from "./plantuml/index.js";
import {
  Reporter,
  splitLines,
  type ImportedDiagram,
  type ImportFormat,
  type ImportResult,
} from "./report.js";
import { printSheet, type Sheet } from "./writer.js";

export interface ImportOptions {
  /** Skips detection. */
  readonly format?: ImportFormat;
  /** The source's path or name: it names the diagram and resolves includes. */
  readonly fileName?: string;
  /**
   * Reads a file for PlantUML `!include`, by a `/`-separated path that the importer has already
   * resolved and checked against `includeRoot`. Returns `undefined` when the file does not exist.
   */
  readonly readFile?: (path: string) => string | undefined;
  /** Includes may not leave this folder; by default the folder of `fileName`. */
  readonly includeRoot?: string;
  /** True when an icon can be drawn; by default only `tabler:` icons can. */
  readonly hasIcon?: (name: string) => boolean;
  /**
   * The language of the words the importer writes into the sheet: its header comment, the
   * comments that keep lines it could not read, and the names of systems and containers it adds.
   * English by default; findings are in the interface language.
   */
  readonly locale?: Locale;
}

/** Imports a Mermaid, PlantUML or Markdown source into a `.meltemi` sheet. Never throws. */
export function importText(text: string, options: ImportOptions = {}): ImportResult {
  const reporter = new Reporter(text);
  try {
    return run(text, options, reporter);
  } catch (error) {
    // A defect in a front-end must not take the host down; report it like a syntax problem.
    reporter.add({
      code: "import.syntax",
      severity: "error",
      message: messages().import.stopped(error instanceof Error ? error.message : String(error)),
      span: { start: 0, end: 0 },
      construct: "importer",
      status: null,
      essential: true,
      diagram: null,
    });
    return {
      text: null,
      status: "failed",
      format: options.format ?? null,
      diagrams: [],
      findings: reporter.findings(),
      coverage: [],
    };
  }
}

function run(text: string, options: ImportOptions, reporter: Reporter): ImportResult {
  const format = options.format ?? detectFormat(text, options.fileName);
  const failed = (fmt: ImportFormat | null): ImportResult => ({
    text: null,
    status: "failed",
    format: fmt,
    diagrams: [],
    findings: reporter.findings(),
    coverage: [],
  });
  if (!format) {
    const firstLine = text.indexOf("\n");
    reporter.add({
      code: "import.unknown-format",
      severity: "error",
      message: messages().import.unknownFormat,
      span: { start: 0, end: firstLine < 0 ? Math.min(text.length, 200) : firstLine },
      construct: "format",
      status: null,
      essential: true,
      diagram: null,
      hints: [messages().import.unknownFormatHint],
    });
    return failed(null);
  }
  const locale = options.locale ?? DEFAULT_LOCALE;
  const ctx: FrontContext = {
    reporter,
    hasIcon: (name) => name.startsWith("tabler:") || (options.hasIcon?.(name) ?? false),
    locale,
  };
  const outcomes: { outcome: FrontOutcome; heading: string | null }[] = [];
  let count = 0;
  const key = () => `#${++count}`;
  if (format === "mermaid") {
    outcomes.push({ outcome: importMermaid(ctx, splitLines(text), key()), heading: null });
  } else if (format === "plantuml") {
    for (const outcome of importPlantUml(ctx, splitLines(text), key, options)) {
      outcomes.push({ outcome, heading: null });
    }
  } else {
    const blocks = markdownBlocks(text);
    if (blocks.length === 0) {
      reporter.add({
        code: "import.unsupported-diagram",
        severity: "error",
        message: messages().import.noDiagramBlocks,
        span: { start: 0, end: 0 },
        construct: "markdown.block",
        status: "dropped",
        essential: true,
        diagram: null,
      });
      return failed(format);
    }
    for (const block of blocks) {
      const lines = splitLines(text, block.start, block.end);
      if (block.format === "mermaid") {
        outcomes.push({ outcome: importMermaid(ctx, lines, key()), heading: block.heading });
      } else {
        for (const outcome of importPlantUml(ctx, lines, key, options)) {
          outcomes.push({ outcome, heading: block.heading });
        }
      }
    }
  }

  // Ids: the source's name, the title, the Markdown heading, the file stem, the kind.
  const sheetIds = new IdMap(null);
  const diagrams: { diagram: FrontDiagram; sheet: Sheet }[] = [];
  for (const { outcome, heading } of outcomes) {
    if (isFailure(outcome)) {
      reporter.discard(outcome.key);
      continue;
    }
    const sheet = outcome.sheet;
    const candidates = [
      outcome.name,
      sheet.title,
      heading ?? undefined,
      options.fileName ? stemOf(options.fileName) : undefined,
    ];
    const base =
      candidates.map((c) => (c === undefined ? "" : slugId(c, ""))).find((c) => c !== "") ??
      slugId(outcome.kind, "diagram");
    const id = sheetIds.unique(base);
    sheet.id = id;
    if (sheet.type === "c4") sheet.model = sheetIds.unique(`${id}_model`);
    reporter.renameDiagram(outcome.key, id);
    diagrams.push({ diagram: outcome, sheet });
  }
  if (diagrams.length === 0) return failed(format);

  const output = printSheet(
    { ...(options.fileName !== undefined ? { fileName: options.fileName } : {}), format, locale },
    diagrams.map((d) => d.sheet),
  );
  // Self-check: the sheet must compile; anything else is a defect worth reporting.
  const compiled = compile(output);
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  for (const error of errors) {
    reporter.add({
      code: error.code,
      severity: "error",
      message: messages().import.selfCheck(error.range.start.line, error.message),
      span: { start: 0, end: 0 },
      construct: "self-check",
      status: null,
      essential: true,
      diagram: null,
    });
  }
  const essential = reporter.essentialDrops;
  if (essential > 0) {
    reporter.add({
      code: "import.partial",
      severity: "warning",
      message: messages().import.partial(essential),
      span: { start: 0, end: 0 },
      construct: "import",
      status: null,
      essential: false,
      diagram: null,
    });
  }
  const index = new LineIndex(text);
  const imported: ImportedDiagram[] = diagrams.map(({ diagram, sheet }) => ({
    id: sheet.id,
    type: sheet.type,
    model: sheet.type === "c4" ? sheet.model : null,
    source: {
      format: diagram.format,
      kind: diagram.kind,
      range: index.range(diagram.span),
    },
  }));
  return {
    text: output,
    status: essential > 0 ? "partial" : "complete",
    format,
    diagrams: imported,
    findings: reporter.findings(),
    coverage: reporter.coverage(),
  };
}
