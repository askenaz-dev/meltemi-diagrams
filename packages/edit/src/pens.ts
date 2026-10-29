import {
  tokensOf,
  type Arg,
  type KeywordStatement,
  type List,
  type TextEdit,
} from "@meltemi/diagrams-language";
import type { Point } from "@meltemi/diagrams-model";
import { reject, requireElement, type EditContext } from "./context.js";
import { freeId } from "./create.js";
import {
  diagramBody,
  groupBlock,
  insertDeclaration,
  insertDiagramStyle,
  verifyNoNewErrors,
} from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import { requireNewId, type OperationOf } from "./plan.js";
import { formatStyleValue } from "./styles.js";
import { columnsOf, formatTenth, isCommentTrivia, isWritableNumber, lineIndent } from "./text.js";
import type { PenStyle } from "./types.js";

/** Columns a pen statement fits in on one line, and the lines of its filled list: the formatter's. */
const FILL_COLUMNS = 100;

/** The styles of a new pen, in the order its `style` statement writes them. */
const PEN_STYLES = [
  "stroke",
  "width",
  "opacity",
  "arrowhead",
  "arrowtail",
] as const satisfies readonly (keyof PenStyle)[];

/** One point at least, every coordinate one the language can write. */
function requirePenPoints(points: readonly Point[]): void {
  if (points.length === 0) reject("edit.invalid-value", reasons().pens.noPoints);
  for (const p of points) {
    for (const value of [p.x, p.y]) {
      if (!isWritableNumber(value))
        reject("edit.invalid-value", reasons().values.notCoordinate(value));
    }
  }
}

/** Where a pen's list is printed: the statement's indentation and its first line around the list. */
interface ListPlace {
  /** The indentation of the statement's first line. */
  readonly indent: string;
  readonly unit: string;
  readonly eol: string;
  /** Columns of the first line before the list, the indentation included. */
  readonly before: number;
  /** Columns of the first line after the list. */
  readonly after: number;
}

/**
 * A pen's point list as the formatter prints it, every coordinate to a tenth: on one line when the
 * statement fits in 100 columns, else `[` ending the first line, the tuples one level deeper filled
 * to 100 columns with a comma after each, the last one included, and `]` alone at the statement's
 * indentation.
 */
function penListText(points: readonly Point[], place: ListPlace): string {
  const tuples = points.map((p) => `(${formatTenth(p.x)}, ${formatTenth(p.y)})`);
  const one = `[${tuples.join(", ")}]`;
  if (place.before + columnsOf(one) + place.after <= FILL_COLUMNS) return one;
  const inner = place.indent + place.unit;
  const lines: string[] = [];
  let line = "";
  for (const tuple of tuples) {
    const item = `${tuple},`;
    if (line === "") line = inner + item;
    else if (columnsOf(line) + 1 + columnsOf(item) > FILL_COLUMNS) {
      lines.push(line);
      line = inner + item;
    } else line += ` ${item}`;
  }
  lines.push(line);
  return `[${place.eol}${lines.join(place.eol)}${place.eol}${place.indent}]`;
}

/** The statements of a pen's `style` block, in `PEN_STYLES` order. */
function penStyles(style: PenStyle | undefined): string[] {
  if (!style) return [];
  return PEN_STYLES.flatMap((property) => {
    const value = style[property];
    return value === undefined ? [] : [`${property} ${formatStyleValue(property, value)}`];
  });
}

/**
 * Declares a pen stroke, `pen <id> [(x, y), …]`, after the last declaration of the diagram body or
 * of `parent`'s block, its points already in that parent's interior coordinates, and its styles in
 * one `style` statement beside it (with the diagram's styles when it goes in a group).
 */
