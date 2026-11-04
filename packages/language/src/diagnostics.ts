import type { LineIndex, Range, Span } from "./positions.js";

export type Severity = "error" | "warning" | "info";

export interface RelatedInformation {
  readonly message: string;
  readonly range: Range;
}

/**
 * What tools need from a diagnostic without reading its words, which follow the interface language:
 * quick fixes and checks read this, never the message or the hints.
 */
export interface DiagnosticData {
  /** The ids the message names, in its order: an unknown element, a layer, an element and port. */
  readonly ids?: readonly string[];
  /** Values a fix may write in place of the diagnostic's text: the accepted alternatives. */
  readonly candidates?: readonly string[];
  /** `layout.text-overflow`: the element and the size that fits its text. */
  readonly size?: { readonly element: string; readonly width: number; readonly height: number };
  /** `layout.gap-floor`: the participant, the side, the gap written and the gap drawn. */
  readonly gap?: {
    readonly participant: string;
    readonly side: "before" | "after";
    readonly written: number;
    readonly applied: number;
  };
}

/** A problem found in a source text. Codes are stable and documented in docs/language/diagnostics.md. */
export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly range: Range;
  readonly hints?: readonly string[];
  readonly related?: readonly RelatedInformation[];
  readonly data?: DiagnosticData;
}

export interface DiagnosticInput {
  readonly code: string;
  readonly severity?: Severity;
  readonly message: string;
  readonly span: Span;
  readonly hints?: readonly string[];
  readonly related?: readonly { readonly message: string; readonly span: Span }[];
  readonly data?: DiagnosticData;
}

/** Collects diagnostics and resolves their spans to ranges. */
export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  constructor(private readonly lines: LineIndex) {}

  add(input: DiagnosticInput): Diagnostic {
    const diagnostic = createDiagnostic(this.lines, input);
    this.items.push(diagnostic);
    return diagnostic;
  }

  get errorCount(): number {
    return this.items.filter((d) => d.severity === "error").length;
  }
}

export function createDiagnostic(lines: LineIndex, input: DiagnosticInput): Diagnostic {
  const diagnostic: {
    code: string;
    severity: Severity;
    message: string;
    range: Range;
    hints?: readonly string[];
    related?: readonly RelatedInformation[];
    data?: DiagnosticData;
  } = {
    code: input.code,
    severity: input.severity ?? "error",
    message: input.message,
    range: lines.range(input.span),
  };
  if (input.hints && input.hints.length > 0) diagnostic.hints = [...input.hints];
  if (input.related && input.related.length > 0) {
    diagnostic.related = input.related.map((r) => ({
      message: r.message,
      range: lines.range(r.span),
    }));
  }
  if (input.data) diagnostic.data = input.data;
  return diagnostic;
}

/** Orders diagnostics by position, keeping the original order for ties. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics
    .map((d, i) => ({ d, i }))
    .sort(
      (a, b) =>
        a.d.range.start.offset - b.d.range.start.offset ||
        a.d.range.end.offset - b.d.range.end.offset ||
        a.i - b.i,
    )
    .map((x) => x.d);
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
