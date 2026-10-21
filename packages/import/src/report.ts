import {
  LineIndex,
  type Diagnostic,
  type Range,
  type Severity,
  type Span,
} from "@meltemi/diagrams-language";

export type ImportFormat = "mermaid" | "plantuml" | "markdown";
export type SourceFormat = "mermaid" | "plantuml";
export type ImportStatus = "complete" | "partial" | "failed";
export type ConstructStatus = "mapped" | "approximated" | "dropped";
export type ImportedType = "flow" | "free" | "sequence" | "c4";

/** Stable finding codes, documented in docs/language/diagnostics.md. */
export const IMPORT_CODES = [
  "import.unknown-format",
  "import.unsupported-diagram",
  "import.syntax",
  "import.unsupported-construct",
  "import.approximated",
  "import.renamed-id",
  "import.partial",
  "import.include",
  "import.preprocessor",
  "import.merge",
] as const;
export type ImportCode = (typeof IMPORT_CODES)[number];

/** A diagnostic about the source text, with what happened to the construct it names. */
export interface ImportFinding extends Diagnostic {
  /** The construct, such as `flowchart.hexagon` or `plantuml.skinparam`. */
  readonly construct: string;
  /** `null` for findings that are not about one construct (ids, includes, merges). */
  readonly status: ConstructStatus | null;
  /** Essential constructs carry meaning: elements, relations, messages, entities. */
  readonly essential: boolean;
  /** The id of the diagram the finding belongs to, when there is one. */
  readonly diagram: string | null;
}

export interface ConstructCount {
  readonly construct: string;
  readonly status: ConstructStatus;
  readonly count: number;
}

/** How many constructs of one imported diagram were mapped, approximated and dropped. */
export interface DiagramCoverage {
  readonly diagram: string;
  readonly mapped: number;
  readonly approximated: number;
  readonly dropped: number;
  readonly constructs: readonly ConstructCount[];
}

export interface ImportedDiagram {
  readonly id: string;
  readonly type: ImportedType;
  /** The model a C4 view draws; it is written in the same sheet. */
  readonly model: string | null;
  readonly source: {
    readonly format: SourceFormat;
    /** The source's diagram type: `flowchart`, `sequenceDiagram`, `component`, `C4Container`… */
    readonly kind: string;
    readonly range: Range;
  };
}

export interface ImportResult {
  /** The `.meltemi` sheet, or `null` when nothing could be imported. */
  readonly text: string | null;
  readonly status: ImportStatus;
  readonly format: ImportFormat | null;
  readonly diagrams: readonly ImportedDiagram[];
  readonly findings: readonly ImportFinding[];
  readonly coverage: readonly DiagramCoverage[];
}

interface PendingFinding {
  readonly code: ImportCode | string;
  readonly severity: Severity;
  readonly message: string;
  readonly span: Span;
  readonly construct: string;
  readonly status: ConstructStatus | null;
  readonly essential: boolean;
  readonly diagram: string | null;
  readonly hints?: readonly string[];
}

/**
 * Collects findings with spans in the original text and counts constructs per diagram. Front-ends
 * report through it; `findings()` resolves the spans to ranges at the end.
 */
export class Reporter {
  private readonly pending: PendingFinding[] = [];
  private readonly counts = new Map<string, Map<string, number>>();
  private readonly order: string[] = [];
  /** The diagram that constructs are counted for. */
  diagram: string | null = null;

  constructor(readonly text: string) {}

  /** Starts counting for a diagram; ids are fixed later with `renameDiagram`. */
  begin(diagram: string): void {
    this.diagram = diagram;
    if (!this.counts.has(diagram)) {
      this.counts.set(diagram, new Map());
      this.order.push(diagram);
    }
  }

