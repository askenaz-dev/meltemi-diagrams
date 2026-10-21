import { planEdit, type EditOperation, type PlanResult } from "@meltemi/diagrams-edit";
import type { Range } from "@meltemi/diagrams-language";
import type {
  Element,
  FlowDiagram,
  Reference,
  SequenceEvent,
  TargetKind,
} from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { kindWord, serviceMessages } from "../messages/services.js";
import { referenceAt } from "../syntax.js";
import { entityAt, entityReferencesIn } from "./entities.js";
import { linkAt } from "./hover.js";
import { profileDefinition, profileSymbols } from "./profiles.js";
import { storyDiagramAt, storyReferencesTo, storySymbols, storyTargetAt } from "./stories.js";

export type SymbolKind =
  | "model"
  | "entity"
  | "diagram"
  | "group"
  | "element"
  | "relation"
  | "event"
  | "scenario"
  | "theme"
  | "story"
  | "scene"
  | "export";

export interface SymbolNode {
  readonly name: string;
  readonly detail: string;
  readonly kind: SymbolKind;
  readonly range: Range;
  readonly selectionRange: Range;
  readonly children: readonly SymbolNode[];
}

function elementSymbol(diagram: FlowDiagram, element: Element): SymbolNode {
  const children =
    element.kind === "group"
      ? diagram.elements
          .filter((e) => e.groupPath[e.groupPath.length - 1] === element.id)
          .map((e) => elementSymbol(diagram, e))
      : [];
  const kind = kindWord(element.kind);
  return {
    name: element.id,
    detail: element.label === element.id ? kind : `${kind} · ${element.label}`,
    kind: element.kind === "group" ? "group" : "element",
    range: element.range,
    selectionRange: element.idRange,
    children,
  };
}

/** The notes and fragments of a sequence diagram, fragments holding their nested events. */
function eventSymbols(events: readonly SequenceEvent[]): SymbolNode[] {
  const symbols: SymbolNode[] = [];
  for (const event of events) {
    if (event.kind === "note") {
      symbols.push({
        name: event.id ?? event.key,
        detail: `${kindWord("note")} · ${event.text.split("\n")[0]}`,
        kind: "event",
        range: event.range,
        selectionRange: event.idRange ?? event.range,
        children: [],
      });
    } else if (event.kind === "fragment") {
      symbols.push({
        name: event.id ?? event.key,
        detail: [event.operator, ...event.branches.map((b) => b.condition ?? "")]
          .filter((s) => s !== "")
          .join(" · "),
        kind: "event",
        range: event.range,
        selectionRange: event.idRange ?? event.range,
        children: eventSymbols(event.branches.flatMap((b) => b.events)),
      });
    }
  }
  return symbols;
}

/**
 * Diagrams with their groups, elements and relations, nested as written, the notes, fragments
 * and scenarios of sequence diagrams; and theme blocks.
 */
