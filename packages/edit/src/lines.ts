import type { Arg, KeywordStatement, TextEdit } from "@meltemi/diagrams-language";
import type { Point } from "@meltemi/diagrams-model";
import { insertStatement, reject, requireElement, type EditContext } from "./context.js";
import { freeId } from "./create.js";
import {
  diagramBody,
  groupBlock,
  insertAfter,
  insertDeclaration,
  isKeyword,
  verifyNoNewErrors,
} from "./insert.js";
import { reasons } from "./messages/index.js";
import { requireNewId, type OperationOf } from "./plan.js";
import { formatNumber, formatPoint, formatPoints, isWritableNumber, quoteString } from "./text.js";

const rounded = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });

function requirePoints(points: readonly Point[]): void {
  for (const p of points) {
    for (const value of [p.x, p.y]) {
      if (!isWritableNumber(value))
        reject("edit.invalid-value", reasons().values.notCoordinate(value));
    }
  }
}

/**
 * Declares a free line, `line <id> ["Label"] from (x, y) to (x, y) [via [...]]`, in the diagram
 * body or in `parent`'s block, its points already in that parent's interior coordinates, and its
 * styles in one `style` statement beside it (with the diagram's styles when it goes in a group).
 */
export function createLine(ctx: EditContext, op: OperationOf<"createLine">): TextEdit[] {
  if (ctx.diagram.type !== "free") {
    reject("edit.invalid-value", reasons().lines.freeOnly);
  }
  const via = op.via ?? [];
  requirePoints([op.from, op.to, ...via]);
  const id = op.id ?? freeId(ctx, "line");
  requireNewId(ctx, id);
  const label = op.label !== undefined && op.label !== "" ? ` ${quoteString(op.label)}` : "";
  const bends = via.length > 0 ? ` via ${formatPoints(via.map(rounded))}` : "";
  const text = `line ${id}${label} from ${formatPoint(rounded(op.from))} to ${formatPoint(rounded(op.to))}${bends}`;
  const properties = (op.styles ?? []).map((s) => `${s.property} ${s.value}`);
  const styled = properties.length > 0 ? `style ${id} { ${properties.join("; ")} }` : undefined;
  const beside = styled !== undefined && !op.parent ? styled : undefined;
  const { block, owner } = op.parent
    ? groupBlock(ctx, op.parent)
    : { block: diagramBody(ctx), owner: ctx.diagram.node.start };
  const edits: TextEdit[] = [
    insertDeclaration(ctx, block, owner, (indent) =>
      beside === undefined
        ? text
        : indent === null
          ? `${text}; ${beside}`
          : `${text}${ctx.eol}${indent}${beside}`,
    ),
  ];
  if (styled !== undefined && op.parent) {
    // A group takes no style statement: after the diagram's last one, else at its end.
    const body = diagramBody(ctx);
    const styles = body.statements.filter((s) => isKeyword(s, "style"));
    const last = styles[styles.length - 1];
    edits.push(
      last
        ? insertAfter(ctx, body, last, () => styled)
        : insertStatement(ctx, body, ctx.diagram.node.start, () => styled),
    );
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The parts of a line statement: the tuples after `from` and `to`, and `via` with its list. */
function lineParts(stmt: KeywordStatement): {
  from: Arg;
  to: Arg;
  viaWord: Arg | undefined;
  viaList: Arg | undefined;
} {
  const args = stmt.args;
  const word = (arg: Arg | undefined, text: string) =>
    arg?.kind === "QualifiedRef" && arg.text === text;
  const at = (text: string) => args.findIndex((a) => word(a, text));
  const fromAt = at("from");
  const toAt = at("to");
  const viaAt = at("via");
  const from = args[fromAt + 1];
  const to = args[toAt + 1];
  if (fromAt < 0 || toAt < 0 || from?.kind !== "Tuple" || to?.kind !== "Tuple") {
    reject("edit.unsafe-target", reasons().placement.expectedPoint);
  }
  return {
    from: from!,
    to: to!,
    viaWord: viaAt < 0 ? undefined : args[viaAt],
    viaList: viaAt < 0 ? undefined : args[viaAt + 1],
  };
}

/** The edits that write `point` into a tuple, number by number, keeping what is equal. */
function tupleEdits(tuple: Arg, point: Point): TextEdit[] {
  if (tuple.kind !== "Tuple") reject("edit.unsafe-target", reasons().placement.expectedPoint);
  const edits: TextEdit[] = [];
  const items = tuple.kind === "Tuple" ? tuple.items : [];
  const [x, y] = items;
  for (const [arg, value] of [
    [x, point.x],
    [y, point.y],
  ] as const) {
    if (arg?.kind !== "NumberLiteral") {
      reject("edit.unsafe-target", reasons().placement.expectedNumber);
    }
    if (arg!.kind === "NumberLiteral" && arg!.value !== value) {
      edits.push({ start: arg!.token.start, end: arg!.token.end, newText: formatNumber(value) });
    }
  }
  return edits;
}

/**
 * Moves the points of a free line: the tuples after `from` and `to` change number by number, and
 * the bends are written in a `via` list after `to`, inserted when they appear and removed with
 * the word when none is left. Points are in the parent's interior coordinates, rounded.
 */
export function setLinePoints(ctx: EditContext, op: OperationOf<"setLinePoints">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  if (element.kind !== "line" || element.node?.kind !== "KeywordStatement") {
    reject("edit.invalid-value", reasons().lines.notALine(op.element));
  }
  requirePoints([op.from, op.to, ...op.via]);
  const stmt = element.node as KeywordStatement;
  const parts = lineParts(stmt);
  const from = rounded(op.from);
  const to = rounded(op.to);
  const via = op.via.map(rounded);
  const edits: TextEdit[] = [...tupleEdits(parts.from, from), ...tupleEdits(parts.to, to)];
  const list = parts.viaList?.kind === "List" ? parts.viaList : undefined;
  if (list && via.length === list.items.length) {
    list.items.forEach((item, i) => edits.push(...tupleEdits(item, via[i]!)));
  } else if (list && via.length > 0) {
    edits.push({ start: list.start, end: list.end, newText: formatPoints(via) });
  } else if (list) {
    // No bend left: ` via [...]` goes, from the end of the `to` tuple.
    edits.push({ start: parts.to.end, end: list.end, newText: "" });
  } else if (via.length > 0) {
    edits.push({ start: parts.to.end, end: parts.to.end, newText: ` via ${formatPoints(via)}` });
  }
  return edits;
}
