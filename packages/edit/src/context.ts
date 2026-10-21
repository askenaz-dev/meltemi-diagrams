import {
  detectIndent,
  detectLineEnding,
  isToken,
  type Block,
  type TextEdit,
  type Token,
} from "@meltemi/diagrams-language";
import type { Compilation, Element, FlowDiagram, Relation } from "@meltemi/diagrams-model";
import { reasons } from "./messages/index.js";
import { hasOnlyWhitespaceTrivia, lineIndent, lineStart } from "./text.js";
import type { Dependent, EditRejection } from "./types.js";

/** Internal signal used to stop planning; `planEdit` turns it into a rejection result. */
export class Rejected extends Error {
  constructor(readonly rejection: EditRejection) {
    super(rejection.reason);
  }
}

export function reject(code: string, reason: string, dependents?: Dependent[]): never {
  throw new Rejected(dependents ? { code, reason, dependents } : { code, reason });
}

export interface EditContext {
  readonly compilation: Compilation;
  readonly text: string;
  readonly diagram: FlowDiagram;
  /** Line ending for inserted lines: the first one used by the document. */
  readonly eol: string;
  /** Indentation unit detected from the document. */
  readonly unit: string;
  readonly notes: string[];
}

/** What text edits need: the compilation, its text and its layout conventions. */
export type TextContext = Pick<EditContext, "compilation" | "text" | "eol" | "unit" | "notes">;

export function createTextContext(compilation: Compilation): TextContext {
  return {
    compilation,
    text: compilation.text,
    eol: detectLineEnding(compilation.text),
    unit: detectIndent(compilation.text),
    notes: [],
  };
}

export function createContext(compilation: Compilation, diagramId: string): EditContext {
  return {
    compilation,
    text: compilation.text,
    diagram: resolveDiagram(compilation, diagramId),
    eol: detectLineEnding(compilation.text),
    unit: detectIndent(compilation.text),
    notes: [],
  };
}

function resolveDiagram(compilation: Compilation, id: string): FlowDiagram {
  const diagram = compilation.document.diagrams.find((d) => d.id === id);
  if (!diagram) {
    const words = reasons().targets;
    const other = compilation.document.unsupported.find((u) => u.id === id);
    if (other) reject("edit.unsafe-target", words.unsupportedDiagram(id, other.profile));
    if (compilation.document.models.some((m) => m.id === id)) {
      reject("edit.unsafe-target", words.isModel(id));
    }
    if (compilation.document.stories.some((s) => s.id === id)) {
      reject("edit.unsafe-target", words.isStory(id));
    }
    if (compilation.document.exports.some((e) => e.id === id)) {
      reject("edit.unsafe-target", words.isExport(id));
    }
    reject("edit.unsafe-target", words.noDiagram(id));
  }
  if (diagram.hasSyntaxErrors) {
    const span = { start: diagram.node.fullStart, end: diagram.node.end };
    const syntaxError = compilation.parse.diagnostics.find(
      (d) =>
        d.severity === "error" &&
        d.range.start.offset >= span.start &&
        d.range.start.offset <= span.end,
    );
    const where = syntaxError
      ? { line: syntaxError.range.start.line, message: syntaxError.message.replace(/\.$/, "") }
      : null;
    reject("edit.unsafe-target", reasons().targets.syntaxError(id, where));
  }
  return diagram;
}

export function requireElement(ctx: EditContext, id: string): Element {
  const element = ctx.diagram.elementsById.get(id);
  if (!element) reject("edit.unsafe-target", reasons().elements.missing(id, ctx.diagram.id));
  return element;
}

/** Resolves a relation by id. Anonymous keys are refused: the relation needs `as <id>` first. */
export function requireNamedRelation(ctx: EditContext, name: string): Relation {
  const relation = ctx.diagram.relationsByKey.get(name);
  if (relation && relation.id !== null) return relation;
  if (relation) reject("edit.anonymous-relation", reasons().relations.anonymous(name));
  reject("edit.unsafe-target", reasons().relations.missing(name, ctx.diagram.id));
}

export function requireNumbers(...values: number[]): void {
  for (const value of values) {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e9) {
      reject("edit.invalid-value", reasons().values.notCoordinate(value));
    }
  }
}

/**
 * Inserts a statement as the last statement of a block, following the block's layout:
 * a new line indented like the existing statements, or `; statement` in a one-line block.
 * `render` receives the indentation of the new line, or null for a one-line block.
 */
export function insertStatement(
  ctx: TextContext,
  block: Block,
  ownerStart: number,
  render: (indent: string | null) => string,
  options: { blankLineBefore?: boolean } = {},
): TextEdit {
  const text = ctx.text;
  const ownerIndent = lineIndent(text, ownerStart);
  const children = block.children;
  const statements = block.statements;

  if (statements.length > 0) {
    const last = statements[statements.length - 1]!;
    let newline: Token | undefined;
    for (let i = children.indexOf(last) + 1; i < children.length; i++) {
      const child = children[i]!;
      if (isToken(child) && child.kind === "Semicolon") continue;
      if (isToken(child) && child.kind === "Newline") newline = child;
      break;
    }
    if (newline) {
      const onOpenLine = lineStart(text, last.start) === lineStart(text, block.open.start);
      const indent = onOpenLine ? ownerIndent + ctx.unit : lineIndent(text, last.start);
      const prefix = ctx.eol + (options.blankLineBefore ? ctx.eol : "");
      return {
        start: newline.start,
        end: newline.start,
        newText: prefix + indent + render(indent),
      };
    }
    return { start: last.end, end: last.end, newText: `; ${render(null)}` };
  }

  const newlines = children.filter((c): c is Token => isToken(c) && c.kind === "Newline");
  if (newlines.length > 0) {
    const indent = ownerIndent + ctx.unit;
    const at = newlines[newlines.length - 1]!.start;
    return { start: at, end: at, newText: ctx.eol + indent + render(indent) };
  }

  const close = block.close;
  if (!isToken(close)) reject("edit.unsafe-target", reasons().targets.blockNotClosed);
  if (hasOnlyWhitespaceTrivia(close)) {
    return { start: close.fullStart, end: close.start, newText: ` ${render(null)} ` };
  }
  return { start: close.start, end: close.start, newText: `${render(null)} ` };
}
