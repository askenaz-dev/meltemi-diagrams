import type { Range } from "@meltemi/diagrams-language";
import type {
  Compilation,
  EntityReference,
  FlowDiagram,
  ModelEntity,
  ResolvedModel,
  StoryEntityReference,
} from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { entryOf, kindWord, serviceMessages } from "../messages/services.js";

/** An entity named at a position of the text, with the model it belongs to. */
export interface EntityAt {
  /** The model: `file` is null when it is in this document. */
  readonly model: ResolvedModel;
  /** The model's name where the reference is written. */
  readonly name: string;
  readonly entity: ModelEntity;
  readonly reference: EntityReference;
  readonly range: Range;
}

/** The model a name of the document leads to: a local model, or one the compilation resolved. */
export function modelNamed(compilation: Compilation, name: string): ResolvedModel | undefined {
  const local = compilation.document.models.find((m) => m.id === name);
  if (local) return { definition: local, file: null };
  return compilation.options.models?.(name);
}

/** The model a reference of a diagram names: the view's model, or the link's. */
function modelOfReference(
  compilation: Compilation,
  diagram: FlowDiagram,
  reference: EntityReference,
): ResolvedModel | undefined {
  if (reference.role !== "link" && diagram.c4?.resolved) return diagram.c4.resolved;
  return modelNamed(compilation, reference.model);
}

/**
 * The model of a story target in a C4 view: the view's model, in the view's file when the view is
 * imported.
 */
function modelOfStoryReference(reference: StoryEntityReference): ResolvedModel | undefined {
  const resolved = reference.view.diagram?.c4?.resolved;
  if (!resolved) return undefined;
  return reference.view.file === null
    ? resolved
    : { definition: resolved.definition, file: resolved.file ?? reference.view.file };
}

/** The entity whose name contains `offset` or ends at it: in a model, a view, a link or a story. */
export function entityAt(analysis: DocumentAnalysis, offset: number): EntityAt | undefined {
  return entityIn(analysis.compilation, offset);
}

/** `entityAt` on a compilation. */
export function entityIn(compilation: Compilation, offset: number): EntityAt | undefined {
  const lines = compilation.parse.lines;
  const hit = (r: EntityReference) => r.token.start <= offset && offset <= r.token.end;
  for (const model of compilation.document.models) {
    const reference = model.references.find(hit);
    const entity = reference && model.entitiesByPath.get(reference.path);
    if (reference && entity) {
      return {
        model: { definition: model, file: null },
        name: model.id,
        entity,
        reference,
        range: lines.range(reference.token),
      };
    }
  }
  for (const diagram of compilation.document.diagrams) {
    if (offset < diagram.node.start || offset > diagram.node.end) continue;
    const reference = diagram.entityReferences.find(hit);
    if (!reference) continue;
    const model = modelOfReference(compilation, diagram, reference);
    const entity = model?.definition.entitiesByPath.get(reference.path);
    if (model && entity) {
      return {
        model,
        name: reference.model,
        entity,
        reference,
        range: lines.range(reference.token),
      };
    }
  }
  for (const story of compilation.document.stories) {
    if (offset < story.node.start || offset > story.node.end) continue;
    const reference = story.entityReferences.find(hit);
    const model = reference && modelOfStoryReference(reference);
    const entity = model?.definition.entitiesByPath.get(reference!.path);
    if (reference && model && entity) {
      return {
        model,
        name: reference.model,
        entity,
        reference,
        range: lines.range(reference.token),
      };
    }
  }
  return undefined;
}

/** Whether two resolved models are the same model. */
export function sameModel(a: ResolvedModel, b: ResolvedModel): boolean {
  return a.file === b.file && a.definition.id === b.definition.id;
}

/** Every token of the document that names an entity of a model. */
export function entityReferencesIn(
  compilation: Compilation,
  model: ResolvedModel,
): EntityReference[] {
  const found: EntityReference[] = [];
  if (model.file === null) found.push(...model.definition.references);
  for (const diagram of compilation.document.diagrams) {
    for (const reference of diagram.entityReferences) {
      const target = modelOfReference(compilation, diagram, reference);
      if (target && sameModel(target, model)) found.push(reference);
    }
  }
  for (const story of compilation.document.stories) {
    for (const reference of story.entityReferences) {
      const target = modelOfStoryReference(reference);
      if (target && sameModel(target, model)) found.push(reference);
    }
  }
  return found;
}

/** The views of the document that draw an entity. */
export function viewsDrawing(
  compilation: Compilation,
  model: ResolvedModel,
  path: string,
): FlowDiagram[] {
  return compilation.document.diagrams.filter(
    (d) => d.c4?.resolved && sameModel(d.c4.resolved, model) && d.elementsById.has(path),
  );
}

/** Markdown about an entity: kind, path, label, technology, description and the views. */
export function entityHover(analysis: DocumentAnalysis, at: EntityAt): string {
  const t = serviceMessages();
  const entity = at.entity;
  const type = entryOf(entity.external ? t.externalC4Types : t.c4Types, entity.kind) ?? entity.kind;
  const lines = [
    `**${kindWord(entity.kind)}** \`${entity.path}\` — ${entity.label}`,
    "",
    `[${type}${entity.technology ? `: ${entity.technology}` : ""}]`,
  ];
  if (entity.description) lines.push("", entity.description.replace(/\n/g, "  \n"));
  const views = viewsDrawing(analysis.compilation, at.model, entity.path).map((d) => `\`${d.id}\``);
  const where =
    at.model.file === null
      ? t.hover.inModel(at.model.definition.id)
      : `${t.hover.inModel(at.name)}${t.imported}`;
  lines.push("", `${where}${views.length > 0 ? t.hover.drawnIn(views.join(", ")) : ""}`);
  return lines.join("\n");
}
