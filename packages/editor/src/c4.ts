import type { EditOperation } from "@meltemi/diagrams-edit";
import {
  C4_LEVELS,
  allowedEntities,
  type C4Level,
  type Element,
  type EntityKind,
  type FlowDiagram,
  type ModelDefinition,
  type Relation,
} from "@meltemi/diagrams-model";
import type { InspectorField } from "./canvas/protocol.js";
import { messages } from "./messages/index.js";
import { nameable, namedRelation } from "./targets.js";

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

/**
 * The entity kinds the palette of a C4 view offers: the ones its level draws (a container view
 * draws the containers and data stores of its system, a component view the components of its
 * container), with persons and systems at every level.
 */
export function allowedKinds(level: C4Level): EntityKind[] {
  switch (level) {
    case "context":
      return ["person", "system"];
    case "container":
      return ["container", "datastore", "person", "system"];
    case "component":
      return ["component", "person", "system"];
  }
}

/**
 * Where an entity of `kind` created on a view is declared: inside the view's scope for the kinds
 * the scope holds (containers and data stores of a system, components of a container), at the
 * model's root for persons and systems.
 */
export function entityParent(diagram: FlowDiagram, kind: EntityKind): string | null {
  if (kind === "person" || kind === "system") return null;
  return diagram.c4?.scope ?? null;
}

/** A free id for a new entity under `parent`: `<kind><n>`, as the model's own operations name it. */
export function freshEntityPath(
  model: ModelDefinition,
  parent: string | null,
  kind: EntityKind,
): string {
  for (let n = 1; ; n++) {
    const path = parent ? `${parent}.${kind}${n}` : `${kind}${n}`;
    if (!model.entitiesByPath.has(path)) return path;
  }
}

/** An entity on the clipboard of a C4 view: what a copy of it is declared with, and where. */
export interface CopiedEntity {
  readonly kind: EntityKind;
  readonly id: string;
  readonly label: string;
  readonly technology: string | null;
  readonly description: string | null;
  readonly external: boolean;
  /** The centre it was drawn at, in the view it was copied from. */
  readonly at: { readonly x: number; readonly y: number } | null;
}

const quote = (text: string) => JSON.stringify(text);

/**
 * The clipboard text of entities copied from a C4 view: a `model clipboard` block declaring each
 * (kind, id, label, technology, description, external; not its children or relations) and a free
 * diagram holding where each was drawn. It is a document of its own, which other editors read as
 * text and a C4 view reads back with `copiedEntities`.
 */
export function entityClipboard(
  diagram: FlowDiagram,
  ids: readonly string[],
  boxes: ReadonlyMap<string, { x: number; y: number; width: number; height: number }> | undefined,
): string | undefined {
  const model = diagram.c4?.resolved?.definition;
  if (!model) return undefined;
  const entities = ids.flatMap((id) => {
    const entity = model.entitiesByPath.get(id);
    return entity && diagram.elementsById.has(id) ? [entity] : [];
  });
  if (entities.length === 0) return undefined;
  // Containers and data stores are declared in a system, components in a container: the
  // copies sit in holders of those kinds, which a paste leaves out.
  const lines: Record<"root" | "system" | "container", string[]> = {
    root: [],
    system: [],
    container: [],
  };
  const places: string[] = [];
  const taken = new Set<string>([HOLDER]);
  for (const entity of entities) {
    let id = entity.id;
    for (let n = 2; taken.has(id); n++) id = `${entity.id}_${n}`;
    taken.add(id);
    const block = [
      entity.technology !== null ? `technology ${quote(entity.technology)}` : "",
      entity.description !== null ? `description ${quote(entity.description)}` : "",
      entity.external ? "external" : "",
    ].filter((p) => p !== "");
    const holder =
      entity.kind === "component"
        ? "container"
        : entity.kind === "container" || entity.kind === "datastore"
          ? "system"
          : "root";
    lines[holder].push(
      `${entity.kind} ${id} ${quote(entity.label)}${block.length > 0 ? ` { ${block.join("; ")} }` : ""}`,
    );
    const box = boxes?.get(entity.path);
    if (box) {
      const x = Math.round(box.x + box.width / 2);
      const y = Math.round(box.y + box.height / 2);
      places.push(`    place ${id} at (${x}, ${y})`);
    }
  }
  const body = [
    ...lines.root.map((line) => `  ${line}`),
    ...(lines.system.length + lines.container.length > 0
      ? [
          `  system ${HOLDER} "" {`,
          ...lines.system.map((line) => `    ${line}`),
          ...(lines.container.length > 0
            ? [
                `    container ${HOLDER} "" {`,
                ...lines.container.map((line) => `      ${line}`),
                "    }",
              ]
            : []),
          "  }",
        ]
      : []),
  ];
  const boxesText = [...taken]
    .filter((id) => id !== HOLDER)
    .map((id) => `  box ${id} ""`)
    .join("\n");
  const placement = places.length > 0 ? `\n  placement {\n${places.join("\n")}\n  }` : "";
  return `language "0.2"\n\nmodel clipboard {\n${body.join("\n")}\n}\n\ndiagram clipboard: free {\n  layout manual\n${boxesText}${placement}\n}\n`;
}

