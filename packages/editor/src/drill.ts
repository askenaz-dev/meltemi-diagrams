// What an element of a view opens, and the views a drill-down reaches from a diagram: one resolver
// for the HTML export, VS Code's player and the catalog (decision 0047).
import type { LayoutResult } from "@meltemi/diagrams-layout";
import {
  childLevel,
  isChildView,
  type Element,
  type ElementLink,
  type EntityKind,
  type FlowDiagram,
} from "@meltemi/diagrams-model";
import { transitionFor } from "@meltemi/diagrams-motion";
import type { DrillViews, HostOpenTarget, LaidOutView } from "@meltemi/diagrams-player";
import type { FileCompilation, Program } from "@meltemi/diagrams-project";

/** A diagram and the file that defines it. */
export interface ViewRef {
  readonly owner: FileCompilation;
  readonly diagram: FlowDiagram;
}

/** Where a `link` leads, by absolute file: a diagram's element or a model's entity. */
export type LinkPlace =
  | {
      readonly kind: "diagram";
      readonly file: string;
      readonly diagram: string;
      readonly element: string;
    }
  | {
      readonly kind: "entity";
      readonly file: string;
      readonly model: string;
      readonly path: string;
    };

/** The key of a view in a closure: its file and its id. */
export const viewRefKey = (view: ViewRef): string => `${view.owner.path}#${view.diagram.id}`;

/** Where a `link` leads, through imports if needed; null when it leads nowhere known. */
export function resolveLink(file: FileCompilation, link: ElementLink): LinkPlace | null {
  let target = file;
  let id = link.diagram;
  const own = file.compilation.document;
  const local =
    link.binding === null &&
    (own.diagrams.some((d) => d.id === id) || own.models.some((m) => m.id === id));
  if (!local) {
    const binding = file.bindings.get(link.binding ?? link.diagram);
    if (!binding || binding.target === null) return null;
    const imported = file.program.files.get(binding.target);
    if (!imported) return null;
    target = imported;
    id = link.binding !== null ? link.diagram : (binding.member ?? link.diagram);
  }
  const document = target.compilation.document;
  if (document.diagrams.some((d) => d.id === id)) {
    return { kind: "diagram", file: target.path, diagram: id, element: link.element };
  }
  if (document.models.some((m) => m.id === id)) {
    return { kind: "entity", file: target.path, model: id, path: link.element };
  }
  return null;
}

/**
 * Every diagram of a project in the order child views are chosen: the views of `first` by
 * source position, then the other files by path (the catalog's order), each by source position.
 */
function projectViews(program: Program, sources: readonly string[], first: string): ViewRef[] {
  const files = [first, ...sources.filter((path) => path !== first)];
  const views: ViewRef[] = [];
  for (const path of files) {
    const owner = program.files.get(path);
    if (!owner) continue;
    for (const diagram of owner.compilation.document.diagrams) views.push({ owner, diagram });
  }
  return views;
}

/** Which views may be opened: not those with errors, and those a host accepts. */
export type ViewFilter = (view: ViewRef) => boolean;

/**
 * The child views of an entity of a model (a container view scoped to a system, a component view
 * scoped to a container), in the order they are chosen: the views of `owner` first, then the
 * project's. Views with errors are never candidates.
 */
export function childViews(
  program: Program,
  sources: readonly string[],
  owner: string,
  model: { readonly file: string; readonly id: string },
  entity: { readonly kind: EntityKind; readonly path: string },
  accept: ViewFilter = () => true,
): ViewRef[] {
  if (childLevel(entity.kind) === null) return [];
  return projectViews(program, sources, owner).filter(
    (view) =>
      view.diagram.c4 !== null &&
      !view.diagram.hasErrors &&
      isChildView(view.diagram.c4, view.owner.path, model, entity) &&
      accept(view),
  );
}

/** The kind of an entity of a model, looked up in the program. */
function entityKind(
  program: Program,
  file: string,
  model: string,
  path: string,
): EntityKind | null {
  const definition = program.files
    .get(file)
    ?.compilation.document.models.find((m) => m.id === model);
  return definition?.entitiesByPath.get(path)?.kind ?? null;
}

