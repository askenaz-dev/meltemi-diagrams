import type { EditOperation } from "@meltemi/diagrams-edit";
import {
  C4_LEVELS,
  allowedEntities,
  type Element,
  type FlowDiagram,
  type Relation,
} from "@meltemi/diagrams-model";
import type { InspectorField } from "./canvas/protocol.js";
import { messages } from "./messages/index.js";

/** The entities a view may draw and does not: what "Add from the model…" offers. */
export function entityChoices(
  diagram: FlowDiagram,
): { path: string; label: string; kind: string }[] {
  const c4 = diagram.c4;
  const model = c4?.resolved?.definition;
  if (!c4 || !model) return [];
  const allowed = allowedEntities(model, c4.level, c4.scope);
  return model.entities
    .filter((e) => allowed.has(e.path) && !diagram.elementsById.has(e.path))
    .map((e) => ({ path: e.path, label: e.label, kind: e.kind }));
}

/** Whether the view's model is in the same document, so that its fields can be written. */
export function modelIsLocal(diagram: FlowDiagram): boolean {
  return diagram.c4?.resolved?.file === null;
}

export type C4Result =
  | { readonly ok: true; readonly operations: readonly EditOperation[] }
  | { readonly ok: false; readonly reason: string };

/** The kind of an entity in words, lower case: `software system`, `external person`. */
function entityKind(element: Element, kind: string | undefined, external: boolean): string {
  const words = messages().c4;
  const kinds: Readonly<Record<string, string>> = external ? words.externalKinds : words.kinds;
  const known = kind !== undefined && Object.hasOwn(kinds, kind);
  return (known ? kinds[kind]! : element.kind).toLowerCase();
}

/** Fields of an element of a C4 view: the local label, then the entity's fields. */
export function c4ElementFields(diagram: FlowDiagram, element: Element): InspectorField[] {
  const model = diagram.c4?.resolved?.definition;
  const entity = model?.entitiesByPath.get(element.id);
  const local = diagram.c4?.labels.find((l) => l.target === element.id);
  const readonly = !modelIsLocal(diagram);
  const words = messages();
  const fields: InspectorField[] = [
    { name: "id", label: words.c4.fields.entity, type: "text", value: element.id, readonly: true },
    {
      name: "kind",
      label: words.fields.kind,
      type: "text",
      value: entityKind(element, entity?.kind, entity?.external ?? false),
      readonly: true,
    },
    {
      name: "label",
      label: words.c4.fields.localLabel,
      type: "text",
      value: local?.text ?? null,
      placeholder: entity?.label ?? element.label,
    },
  ];
  if (!entity) return fields;
  const entityField = (
    name: string,
    label: string,
    value: string | null,
    type: InspectorField["type"] = "text",
  ): InspectorField => ({
    name: `entity.${name}`,
    label,
    type,
    value,
    ...(readonly ? { readonly: true, placeholder: words.c4.readOnly } : {}),
  });
  fields.push(
    entityField("label", words.c4.fields.modelLabel, entity.label),
    entityField("description", words.fields.description, entity.description, "multiline"),
    entityField("technology", words.c4.fields.technology, entity.technology),
    entityField("url", words.fields.url, entity.url),
  );
  if (entity.kind === "person" || entity.kind === "system") {
    fields.push({
      name: "entity.external",
      label: words.c4.fields.external,
      type: "enum",
      value: entity.external ? "yes" : "no",
      options: ["no", "yes"],
      ...(readonly ? { readonly: true } : {}),
    });
  }
  return fields;
}

/** Fields of a relation of a C4 view: the local label, the model relation and its sources. */
export function c4RelationFields(diagram: FlowDiagram, relation: Relation): InspectorField[] {
  const model = diagram.c4?.resolved?.definition;
  const local = diagram.c4?.labels.find((l) => l.target === relation.key);
  const combined = diagram.c4?.combined.includes(relation.key) ?? false;
  const source = combined ? undefined : model?.relationsByKey.get(relation.key);
  const readonly = !modelIsLocal(diagram);
  const words = messages();
  const fields: InspectorField[] = [
    {
      name: "id",
      label: words.fields.id,
      type: "text",
      value: relation.id,
      placeholder: relation.key,
      readonly: true,
    },
    {
      name: "label",
      label: combined ? words.fields.label : words.c4.fields.localLabel,
      type: "text",
      value: combined ? relation.label : (local?.text ?? null),
      placeholder: source?.label ?? "",
    },
    {
      name: "sources",
      label: relation.derived ? words.c4.fields.standsForLifted : words.c4.fields.standsFor,
      type: "text",
      value: relation.sources.join(", "),
      readonly: true,
    },
  ];
  if (source) {
    const field = (name: string, label: string, value: string | null): InspectorField => ({
      name: `relation.${name}`,
      label,
      type: "text",
      value,
      ...(readonly ? { readonly: true, placeholder: words.c4.readOnly } : {}),
    });
    fields.push(
      field("label", words.c4.fields.modelLabel, source.label),
      field("technology", words.c4.fields.technology, source.technology),
      field("description", words.fields.description, source.description),
    );
  }
  return fields;
}

/** Fields of a C4 view: level, scope and model, then the shared diagram properties. */
export function c4DiagramFields(diagram: FlowDiagram): InspectorField[] {
  const c4 = diagram.c4!;
  const words = messages();
  return [
    {
      name: "level",
      label: words.c4.fields.level,
      type: "enum",
      value: c4.level,
      options: C4_LEVELS,
    },
    {
      name: "scope",
      label: words.c4.fields.scope,
      type: "text",
      value: c4.scope,
      placeholder: words.placeholders.none,
    },
    { name: "model", label: words.c4.fields.model, type: "text", value: c4.model, readonly: true },
  ];
}

/**
 * The operations that write a field of a C4 view: local labels in the view, entity and relation
 * fields in the model; undefined for the fields every profile shares.
 */
export function c4FieldOperations(
  diagram: FlowDiagram,
  id: string,
  field: string,
  value: string | number | null,
): C4Result | undefined {
  const c4 = diagram.c4;
  const model = c4?.resolved?.definition;
  if (!c4 || !model) return undefined;
  const text = value === null ? null : String(value);
  if (field === "label") {
    const relation = diagram.relationsByKey.get(id);
    if (relation && c4.combined.includes(id)) {
      return {
        ok: true,
        operations: [
          { kind: "setRelationLabel", diagram: diagram.id, relation: id, label: text || null },
        ],
      };
    }
    return {
      ok: true,
      operations: [{ kind: "setLocalLabel", diagram: diagram.id, target: id, label: text || null }],
    };
  }
  if (field.startsWith("entity.") || field.startsWith("relation.")) {
    if (!modelIsLocal(diagram)) return { ok: false, reason: messages().c4.readOnly };
    const [scope, property] = field.split(".") as [string, string];
    if (scope === "entity") {
      return {
        ok: true,
        operations: [
          {
            kind: "setEntityProperty",
            model: model.id,
            entity: id,
            property: property as "label" | "description" | "technology" | "external" | "url",
            value: property === "external" ? text === "yes" : text || null,
          },
        ],
      };
    }
    return {
      ok: true,
      operations: [
        {
          kind: "setModelRelationProperty",
          model: model.id,
          relation: id,
          property: property as "label" | "technology" | "description",
          value: text || null,
        },
      ],
    };
  }
  return undefined;
}