export function createPen(ctx: EditContext, op: OperationOf<"createPen">): TextEdit[] {
  if (ctx.diagram.type !== "free") reject("edit.invalid-value", reasons().pens.freeOnly);
  requirePenPoints(op.points);
  const id = op.id ?? freeId(ctx, "pen");
  requireNewId(ctx, id);
  const properties = penStyles(op.style);
  const styled = properties.length > 0 ? `style ${id} { ${properties.join("; ")} }` : undefined;
  const beside = styled !== undefined && !op.parent ? styled : undefined;
  const { block, owner } = op.parent
    ? groupBlock(ctx, op.parent)
    : { block: diagramBody(ctx), owner: ctx.diagram.node.start };
  const head = `pen ${id} `;
  const statement = (indent: string) =>
    head +
    penListText(op.points, {
      indent,
      unit: ctx.unit,
      eol: ctx.eol,
      before: columnsOf(indent + head),
      after: 0,
    });
  const edits: TextEdit[] = [
    insertDeclaration(ctx, block, owner, (indent) => {
      // A block written on one line keeps the statement on it, measured from the owner's line.
      const text = statement(indent ?? lineIndent(ctx.text, owner) + ctx.unit);
      if (beside === undefined) return text;
      return indent === null ? `${text}; ${beside}` : `${text}${ctx.eol}${indent}${beside}`;
    }),
  ];
  if (styled !== undefined && op.parent) edits.push(insertDiagramStyle(ctx, styled));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The edits that write `point` into a tuple of a pen, number by number, to a tenth. */
function tupleEdits(tuple: Arg, point: Point): TextEdit[] {
  if (tuple.kind !== "Tuple") reject("edit.unsafe-target", reasons().placement.expectedPoint);
  const edits: TextEdit[] = [];
  const [x, y] = tuple.items;
  const numbers: readonly [Arg | undefined, number][] = [
    [x, point.x],
    [y, point.y],
  ];
  for (const [arg, value] of numbers) {
    if (arg?.kind !== "NumberLiteral") {
      reject("edit.unsafe-target", reasons().placement.expectedNumber);
    }
    // A number written with more decimals stays when it is the same to a tenth.
    if (arg.value !== value && formatTenth(arg.value) !== formatTenth(value)) {
      edits.push({ start: arg.token.start, end: arg.token.end, newText: formatTenth(value) });
    }
  }
  return edits;
}

/** Columns of source text as the formatter prints it on one line: one space for each run. */
function flatColumns(text: string): number {
  return columnsOf(text.replace(/\s+/g, " "));
}

/**
 * Moves the points of a pen stroke, in its parent's interior coordinates: with as many points as
 * written, the numbers change one by one and comments stay; with another count, the whole list is
 * written again as `createPen` writes it, and the comments inside it go, each with a note.
 */
export function setPenPoints(ctx: EditContext, op: OperationOf<"setPenPoints">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  if (element.kind !== "pen" || element.node?.kind !== "KeywordStatement") {
    reject("edit.unsafe-target", reasons().pens.notAPen(op.element));
  }
  requirePenPoints(op.points);
  const stmt = element.node as KeywordStatement;
  const list = stmt.args.find((arg): arg is List => arg.kind === "List");
  if (!list) reject("edit.unsafe-target", reasons().pens.listUnreadable);
  if (list.items.length === op.points.length) {
    return list.items.flatMap((item, i) => tupleEdits(item, op.points[i]!));
  }
  const indent = lineIndent(ctx.text, stmt.start);
  // The statement's first line after the list: up to the end of the statement or of the line.
  const newline = ctx.text.indexOf("\n", list.end);
  const stop = newline < 0 ? stmt.end : Math.min(stmt.end, newline);
  const after = ctx.text.slice(list.end, stop).trimEnd();
  const lines = ctx.compilation.parse.lines;
  for (const token of tokensOf(list)) {
    if (token === list.open) continue;
    for (const trivia of token.leadingTrivia) {
      if (!isCommentTrivia(trivia)) continue;
      const line = lines.location(trivia.start).line;
      ctx.notes.push(messages().notes.removedComment(line, trivia.text.trim()));
    }
  }
  const text = penListText(op.points, {
    indent,
    unit: ctx.unit,
    eol: ctx.eol,
    before: columnsOf(indent) + flatColumns(ctx.text.slice(stmt.start, list.start)),
    after: flatColumns(after),
  });
  return [{ start: list.start, end: list.end, newText: text }];
}
