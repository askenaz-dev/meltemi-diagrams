import { SHAPE_SIZES, type ShapeSize } from "@meltemi/diagrams-layout/shapes";
import { SHAPES, type CanvasProfile, type ShapeName } from "./protocol.js";

/**
 * The relation kinds of the palette's arrow button, in the order its menu lists them and R cycles
 * through them: `->`, `-->`, then the two-way `<->` and `<-->`.
 */
export const ARROW_KINDS = ["->", "-->", "<->", "<-->"] as const;
export type ArrowKind = (typeof ARROW_KINDS)[number];

/**
 * The arrow kinds a profile offers: C4 views draw relations one way, and sequence diagrams draw
 * messages (their tool keeps Shift for a reply), so they offer none.
 */
export function arrowKinds(profile: CanvasProfile): readonly ArrowKind[] {
  if (profile === "sequence") return [];
  if (profile === "c4") return ARROW_KINDS.filter((kind) => !twoWay(kind));
  return ARROW_KINDS;
}

const twoWay = (kind: ArrowKind) => kind.startsWith("<");
const dashed = (kind: ArrowKind) => kind.endsWith("-->");

/**
 * The kind a canvas keeps on a profile: a two-way kind becomes the one-way kind with its line in a
 * C4 view, so that switching diagrams never arms a kind the view refuses.
 */
export function arrowKindIn(kind: ArrowKind, profile: CanvasProfile): ArrowKind {
  const kinds = arrowKinds(profile);
  if (kinds.length === 0 || kinds.includes(kind)) return kind;
  return dashed(kind) ? "-->" : "->";
}

/** The kind after `kind` in a profile's cycle: what R chooses while the relation tool is armed. */
export function nextArrowKind(kind: ArrowKind, profile: CanvasProfile): ArrowKind {
  const kinds = arrowKinds(profile);
  if (kinds.length === 0) return kind;
  return kinds[(kinds.indexOf(arrowKindIn(kind, profile)) + 1) % kinds.length]!;
}

/**
 * How a relation of a kind is written, as the `connect` action carries it: its line and whether it
 * has a head at both ends. `flip` (Shift on the second click) swaps solid and dashed.
 */
export function arrowKindLine(
  kind: ArrowKind,
  flip = false,
): { readonly line: "solid" | "dashed"; readonly twoWay: boolean } {
  return { line: dashed(kind) !== flip ? "dashed" : "solid", twoWay: twoWay(kind) };
}

/**
 * The size a new box or node of a shape gets, the layout's own default (at label size 13): the
 * canvas's ghost and the free cell it is placed in.
 */
export function shapeSize(shape: ShapeName): ShapeSize {
  return SHAPE_SIZES[shape];
}

/** Text compared without case and accents: `Triángulo` is `triangulo`. */
function folded(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The shapes a typed query finds, best first: those whose name in the interface language
 * (`nameOf`) or in English (the value) starts with it, then those with a word that does, then
 * those that contain it; palette order within each. An empty query finds every shape.
 */
export function findShapes(query: string, nameOf: (shape: ShapeName) => string): ShapeName[] {
  const wanted = folded(query.trim());
  if (wanted === "") return [...SHAPES];
  const rank = (shape: ShapeName): number => {
    const names = [folded(nameOf(shape)), folded(shape)];
    if (names.some((name) => name.startsWith(wanted))) return 0;
    if (names.some((name) => name.split(/[\s-]+/).some((word) => word.startsWith(wanted))))
      return 1;
    return names.some((name) => name.includes(wanted)) ? 2 : -1;
  };
  return SHAPES.map((shape) => ({ shape, rank: rank(shape) }))
    .filter((found) => found.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((found) => found.shape);
}
