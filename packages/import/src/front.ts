import type { Locale } from "@meltemi/diagrams-i18n";
import type { Span } from "@meltemi/diagrams-language";
import type { FlowDiagram } from "@meltemi/diagrams-model";
import type { Reporter, SourceFormat } from "./report.js";
import type { Sheet } from "./writer.js";

/** What every front-end receives. */
export interface FrontContext {
  readonly reporter: Reporter;
  /** True when an icon reference can be drawn (`tabler:*` always can). */
  readonly hasIcon: (name: string) => boolean;
  /** The language of the words written into the sheet; findings follow the interface's. */
  readonly locale: Locale;
  /**
   * The import's day as `YYYY-MM-DD`: what a source that leaves its dates open (a Mermaid `gantt`
   * whose format has no year, a task that follows nothing) is placed on.
   */
  readonly today: string;
}

/** One source diagram turned into a sheet; ids are made unique by the caller. */
export interface FrontDiagram {
  readonly sheet: Sheet;
  readonly format: SourceFormat;
  /** The source's diagram type, such as `flowchart` or `C4Container`. */
  readonly kind: string;
  /** Span of the whole source diagram. */
  readonly span: Span;
  /** The id the source gives (`@startuml name`), when it gives one. */
  readonly name?: string;
  /** The key the reporter counts this diagram's constructs under. */
  readonly key: string;
  /**
   * Mends what the compiler refused in the diagram it was given, such as a Mermaid `gantt` task
   * that would end before it starts, and returns whether it changed the sheet, which is then
   * written and compiled again.
   */
  readonly repair?: (diagram: FlowDiagram) => boolean;
  /**
   * Checks the compiled diagram against the source once the sheet has been compiled, and reports
   * what differs through the reporter: a Mermaid `gantt` compares the dates the sheet resolves to
   * with the ones Mermaid draws.
   */
  readonly verify?: (diagram: FlowDiagram) => void;
}

/** A source block that could not become a diagram. */
export interface FrontFailure {
  readonly failed: true;
  readonly key: string;
}

export type FrontOutcome = FrontDiagram | FrontFailure;

export function isFailure(outcome: FrontOutcome): outcome is FrontFailure {
  return "failed" in outcome;
}