/** The id of the entities that hold copied containers and components on the clipboard. */
const HOLDER = "meltemi_clipboard";

/** The entities of a C4 clipboard text, or undefined when the text is not one. */
export function copiedEntities(
  models: readonly ModelDefinition[],
  diagrams: readonly FlowDiagram[],
): CopiedEntity[] | undefined {
  const model = models.find((m) => m.id === "clipboard");
  if (!model) return undefined;
  const sheet = diagrams.find((d) => d.id === "clipboard");
  const places = new Map<string, { x: number; y: number }>();
  for (const entry of sheet?.placement ?? []) {
    if (entry.statement === "place") places.set(entry.target, { x: entry.x, y: entry.y });
  }
  return model.entities
    .filter((e) => e.id !== HOLDER)
    .map((e) => ({
      kind: e.kind,
      id: e.id,
      label: e.label,
      technology: e.technology,
      description: e.description,
      external: e.external,
      at: places.get(e.id) ?? null,
    }));
}

/**
 * The operations that paste copied entities into a C4 view: each entity of a kind the view's level
 * draws is declared again in the model, where the level puts it, under its id or `<id>_2`, `_3`…,
 * with its label, technology, description and `external`, then included in the view and placed
 * (by `shift` from where it was drawn, or so that the copies' centre lands on `at`). Relations
 * are not copied. The ids are the new entities' paths.
 */
export function pasteEntities(
  diagram: FlowDiagram,
  placed: boolean,
  copied: readonly CopiedEntity[],
  where: { readonly shift: { x: number; y: number } } | { readonly at: { x: number; y: number } },
):
  | { readonly ok: true; readonly operations: EditOperation[]; readonly ids: string[] }
  | { readonly ok: false; readonly reason: string } {
  const c4 = diagram.c4;
  const model = c4?.resolved?.definition;
  if (!c4 || !model) return { ok: false, reason: messages().session.fixFirst };
  const kinds = allowedKinds(c4.level);
  const drawn = copied.filter((e) => kinds.includes(e.kind));
  if (drawn.length === 0) {
    return { ok: false, reason: messages().c4.kindNotDrawn(copied[0]?.kind ?? "", kinds) };
  }
  const located = drawn.filter((e) => e.at !== null);
  const centre =
    located.length > 0
      ? {
          x: located.reduce((sum, e) => sum + e.at!.x, 0) / located.length,
          y: located.reduce((sum, e) => sum + e.at!.y, 0) / located.length,
        }
      : null;
  const taken = new Set(model.entitiesByPath.keys());
  const operations: EditOperation[] = [];
  const ids: string[] = [];
  drawn.forEach((entity, index) => {
    const parent = entityParent(diagram, entity.kind);
    let id = entity.id;
    for (let n = 2; taken.has(parent ? `${parent}.${id}` : id); n++) id = `${entity.id}_${n}`;
    const path = parent ? `${parent}.${id}` : id;
    taken.add(path);
    ids.push(path);
    operations.push({
      kind: "createEntity",
      model: model.id,
      entityKind: entity.kind,
      ...(parent !== null ? { parent } : {}),
      id,
      label: entity.label,
    });
    const properties: ["technology" | "description" | "external", string | boolean | null][] = [
      ["technology", entity.technology],
      ["description", entity.description],
      ["external", entity.external ? true : null],
    ];
    for (const [property, value] of properties) {
      if (value === null) continue;
      operations.push({
        kind: "setEntityProperty",
        model: model.id,
        entity: path,
        property,
        value,
      });
    }
    operations.push({ kind: "includeEntity", diagram: diagram.id, entity: path });
    if (!placed) return;
    // Without a position of its own, a copy goes beside the last one.
    const from = entity.at ?? { x: (centre?.x ?? 0) + 40 * index, y: centre?.y ?? 0 };
    const to =
      "shift" in where
        ? { x: from.x + where.shift.x, y: from.y + where.shift.y }
        : {
            x: where.at.x + from.x - (centre?.x ?? from.x),
            y: where.at.y + from.y - (centre?.y ?? from.y),
          };
    operations.push({
      kind: "setPosition",
      diagram: diagram.id,
      element: path,
      x: Math.round(to.x),
      y: Math.round(to.y),
    });
  });
  return { ok: true, operations, ids };
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
  const elsewhere = !modelIsLocal(diagram);
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
    });
  }
  if (elsewhere) fields.push(modelFileField(diagram));
  return fields;
}

