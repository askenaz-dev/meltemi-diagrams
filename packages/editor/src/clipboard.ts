import { formatStyleValue, planEdit, type EditOperation } from "@meltemi/diagrams-edit";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  compile,
  type FlowDiagram,
  type PlaceEntry,
  type Point,
  type RouteEntry,
  type SizeEntry,
} from "@meltemi/diagrams-model";
import { diagramView, type DocumentAnalysis } from "./analysis.js";
import { messages } from "./messages/index.js";

const INDENT = "  ";

/** Re-indents a statement copied from the source to `indent`. */
function copyStatement(text: string, start: number, end: number, indent: string): string {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const base = /^[ \t]*/.exec(text.slice(lineStart, start))![0];
  return text
    .slice(start, end)
    .split(/\r?\n/)
    .map((line, i) =>
      i === 0 ? indent + line : line.startsWith(base) ? indent + line.slice(base.length) : line,
    )
    .join("\n");
}

const fmt = (n: number) => String(Math.round(n));

/**
 * A complete `.meltemi` source with the selected elements (groups with their children), the
 * relations among them, their placement and their styles. Unplaced elements get the position they
 * are drawn at, so the fragment pastes as it looks.
 */
export function copyFragment(
  analysis: DocumentAnalysis,
  diagramId: string,
  ids: readonly string[],
): string | undefined {
  const view = diagramView(analysis, diagramId);
  if (!view) return undefined;
  const diagram = view.diagram;
  const text = analysis.text;
  const selected = new Set(ids.filter((id) => diagram.elementsById.has(id)));
  const inSelectedGroup = (path: readonly string[]) => path.some((g) => selected.has(g));
  const copied = diagram.elements.filter((e) => selected.has(e.id) || inSelectedGroup(e.groupPath));
  if (copied.length === 0) return undefined;
  const copiedIds = new Set(copied.map((e) => e.id));
  const lines: string[] = [];

  const free = diagram.type === "free";
  for (const element of copied) {
    if (inSelectedGroup(element.groupPath)) continue; // inside a copied group's text
    lines.push(
      element.node
        ? copyStatement(text, element.node.start, element.node.end, INDENT)
        : `${INDENT}${free ? "box" : "node"} ${element.id} ${JSON.stringify(element.label)}`,
    );
  }
  const relations = diagram.relations.filter((r) => copiedIds.has(r.from) && copiedIds.has(r.to));
  for (const relation of relations) {
    if (inSelectedGroup(relation.groupPath)) continue;
    lines.push(copyStatement(text, relation.node.start, relation.node.end, INDENT));
  }
  const relationIds = new Set(relations.flatMap((r) => (r.id === null ? [] : [r.id])));

  const placement: string[] = [];
  for (const element of copied) {
    const place = diagram.placement.find(
      (p): p is PlaceEntry => p.statement === "place" && p.target === element.id,
    );
    const size = diagram.placement.find(
      (p): p is SizeEntry => p.statement === "size" && p.target === element.id,
    );
    const box = view.layout?.boxes?.get(element.id);
    // In free diagrams a child copied without its group takes the position it is drawn at.
    const detached = free && element.groupPath.length > 0 && !inSelectedGroup(element.groupPath);
    if (place && !detached)
      placement.push(copyStatement(text, place.node.start, place.node.end, INDENT + INDENT));
    else if (box && (element.kind !== "group" || free)) {
      placement.push(
        `${INDENT}${INDENT}place ${element.id} at (${fmt(box.x + box.width / 2)}, ${fmt(box.y + box.height / 2)})`,
      );
    }
    if (size) placement.push(copyStatement(text, size.node.start, size.node.end, INDENT + INDENT));
  }
  for (const entry of diagram.placement) {
    if (
      (entry.statement === "route" || entry.statement === "label") &&
      relationIds.has(entry.target)
    ) {
      placement.push(copyStatement(text, entry.node.start, entry.node.end, INDENT + INDENT));
    }
  }
  if (placement.length > 0) lines.push(`${INDENT}placement {`, ...placement, `${INDENT}}`);

  // Styles and animations, rebuilt for the copied targets only.
  const styled = new Map<string, string[]>();
  for (const entry of diagram.styles) {
    const target = entry.target;
    if (!(entry.targetKind === "element" ? copiedIds.has(target) : relationIds.has(target)))
      continue;
    const parts = styled.get(target) ?? [];
    for (const [property, value] of Object.entries(entry.properties)) {
      parts.push(`${property} ${formatStyleValue(property, value)}`);
    }
    if (entry.classes.length > 0)
      parts.push(`class ${entry.classes.map((c) => c.name).join(", ")}`);
    styled.set(target, parts);
  }
  for (const [target, parts] of styled) {
    if (parts.length > 0) lines.push(`${INDENT}style ${target} { ${parts.join("; ")} }`);
  }
  for (const entry of diagram.animations) {
    const target = entry.target;
    if (!(entry.targetKind === "element" ? copiedIds.has(target) : relationIds.has(target)))
      continue;
    const parts = [
      entry.effect ? `effect ${entry.effect}` : "",
      entry.durationMs !== null ? `duration ${entry.durationMs}ms` : "",
      entry.repeat !== null ? `repeat ${entry.repeat}` : "",
    ].filter((p) => p !== "");
    lines.push(`${INDENT}animate ${target} { ${parts.join("; ")} }`);
  }
  const layers =
    diagram.properties.layers.length > 1
      ? `${INDENT}layers ${diagram.properties.layers.join(", ")}\n`
      : "";
  return `language "0.2"\n\ndiagram clipboard: ${diagram.type} {\n${INDENT}layout manual\n${layers}${lines.join("\n")}\n}\n`;
}