export function documentSymbols(analysis: DocumentAnalysis): SymbolNode[] {
  const t = serviceMessages().symbols;
  const symbols: SymbolNode[] = [];
  for (const diagram of analysis.compilation.document.diagrams) {
    const elements = diagram.elements
      .filter((e) => e.groupPath.length === 0)
      .map((e) => elementSymbol(diagram, e));
    const relations = diagram.relations.map((r): SymbolNode => ({
      name: r.id ?? `${r.from} ${r.line === "dashed" ? "-->" : "->"} ${r.to}`,
      detail: r.label ?? "",
      kind: "relation",
      range: r.range,
      selectionRange: r.idRange ?? r.range,
      children: [],
    }));
    symbols.push({
      name: diagram.id,
      detail: diagram.properties.title ?? diagram.type,
      kind: "diagram",
      range: diagram.range,
      selectionRange: diagram.idRange,
      children: [
        ...elements,
        ...relations,
        ...eventSymbols(diagram.events),
        ...diagram.scenarios.map((s): SymbolNode => ({
          name: s.id,
          detail: s.label,
          kind: "scenario",
          range: s.range,
          selectionRange: s.idRange,
          children: [],
        })),
      ].sort((a, b) => a.range.start.offset - b.range.start.offset),
    });
  }
  for (const model of analysis.compilation.document.models) {
    const entitySymbol = (path: string): SymbolNode => {
      const entity = model.entitiesByPath.get(path)!;
      return {
        name: entity.id,
        detail: `${kindWord(entity.kind)} · ${entity.label}`,
        kind: "entity",
        range: entity.range,
        selectionRange: entity.idRange,
        children: model.entities.filter((e) => e.parent === path).map((e) => entitySymbol(e.path)),
      };
    };
    symbols.push({
      name: model.id,
      detail: t.model,
      kind: "model",
      range: model.range,
      selectionRange: model.idRange,
      children: [
        ...model.entities.filter((e) => e.parent === null).map((e) => entitySymbol(e.path)),
        ...model.relations.map((r): SymbolNode => ({
          name: r.id ?? `${r.from} -> ${r.to}`,
          detail: r.label ?? "",
          kind: "relation",
          range: r.range,
          selectionRange: r.idRange ?? r.range,
          children: [],
        })),
      ],
    });
  }
  symbols.push(...storySymbols(analysis), ...profileSymbols(analysis));
  for (const theme of analysis.compilation.document.themes) {
    symbols.push({
      name: theme.id,
      detail: theme.extends ? t.extends(theme.extends) : t.theme,
      kind: "theme",
      range: theme.range,
      selectionRange: theme.idRange,
      children: [],
    });
  }
  return symbols.sort((a, b) => a.range.start.offset - b.range.start.offset);
}

/** The references to the same element or relation as `reference`. */
function sameTarget(
  diagram: FlowDiagram,
  reference: Pick<Reference, "target" | "targetKind">,
): Reference[] {
  return diagram.references.filter(
    (r) => r.targetKind === reference.targetKind && r.target === reference.target,
  );
}

/**
 * The element, relation or event under the cursor in a diagram of this document: written in the
 * diagram, or a story target in a view of this document.
 */
function targetAt(
  analysis: DocumentAnalysis,
  offset: number,
): { diagram: FlowDiagram; target: string; targetKind: TargetKind; range: Range } | undefined {
  const found = referenceAt(analysis.compilation, offset);
  if (found) {
    return {
      diagram: found.diagram,
      target: found.reference.target,
      targetKind: found.reference.targetKind,
      range: analysis.compilation.parse.lines.range(found.reference.token),
    };
  }
  const story = storyTargetAt(analysis, offset);
  if (!story || story.reference.file !== null || !story.diagram) return undefined;
  return {
    diagram: story.diagram,
    target: story.reference.id,
    targetKind: story.reference.kind,
    range: story.reference.range,
  };
}

/** Where a target of a diagram is declared. */
export function declarationOf(
  diagram: FlowDiagram,
  targetKind: TargetKind,
  target: string,
): Range | undefined {
  if (targetKind === "element") return diagram.elementsById.get(target)?.idRange;
  if (targetKind === "event") {
    const event = diagram.eventsByKey.get(target);
    return event ? (event.idRange ?? event.range) : undefined;
  }
  const relation = diagram.relationsByKey.get(target);
  return relation ? (relation.idRange ?? relation.range) : undefined;
}

const isDeclaration = (r: Reference) => r.role === "declaration" || r.role === "relation-id";

/**
 * Where the element or relation under the cursor is declared. On a link to a diagram of the same
 * file, the linked element; links through imports are resolved by the project.
 */