  private count(construct: string, status: ConstructStatus): void {
    if (this.diagram === null) return;
    const map = this.counts.get(this.diagram)!;
    const key = `${status}\u0000${construct}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  mapped(construct: string): void {
    this.count(construct, "mapped");
  }

  approximated(construct: string, span: Span, message: string, hints?: readonly string[]): void {
    this.count(construct, "approximated");
    this.add({
      code: "import.approximated",
      severity: "info",
      message,
      span,
      construct,
      status: "approximated",
      essential: false,
      hints,
    });
  }

  dropped(
    construct: string,
    span: Span,
    message: string,
    essential = false,
    hints?: readonly string[],
  ): void {
    this.count(construct, "dropped");
    this.add({
      code: "import.unsupported-construct",
      severity: "warning",
      message,
      span,
      construct,
      status: "dropped",
      essential,
      hints,
    });
  }

  /** A line the front-end could not read; always essential. */
  syntax(construct: string, span: Span, message: string, hints?: readonly string[]): void {
    this.count(construct, "dropped");
    this.add({
      code: "import.syntax",
      severity: "warning",
      message,
      span,
      construct,
      status: "dropped",
      essential: true,
      hints,
    });
  }

  add(finding: Omit<PendingFinding, "diagram"> & { diagram?: string | null }): void {
    this.pending.push({ ...finding, diagram: finding.diagram ?? this.diagram });
  }

  /** Re-keys counts and findings after diagram ids are made unique. */
  renameDiagram(from: string, to: string): void {
    if (from === to) return;
    const map = this.counts.get(from);
    if (map) {
      this.counts.delete(from);
      this.counts.set(to, map);
      this.order[this.order.indexOf(from)] = to;
    }
    for (let i = 0; i < this.pending.length; i++) {
      const f = this.pending[i]!;
      if (f.diagram === from) this.pending[i] = { ...f, diagram: to };
    }
    if (this.diagram === from) this.diagram = to;
  }

  /** Forgets a diagram that produced nothing, keeping its findings. */
  discard(diagram: string): void {
    this.counts.delete(diagram);
    const i = this.order.indexOf(diagram);
    if (i >= 0) this.order.splice(i, 1);
  }

  get essentialDrops(): number {
    return this.pending.filter((f) => f.essential).length;
  }

  findings(): ImportFinding[] {
    const lines = new LineIndex(this.text);
    return this.pending
      .map((f, i) => ({ f, i }))
      .sort((a, b) => a.f.span.start - b.f.span.start || a.i - b.i)
      .map(({ f }) => {
        const finding: ImportFinding = {
          code: f.code,
          severity: f.severity,
          message: f.message,
          range: lines.range(f.span),
          construct: f.construct,
          status: f.status,
          essential: f.essential,
          diagram: f.diagram,
          ...(f.hints && f.hints.length > 0 ? { hints: [...f.hints] } : {}),
        };
        return finding;
      });
  }

  coverage(): DiagramCoverage[] {
    return this.order.map((diagram) => {
      const map = this.counts.get(diagram)!;
      const constructs: ConstructCount[] = [...map.entries()]
        .map(([key, count]) => {
          const [status, construct] = key.split("\u0000") as [ConstructStatus, string];
          return { construct, status, count };
        })
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            a.construct.localeCompare(b.construct),
        );
      const total = (status: ConstructStatus) =>
        constructs.filter((c) => c.status === status).reduce((n, c) => n + c.count, 0);
      return {
        diagram,
        mapped: total("mapped"),
        approximated: total("approximated"),
        dropped: total("dropped"),
        constructs,
      };
    });
  }
}

const STATUS_ORDER: Record<ConstructStatus, number> = { mapped: 0, approximated: 1, dropped: 2 };

/** A line of source text with its offset in the original file. */
export interface SourceLine {
  readonly text: string;
  /** Offset of the first character of `text` in the original file. */
  readonly start: number;
  /**
   * The span reported for the line. Preprocessed lines report the source line they came from, so
   * columns inside generated text are not meaningful.
   */
  readonly span: Span;
  /** True when the text came from a macro or an include rather than the user's own line. */
  readonly generated: boolean;
}

/** Splits `text[start, end)` into lines that know where they are in the original file. */
export function splitLines(text: string, start = 0, end = text.length): SourceLine[] {
  const out: SourceLine[] = [];
  let at = start;
  while (at <= end) {
    let next = text.indexOf("\n", at);
    if (next < 0 || next > end) next = end;
    let lineEnd = next;
    if (lineEnd > at && text.charCodeAt(lineEnd - 1) === 13) lineEnd--;
    out.push({
      text: text.slice(at, lineEnd),
      start: at,
      span: { start: at, end: lineEnd },
      generated: false,
    });
    if (next >= end) break;
    at = next + 1;
  }
  return out;
}

/** The span of `part` inside a line, when the line is the user's own text. */
export function spanIn(line: SourceLine, index: number, length: number): Span {
  if (line.generated || index < 0) return line.span;
  return { start: line.start + index, end: line.start + index + length };
}

/** The span of a line without its indentation and trailing spaces. */
export function trimmedSpan(line: SourceLine): Span {
  if (line.generated) return line.span;
  const lead = line.text.length - line.text.trimStart().length;
  const trail = line.text.length - line.text.trimEnd().length;
  const start = line.start + lead;
  return { start, end: Math.max(start, line.start + line.text.length - trail) };
}
