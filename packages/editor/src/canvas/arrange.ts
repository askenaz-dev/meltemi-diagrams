import { center, unionBox, type Box, type Point } from "./geometry.js";

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * New centres that align the boxes: edges line up with the extreme box, centres with the centre
 * of the selection. Boxes already in line keep their centre.
 */
export function alignBoxes(boxes: ReadonlyMap<string, Box>, edge: AlignEdge): Map<string, Point> {
  const all = [...boxes.values()];
  const bounds = unionBox(all);
  const result = new Map<string, Point>();
  if (!bounds) return result;
  for (const [id, box] of boxes) {
    const c = center(box);
    switch (edge) {
      case "left":
        result.set(id, { x: bounds.x + box.width / 2, y: c.y });
        break;
      case "right":
        result.set(id, { x: bounds.x + bounds.width - box.width / 2, y: c.y });
        break;
      case "center":
        result.set(id, { x: bounds.x + bounds.width / 2, y: c.y });
        break;
      case "top":
        result.set(id, { x: c.x, y: bounds.y + box.height / 2 });
        break;
      case "bottom":
        result.set(id, { x: c.x, y: bounds.y + bounds.height - box.height / 2 });
        break;
      case "middle":
        result.set(id, { x: c.x, y: bounds.y + bounds.height / 2 });
        break;
    }
  }
  return result;
}

/**
 * New centres that spread three or more boxes with equal gaps along an axis, in the order of
 * their centres. The first and the last box stay.
 */
export function distributeBoxes(
  boxes: ReadonlyMap<string, Box>,
  axis: "horizontal" | "vertical",
): Map<string, Point> {
  const result = new Map<string, Point>();
  const horizontal = axis === "horizontal";
  const entries = [...boxes].sort(([, a], [, b]) =>
    horizontal ? center(a).x - center(b).x : center(a).y - center(b).y,
  );
  if (entries.length < 3) return result;
  const start = horizontal ? entries[0]![1].x : entries[0]![1].y;
  const last = entries[entries.length - 1]![1];
  const end = horizontal ? last.x + last.width : last.y + last.height;
  const total = entries.reduce((sum, [, b]) => sum + (horizontal ? b.width : b.height), 0);
  const gap = (end - start - total) / (entries.length - 1);
  let cursor = start;
  for (const [id, box] of entries) {
    const size = horizontal ? box.width : box.height;
    const c = center(box);
    result.set(
      id,
      horizontal ? { x: cursor + size / 2, y: c.y } : { x: c.x, y: cursor + size / 2 },
    );
    cursor += size + gap;
  }
  return result;
}