/** Whether a text is a fragment that can be pasted: one diagram without syntax errors. */
function fragmentDiagram(text: string): FlowDiagram | undefined {
  const compilation = compile(text);
  const diagrams = compilation.document.diagrams;
  return diagrams.length === 1 && !diagrams[0]!.hasSyntaxErrors ? diagrams[0] : undefined;
}

export type PasteResult =
  | {
      readonly ok: true;
      readonly operations: readonly EditOperation[];
      readonly ids: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The operations that paste a fragment into a diagram: clashing ids get a `_2`, `_3`… suffix,
 * placed elements and waypoints move by `shift` (or so that their centre lands on `at`).
 */
export function pasteOperations(
  analysis: DocumentAnalysis,
  diagramId: string,
  fragment: string,
  where: { readonly shift: Point } | { readonly at: Point },
): PasteResult {
  const reasons = messages().reasons;
  const view = diagramView(analysis, diagramId);
  if (!view) return { ok: false, reason: reasons.noDiagram(diagramId) };
  let diagram = fragmentDiagram(fragment);
  if (!diagram) return { ok: false, reason: reasons.notFragment };
  const target = view.diagram;
  let text = fragment;
  const apply = (operation: EditOperation): string | undefined => {
    const result = planEdit(compile(text), operation);
    if (!result.ok) return result.rejection.reason;
    text = applyTextEdits(text, result.plan.edits);
    diagram = fragmentDiagram(text);
    return undefined;
  };

  // Fresh ids for those that clash with the diagram or with each other.
  const used = new Set<string>([
    ...target.elementsById.keys(),
    ...target.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
    ...diagram.elements.map((e) => e.id),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
  ]);
  const fresh = (id: string) => {
    let n = 2;
    while (used.has(`${id}_${n}`)) n++;
    used.add(`${id}_${n}`);
    return `${id}_${n}`;
  };
  const clashes = (id: string) =>
    target.elementsById.has(id) || target.relations.some((r) => r.id === id);
  const ids: string[] = [];
  for (const element of [...diagram.elements]) {
    if (element.implicit) continue;
    const id = clashes(element.id) ? fresh(element.id) : element.id;
    if (id !== element.id) {
      const error = apply({
        kind: "renameElement",
        diagram: diagram!.id,
        element: element.id,
        newId: id,
      });
      if (error) return { ok: false, reason: error };
    }
    ids.push(id);
  }
  for (const relation of [...diagram!.relations]) {
    if (relation.id === null || !clashes(relation.id)) continue;
    const error = apply({
      kind: "renameRelation",
      diagram: diagram!.id,
      relation: relation.id,
      newId: fresh(relation.id),
    });
    if (error) return { ok: false, reason: error };
  }

  // Move what is placed; in free diagrams, group children move with their group.
  const topLevel = (id: string) =>
    target.type !== "free" || (diagram!.elementsById.get(id)?.groupPath.length ?? 0) === 0;
  const places = diagram!.placement.filter(
    (p): p is PlaceEntry => p.statement === "place" && topLevel(p.target),
  );
  let shift = "shift" in where ? where.shift : { x: 0, y: 0 };
  if ("at" in where && places.length > 0) {
    const xs = places.map((p) => p.x);
    const ys = places.map((p) => p.y);
    shift = {
      x: Math.round(where.at.x - (Math.min(...xs) + Math.max(...xs)) / 2),
      y: Math.round(where.at.y - (Math.min(...ys) + Math.max(...ys)) / 2),
    };
  }
  if (shift.x !== 0 || shift.y !== 0) {
    for (const place of places) {
      const error = apply({
        kind: "setPosition",
        diagram: diagram!.id,
        element: place.target,
        x: place.x + shift.x,
        y: place.y + shift.y,
      });
      if (error) return { ok: false, reason: error };
    }
    for (const route of diagram!.placement.filter(
      (p): p is RouteEntry => p.statement === "route" && p.via.length > 0,
    )) {
      const error = apply({
        kind: "setRoute",
        diagram: diagram!.id,
        relation: route.target,
        via: route.via.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })),
      });
      if (error) return { ok: false, reason: error };
    }
  }
  return {
    ok: true,
    operations: [{ kind: "insertFragment", diagram: diagramId, fragment: text }],
    ids,
  };
}
