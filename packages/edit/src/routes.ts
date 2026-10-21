import type { Arg, KeywordStatement } from "@meltemi/diagrams-language";
import { reject } from "./context.js";
import { reasons } from "./messages/index.js";
import { formatNumber } from "./text.js";

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

/** Refuses a point that is not a percentage of a compass side. */
export function requireEndPosition(port: string | null | undefined, position: number): void {
  if (port === null || port === undefined || !SIDES.includes(port)) {
    reject("edit.invalid-value", reasons().ports.endSide(port ?? "auto"));
  }
  if (!Number.isFinite(position) || position < 0 || position > 100) {
    reject("edit.invalid-value", reasons().ports.endPosition);
  }
}