export function definition(analysis: DocumentAnalysis, offset: number): Range | undefined {
  // Entities of a model of this document; hosts with a project follow imported ones.
  const entity = entityAt(analysis, offset);
  if (entity) return entity.model.file === null ? entity.entity.idRange : undefined;
  const link = linkAt(analysis, offset);
  if (link) {
    if (link.binding !== null) return undefined;
    const target = analysis.compilation.document.diagrams.find((d) => d.id === link.diagram);
    if (!target) return undefined;
    return offset <= link.diagramRange.end.offset && link.diagramRange.start.offset <= offset
      ? target.idRange
      : target.elementsById.get(link.element)?.idRange;
  }
  // What a profile exports.
  const exported = profileDefinition(analysis, offset);
  if (exported) return exported;
  // The diagram a story or a scene shows; imported ones are followed by the project.
  const named = storyDiagramAt(analysis, offset);
  if (named) return named.file === null ? named.diagram?.idRange : undefined;
  const found = targetAt(analysis, offset);
  return found ? declarationOf(found.diagram, found.targetKind, found.target) : undefined;
}

/** Every use of the element or relation under the cursor. */
export function references(
  analysis: DocumentAnalysis,
  offset: number,
  includeDeclaration = true,
): Range[] {
  const entity = entityAt(analysis, offset);
  if (entity) {
    const lines = analysis.compilation.parse.lines;
    const seen = new Set<number>();
    return entityReferencesIn(analysis.compilation, entity.model)
      .filter(
        (r) => r.path === entity.entity.path && (includeDeclaration || r.role !== "declaration"),
      )
      .filter((r) => !seen.has(r.token.start) && seen.add(r.token.start))
      .map((r) => lines.range(r.token))
      .sort((a, b) => a.start.offset - b.start.offset);
  }
  const found = targetAt(analysis, offset);
  if (!found) return [];
  const lines = analysis.compilation.parse.lines;
  const ranges = sameTarget(found.diagram, found)
    .filter((r) => includeDeclaration || !isDeclaration(r))
    .map((r) => lines.range(r.token));
  if (found.targetKind === "element") {
    // Links of other diagrams of the file name the element too.
    for (const diagram of analysis.compilation.document.diagrams) {
      for (const link of diagram.links) {
        if (
          link.binding === null &&
          link.diagram === found.diagram.id &&
          link.element === found.target
        ) {
          ranges.push(link.elementRange);
        }
      }
    }
  }
  // So do the stories of the file.
  for (const r of storyReferencesTo(analysis, found.diagram.id, found.target, found.targetKind)) {
    ranges.push(r.range);
  }
  return ranges.sort((a, b) => a.start.offset - b.start.offset);
}

/** The uses of the element or relation under the cursor, marking its declaration as a write. */
export function highlights(
  analysis: DocumentAnalysis,
  offset: number,
): { range: Range; kind: "read" | "write" }[] {
  const entity = entityAt(analysis, offset);
  if (entity) {
    const lines = analysis.compilation.parse.lines;
    const seen = new Set<number>();
    return entityReferencesIn(analysis.compilation, entity.model)
      .filter((r) => r.path === entity.entity.path)
      .filter((r) => !seen.has(r.token.start) && seen.add(r.token.start))
      .sort((a, b) => a.token.start - b.token.start)
      .map((r) => ({
        range: lines.range(r.token),
        kind: r.role === "declaration" ? "write" : "read",
      }));
  }
  const found = targetAt(analysis, offset);
  if (!found) return [];
  const lines = analysis.compilation.parse.lines;
  return [
    ...sameTarget(found.diagram, found).map((r) => ({
      range: lines.range(r.token),
      kind: isDeclaration(r) ? ("write" as const) : ("read" as const),
    })),
    ...storyReferencesTo(analysis, found.diagram.id, found.target, found.targetKind).map((r) => ({
      range: r.range,
      kind: "read" as const,
    })),
  ].sort((a, b) => a.range.start.offset - b.range.start.offset);
}

export type PrepareRename =
  | { readonly ok: true; readonly range: Range; readonly placeholder: string }
  | { readonly ok: false; readonly reason: string };

