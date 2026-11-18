import {
  tokensOf,
  type Arg,
  type KeywordStatement,
  type QualifiedRef,
  type TextEdit,
  type Token,
} from "@meltemi/diagrams-language";
import { reject } from "./context.js";
import { reasons } from "./messages/index.js";
import { formatNumber, hasOnlyWhitespaceTrivia, sameNumber } from "./text.js";

/** The compass sides a route end can be pinned to a point of. */
const SIDES: readonly string[] = ["north", "south", "east", "west"];

/**
 * The parts of a `route` statement: each end, the percentage written after it (the point of its
 * side), and the waypoint list.
 */
export interface RouteParts {
  readonly fromRef: Arg | undefined;
  readonly fromAt: Arg | undefined;
  readonly toRef: Arg | undefined;
  readonly toAt: Arg | undefined;
  readonly viaList: Arg | undefined;
}

export function routeParts(node: KeywordStatement): RouteParts {
  const args = node.args;
  let i = 2;
  const fromRef = args[i++];
  const fromAt = args[i]?.kind === "NumberLiteral" ? args[i++] : undefined;
  i++; // `to`
  const toRef = args[i++];
  const toAt = args[i]?.kind === "NumberLiteral" ? args[i++] : undefined;
  i++; // `via`
  return { fromRef, fromAt, toRef, toAt, viaList: args[i] };
}

/**
 * The written end of a route: the bare element when `port` is null (the layout chooses), the
 * element and its port, and the percentage of the side when the end is pinned to a point.
 */
export function endpointText(element: string, port: string | null, position?: number): string {
  if (port === null) return element;
  return position === undefined
    ? `${element}.${port}`
    : `${element}.${port} ${formatNumber(position)}%`;
}

/** Rewrites a route end one token at a time, keeping comments between its parts. */
export function routeEndEdits(
  ref: QualifiedRef,
  at: Arg | undefined,
  element: string,
  port: string | null,
  position?: number,
): TextEdit[] {
  const tokens = [...tokensOf(ref)];
  const parts = endpointText(element, port).split(/(\.)/);
  const edits: TextEdit[] = [];
  const write = (token: Token, value: string) => {
    if (token.text === value) return;
    const start = value === "" && hasOnlyWhitespaceTrivia(token) ? token.fullStart : token.start;
    edits.push({ start, end: token.end, newText: value });
  };
  tokens.forEach((token, i) => write(token, parts[i] ?? ""));
  let suffix = parts.slice(tokens.length).join("");
  const percent = position === undefined ? "" : `${formatNumber(position)}%`;
  if (at?.kind !== "NumberLiteral") {
    if (percent !== "") suffix += ` ${percent}`;
  } else if (position === undefined || !sameNumber(at.value, position)) {
    write(at.token, percent);
  }
  if (suffix !== "") edits.push({ start: ref.end, end: ref.end, newText: suffix });
  return edits;
}

/** Refuses a point that is not a percentage of a compass side. */
export function requireEndPosition(port: string | null | undefined, position: number): void {
  if (port === null || port === undefined || !SIDES.includes(port)) {
    reject("edit.invalid-value", reasons().ports.endSide(port ?? "auto"));
  }
  if (!Number.isFinite(position) || position < 0 || position > 100) {
    reject("edit.invalid-value", reasons().ports.endPosition);
  }
}
