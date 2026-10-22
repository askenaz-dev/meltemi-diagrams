import type { EditOperation } from "@meltemi/diagrams-edit";
import type { FlowDiagram, Relation, SequenceEvent } from "@meltemi/diagrams-model";
import { messages } from "./messages/index.js";

/**
 * A free id for an anonymous note or fragment: `<kind><n>` (`note1`, `alt2`), as the sequence
 * tools name what they insert.
 */
export function freshEventId(
  diagram: FlowDiagram,
  event: SequenceEvent,
  taken: ReadonlySet<string> = new Set(),
): string {
  const base = event.kind === "fragment" ? event.operator : event.kind;
  const used = new Set<string>([
    ...diagram.elementsById.keys(),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
    ...diagram.eventsByKey.keys(),
    ...taken,
  ]);
  for (let n = 1; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

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
  return freeId(`${relation.from}_${relation.to}`, used);
}

/**
 * A free id for an anonymous relation of the model a C4 view draws: the entity paths of its
 * ends joined with `_` (`shop_api_bank`), then `_2`, `_3`…, free among the model's relation ids
 * and entity paths and the view's ids.
 */
export function freshModelRelationId(
  diagram: FlowDiagram,
  relation: Pick<Relation, "from" | "to">,
  taken: ReadonlySet<string> = new Set(),
): string {
  const model = diagram.c4?.resolved?.definition;
  const used = new Set<string>([
    ...diagram.elementsById.keys(),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
    ...(model?.relations.flatMap((r) => (r.id === null ? [] : [r.id])) ?? []),
    ...(model?.entitiesByPath.keys() ?? []),
    ...taken,
  ]);
  return freeId(`${relation.from}_${relation.to}`.replace(/\./g, "_"), used);
}

function freeId(base: string, used: ReadonlySet<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  return id;
}

/**
 * The id of a relation, with the operation that names it first when it is anonymous: in the
 * relation statement of flow, free and sequence diagrams; in the model relation a C4 view draws,
 * which keeps its key in the view.
 */
export function namedRelation(
  diagram: FlowDiagram,
  relation: Relation,
  taken: ReadonlySet<string> = new Set(),
): { id: string; operations: EditOperation[] } {
  if (relation.id !== null) return { id: relation.id, operations: [] };
  if (diagram.type === "c4") {
    const model = diagram.c4?.resolved?.definition;
    const source = model?.relationsByKey.get(relation.key);
    if (!model || !source) {
      // A combination without an id, or a model not resolved: nothing names it from here.
      return { id: relation.key, operations: [] };
    }
    const id = freshModelRelationId(diagram, source, taken);
    return {
      id,
      operations: [
        {
          kind: "setModelRelationProperty",
          model: model.id,
          relation: source.key,
          property: "id",
          value: id,
        },
      ],
    };
  }
  const id = freshRelationId(diagram, relation, taken);
  return {
    id,
    operations: [
      { kind: "materializeRelationId", diagram: diagram.id, relationKey: relation.key, id },
    ],
  };
}

/** Whether a relation of a C4 view can be named from the view: it stands for a model relation. */
export function nameable(diagram: FlowDiagram, relation: Relation): boolean {
  if (relation.id !== null || diagram.type !== "c4") return true;
  return diagram.c4?.resolved?.definition.relationsByKey.has(relation.key) ?? false;
}

/**
 * The ids that style and effect fields write for their targets, naming anonymous relations first
 * (`<from>_<to>`, distinct within the edit): relations of flow and free diagrams and sequence
 * messages in their statement, relations of C4 views in the model they come from; and anonymous
 * notes and fragments (`note1`, `alt1`).
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
      if (!nameable(diagram, relation)) {
        return { ok: false, reason: messages().c4.nameCombination };
      }
      const name = namedRelation(diagram, relation, taken);
      if (name.operations.length > 0) {
        taken.add(name.id);
        named.push(name.id);
        operations.push(...name.operations);
      }
      targets.push({ id, target: name.id, targetKind: "relation" });
    } else if (event) {
      // Notes and fragments take styles and effects by their id: anonymous ones are named first.
      if (event.id === null && (event.kind === "note" || event.kind === "fragment")) {
        const named_ = freshEventId(diagram, event, taken);
        taken.add(named_);
        named.push(named_);
        operations.push({
          kind: "renameEvent",
          diagram: diagram.id,
          event: event.key,
          newId: named_,
        });
        targets.push({ id, target: named_, targetKind: "event" });
      } else targets.push({ id, target: event.id ?? id, targetKind: "event" });
    } else targets.push({ id, target: id, targetKind: "element" });
  }
  return { ok: true, targets, operations, named };
}

/** The status line's note for relations named by an edit, in the interface language. */
export function namedNotice(named: readonly string[]): string | undefined {
  if (named.length === 0) return undefined;
  return messages().named(named);
}