/** Where the model's fields are written when the model is in another file of the project. */
function modelFileField(diagram: FlowDiagram): InspectorField {
  return {
    name: "modelFile",
    label: messages().c4.fields.modelFile,
    type: "text",
    value: diagram.c4?.resolved?.file ?? null,
    readonly: true,
  };
}

/** Fields of a relation of a C4 view: the local label, the model relation and its sources. */
export function c4RelationFields(diagram: FlowDiagram, relation: Relation): InspectorField[] {
  const model = diagram.c4?.resolved?.definition;
  const local = diagram.c4?.labels.find((l) => l.target === relation.key);
  const combined = diagram.c4?.combined.includes(relation.key) ?? false;
  const source = combined ? undefined : model?.relationsByKey.get(relation.key);
  const elsewhere = !modelIsLocal(diagram);
  const words = messages();
  const fields: InspectorField[] = [
    // A model relation is named, or renamed, from here; a combination keeps the id it was written with.
    {
      name: "id",
      label: words.fields.id,
      type: source ? "id" : "text",
      value: relation.id,
      placeholder: relation.key,
      ...(source ? {} : { readonly: true }),
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
    });
    fields.push(
      field("label", words.c4.fields.modelLabel, source.label),
      field("technology", words.c4.fields.technology, source.technology),
      field("description", words.fields.description, source.description),
    );
    if (elsewhere) fields.push(modelFileField(diagram));
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
    if (relation) {
      // A local label names the relation; an anonymous model relation is named first.
      if (!nameable(diagram, relation)) return { ok: false, reason: messages().session.fixFirst };
      if (relation.id === null && !text) return { ok: true, operations: [] };
      const { id: named, operations } = namedRelation(diagram, relation);
      return {
        ok: true,
        operations: [
          ...operations,
          { kind: "setLocalLabel", diagram: diagram.id, target: named, label: text || null },
        ],
      };
    }
    return {
      ok: true,
      operations: [{ kind: "setLocalLabel", diagram: diagram.id, target: id, label: text || null }],
    };
  }
  if (field === "id") {
    // The id of a model relation: written into the model, where it names or renames it.
    const relation = diagram.relationsByKey.get(id);
    const source = relation && !c4.combined.includes(id) ? model.relationsByKey.get(id) : undefined;
    if (!source) return undefined;
    if (!text?.trim()) return { ok: true, operations: [] };
    return {
      ok: true,
      operations: [
        {
          kind: "setModelRelationProperty",
          model: model.id,
          relation: source.key,
          property: "id",
          value: text.trim(),
        },
      ],
    };
  }
  if (field.startsWith("entity.") || field.startsWith("relation.")) {
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
