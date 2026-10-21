import type { EditOperation } from "@meltemi/diagrams-edit";
import type { FlowDiagram, Relation } from "@meltemi/diagrams-model";
import { messages } from "./messages/index.js";

/**
 * A free id for an anonymous relation: `<from>_<to>`, then `_2`, `_3`… `taken` holds ids given
 * to other relations in the same edit.
 */
export function freshRelationId(
  diagram: FlowDiagram,
  relation: Pick<Relation, "from" | "to">,
  taken: ReadonlySet<string> = new Set(),
): string {
  const used = new Set<string>([
    ...diagram.elementsById.keys(),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
    ...taken,
  ]);
  const base = `${relation.from}_${relation.to}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  return id;
}

/** The id of a relation, with the operation that names it first when it is anonymous. */
export function namedRelation(
  diagram: FlowDiagram,
  relation: Relation,
  taken: ReadonlySet<string> = new Set(),
): { id: string; operations: EditOperation[] } {
  if (relation.id !== null) return { id: relation.id, operations: [] };
  const id = freshRelationId(diagram, relation, taken);
  return {
    id,
    operations: [
      { kind: "materializeRelationId", diagram: diagram.id, relationKey: relation.key, id },
    ],
  };
}

/**
 * The ids that style and effect fields write for their targets, naming anonymous relations first
 * (`<from>_<to>`, distinct within the edit). C4 views draw the relations of the model, which are
 * named there; sequence messages are named like flow relations.
 */
export function styleTargets(
  diagram: FlowDiagram,
  ids: readonly string[],
):
  | {
      ok: true;
      targets: { id: string; target: string; targetKind: "element" | "relation" | "event" }[];
      operations: EditOperation[];
      named: string[];
    }
  | { ok: false; reason: string } {
  const taken = new Set<string>();
  const targets: { id: string; target: string; targetKind: "element" | "relation" | "event" }[] =
    [];
  const operations: EditOperation[] = [];
  const named: string[] = [];
  for (const id of ids) {
    const relation = diagram.relationsByKey.get(id);
    const event = relation ? undefined : diagram.eventsByKey.get(id);
    if (relation) {
      if (relation.id === null && diagram.type === "c4") {
        return { ok: false, reason: messages().c4.nameRelation };
      }
      const name = namedRelation(diagram, relation, taken);
      if (name.operations.length > 0) {
        taken.add(name.id);
        named.push(name.id);
        operations.push(...name.operations);
      }
      targets.push({ id, target: name.id, targetKind: "relation" });
    } else if (event) {
      targets.push({ id, target: event.id ?? id, targetKind: "event" });
    } else targets.push({ id, target: id, targetKind: "element" });
  }
  return { ok: true, targets, operations, named };
}

/** The status line's note for relations named by an edit, in the interface language. */
export function namedNotice(named: readonly string[]): string | undefined {
  if (named.length === 0) return undefined;
  return messages().named(named);
}