/** Whether the token under the cursor can be renamed, with its range. */
export function prepareRename(analysis: DocumentAnalysis, offset: number): PrepareRename {
  const entity = entityAt(analysis, offset);
  if (entity) {
    return { ok: true, range: entity.range, placeholder: entity.reference.token.text };
  }
  // A target of an imported view: the project renames it in the diagram's file.
  const story = storyTargetAt(analysis, offset);
  if (story && story.reference.file !== null) {
    return { ok: true, range: story.reference.range, placeholder: story.reference.id };
  }
  const t = serviceMessages().rename;
  const found = targetAt(analysis, offset);
  if (!found) return { ok: false, reason: t.notRenamable };
  if (found.targetKind === "relation") {
    const relation = found.diagram.relationsByKey.get(found.target);
    if (!relation || relation.id === null) return { ok: false, reason: t.nameRelationFirst };
  }
  return {
    ok: true,
    range: found.range,
    placeholder: analysis.text.slice(found.range.start.offset, found.range.end.offset),
  };
}

/** Renames the element or relation under the cursor. */
export function rename(analysis: DocumentAnalysis, offset: number, newId: string): PlanResult {
  const t = serviceMessages().rename;
  const entity = entityAt(analysis, offset);
  if (entity) {
    if (entity.model.file !== null) {
      return {
        ok: false,
        rejection: { code: "edit.unsafe-target", reason: t.importedModel(entity.entity.path) },
      };
    }
    return planEdit(
      analysis.compilation,
      {
        kind: "renameEntity",
        model: entity.model.definition.id,
        entity: entity.entity.path,
        newId,
      },
      { revision: analysis.revision },
    );
  }
  const prepared = prepareRename(analysis, offset);
  if (!prepared.ok)
    return { ok: false, rejection: { code: "edit.unsafe-target", reason: prepared.reason } };
  const found = targetAt(analysis, offset);
  if (!found) {
    return {
      ok: false,
      rejection: { code: "edit.unsafe-target", reason: t.importedDiagram(prepared.placeholder) },
    };
  }
  return planEdit(
    analysis.compilation,
    renameOperation(found.diagram.id, found.targetKind, found.target, newId),
    { revision: analysis.revision },
  );
}

/** The operation that renames an element, relation or event of a diagram. */
export function renameOperation(
  diagram: string,
  targetKind: TargetKind,
  target: string,
  newId: string,
): EditOperation {
  return targetKind === "element"
    ? { kind: "renameElement", diagram, element: target, newId }
    : targetKind === "event"
      ? { kind: "renameEvent", diagram, event: target, newId }
      : { kind: "renameRelation", diagram, relation: target, newId };
}

/**
 * The element, relation or sequence event of the statement that contains `offset`, for two-way
 * selection. Events are named by their key.
 */
export function selectionAt(
  analysis: DocumentAnalysis,
  offset: number,
): { diagram: string; id: string; kind: TargetKind } | undefined {
  const found = referenceAt(analysis.compilation, offset);
  if (found) {
    const { diagram, reference } = found;
    return { diagram: diagram.id, id: reference.target, kind: reference.targetKind };
  }
  for (const diagram of analysis.compilation.document.diagrams) {
    if (offset < diagram.node.start || offset > diagram.node.end) continue;
    // The innermost statement around the cursor that names an element or a relation, or the
    // innermost event statement of a sequence diagram.
    let best: { start: number; end: number; id: string; kind: TargetKind } | undefined;
    for (const r of diagram.references) {
      const s = r.statement;
      if (
        s.start <= offset &&
        offset <= s.end &&
        (!best || s.end - s.start < best.end - best.start)
      ) {
        best = { start: s.start, end: s.end, id: r.target, kind: r.targetKind };
      }
    }
    for (const event of diagram.eventsByKey.values()) {
      if (event.kind === "message") continue;
      const s = event.node;
      if (
        s.start <= offset &&
        offset <= s.end &&
        (!best || s.end - s.start <= best.end - best.start)
      ) {
        best = { start: s.start, end: s.end, id: event.key, kind: "event" };
      }
    }
    if (best) return { diagram: diagram.id, id: best.id, kind: best.kind };
    return undefined;
  }
  return undefined;
}