/**
 * What an element of a view opens: the child view of the entity it draws (C4), the diagram its
 * `link` names (with the element to select there), or the child view of the entity it links to;
 * null for everything else (relations, groups whose children are on screen, `url`-only elements).
 */
export function openTargetOf(
  program: Program,
  sources: readonly string[],
  view: ViewRef,
  element: Element,
  accept: ViewFilter = () => true,
): { readonly view: ViewRef; readonly element: string | null } | null {
  const child = (file: string, model: string, path: string, kind: EntityKind | null) => {
    if (kind === null) return null;
    const found = childViews(
      program,
      sources,
      view.owner.path,
      { file, id: model },
      { kind, path },
      accept,
    )[0];
    return found ? { view: found, element: null } : null;
  };
  if (element.entity) {
    if (element.kind === "group") return null;
    const file = element.entity.file ?? view.owner.path;
    return child(file, element.entity.model, element.entity.path, element.kind as EntityKind);
  }
  const link = view.diagram.links.find((l) => l.owner === element.id);
  if (!link) return null;
  const place = resolveLink(view.owner, link);
  if (!place) return null;
  if (place.kind === "entity") {
    return child(
      place.file,
      place.model,
      place.path,
      entityKind(program, place.file, place.model, place.path),
    );
  }
  const owner = program.files.get(place.file);
  const diagram = owner?.compilation.document.diagrams.find((d) => d.id === place.diagram);
  if (!owner || !diagram || diagram.hasErrors) return null;
  const target = { owner, diagram };
  if (viewRefKey(target) === viewRefKey(view) || !accept(target)) return null;
  return { view: target, element: diagram.elementsById.has(place.element) ? place.element : null };
}

/**
 * The views a drill-down reaches from `root`, breadth first, each laid out once by `lay` (null or
 * a layout without a scene leaves it out), with what each element opens, as player documents take
 * them. Keys are `<file>#<id>`; the document renames them to diagram ids.
 */
export function viewClosure(
  program: Program,
  sources: readonly string[],
  root: ViewRef,
  rootLayout: LayoutResult,
  lay: (view: ViewRef) => LayoutResult | null,
  accept: ViewFilter = () => true,
): DrillViews {
  const rootKey = viewRefKey(root);
  const laid = new Map<string, LaidOutView>([
    [rootKey, { diagram: root.diagram, layout: rootLayout }],
  ]);
  const written = new Map<string, Record<string, { view: string; element: string | null }>>();
  const queue: ViewRef[] = [root];
  const seen = new Set([rootKey]);
  while (queue.length > 0) {
    const view = queue.shift()!;
    const key = viewRefKey(view);
    if (!laid.has(key)) {
      const layout = lay(view);
      if (!layout?.scene) continue;
      laid.set(key, { diagram: view.diagram, layout });
    }
    const targets: Record<string, { view: string; element: string | null }> = {};
    for (const element of view.diagram.elements) {
      const target = openTargetOf(program, sources, view, element, accept);
      if (!target) continue;
      const to = viewRefKey(target.view);
      if (to === key) continue;
      targets[element.id] = { view: to, element: target.element };
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(target.view);
      }
    }
    written.set(key, targets);
  }
  // The transition of each target, now that both views are laid out; targets of views that could
  // not be drawn are dropped.
  const opens = new Map<string, Record<string, HostOpenTarget>>();
  for (const [key, targets] of written) {
    const from = laid.get(key)?.layout.scene;
    const resolved: Record<string, HostOpenTarget> = {};
    for (const [id, target] of Object.entries(targets)) {
      const to = laid.get(target.view)?.layout.scene;
      if (!from || !to) continue;
      resolved[id] = { ...target, transition: transitionFor(from, to, id) };
    }
    opens.set(key, resolved);
  }
  const views = new Map([...laid].filter(([key]) => key !== rootKey));
  return { root: rootKey, views, opens };
}
