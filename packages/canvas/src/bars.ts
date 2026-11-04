import type { EventInfo, RelationInfo } from "@meltemi/diagrams-editor/canvas";

/**
 * The row an end of an activation bar dragged to `y` (diagram coordinates) snaps to: the event
 * whose row lies under the pointer, the innermost one where rows nest (a message inside a
 * fragment, which spans its branches), and the boundary below that row, where the handle is
 * drawn. Rows without height (an `activate`, a `deactivate`) are passed over: they sit on a row of
 * their own. Above the first row the first is taken, past the last row the one that ends lowest.
 * Undefined when the diagram has no row.
 */
export function barRowAt(
  events: readonly EventInfo[],
  y: number,
): { readonly key: string; readonly y: number } | undefined {
  const rows = events.filter((event) => event.height > 0);
  if (rows.length === 0) return undefined;
  const inside = rows.filter((event) => y >= event.y && y < event.y + event.height);
  let row: EventInfo | undefined;
  if (inside.length > 0) {
    // The innermost: the shortest of the rows that hold the pointer.
    row = inside.reduce((best, event) => (event.height < best.height ? event : best));
  } else {
    const top = Math.min(...rows.map((event) => event.y));
    if (y < top) row = rows.find((event) => event.y === top);
    else {
      // Past the last row: the one that ends lowest, the outermost where a fragment ends there.
      const bottom = Math.max(...rows.map((event) => event.y + event.height));
      const last = rows.filter((event) => event.y + event.height === bottom);
      row = last.reduce((best, event) => (event.height > best.height ? event : best));
    }
  }
  return row && { key: row.key, y: row.y + row.height };
}

/**
 * Where an end of `participant`'s bar is drawn when it is put after the message `relation` (its
 * points as drawn): at its arrow when the participant sends or receives it (a self-call's at the
 * end of its loop), as the layout ends a bar at the last arrow that touches it; undefined for a
 * message between others, or no message, whose row's boundary is the end.
 */
export function barEndY(
  relation: Pick<RelationInfo, "from" | "to" | "points"> | undefined,
  participant: string | null,
): number | undefined {
  if (!relation || participant === null) return undefined;
  if (relation.from !== participant && relation.to !== participant) return undefined;
  const points = relation.points;
  return relation.from === relation.to ? points[points.length - 1]?.y : points[0]?.y;
}

/**
 * What a written activation bar spans, for the status line: its participant, the message it
 * starts at (the last message before its `activate`, null when none comes before it) and the last
 * message before its `deactivate` (the message it starts at when none comes between them; null for
 * a bar open to the end). Undefined when `key` is no `activate` of `events`.
 */
export function barSpan(
  events: readonly EventInfo[],
  key: string,
):
  | { readonly participant: string; readonly from: string | null; readonly to: string | null }
  | undefined {
  const start = events.findIndex((event) => event.key === key);
  const activate = events[start];
  if (activate?.kind !== "activate" || activate.participant === null) return undefined;
  const messageBefore = (index: number, after: number): string | null => {
    for (let i = index - 1; i > after; i--) {
      if (events[i]!.kind === "message") return events[i]!.key;
    }
    return null;
  };
  const from = messageBefore(start, -1);
  if (activate.pair === null) return { participant: activate.participant, from, to: null };
  const end = events.findIndex((event) => event.key === activate.pair);
  const to = end < 0 ? null : (messageBefore(end, start) ?? from);
  return { participant: activate.participant, from, to };
}
