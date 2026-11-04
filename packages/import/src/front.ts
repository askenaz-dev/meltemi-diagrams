import type { Locale } from "@meltemi/diagrams-i18n";
import type { Span } from "@meltemi/diagrams-language";
import type { Reporter, SourceFormat } from "./report.js";
import type { Sheet } from "./writer.js";

/** What every front-end receives. */
export interface FrontContext {
  readonly reporter: Reporter;
  /** True when an icon reference can be drawn (`tabler:*` always can). */
  readonly hasIcon: (name: string) => boolean;
  /** The language of the words written into the sheet; findings follow the interface's. */
  readonly locale: Locale;
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
