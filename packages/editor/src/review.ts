import type { Scene, SceneItem } from "@meltemi/diagrams-layout";
import {
  diffDocuments,
  type Document,
  type FlowDiagram,
  type ModelChange,
} from "@meltemi/diagrams-model";
import { relativePath, type FileCompilation, type Workspace } from "@meltemi/diagrams-project";
import { renderSvg } from "@meltemi/diagrams-render";
import { layoutIn } from "./layouts.js";
import type { ProjectSessions } from "./projects.js";

/** One version of a project, a folder or a file. */
export interface ReviewSide {
  readonly workspace: Workspace;
  readonly projects: ProjectSessions;
  /** The folder or file compared, as a project path; the project root when null. */
  readonly scope: string | null;
}

/** A diagram that changed, with its pictures before and after (null where it does not exist). */
export interface ReviewDiagram {
  readonly id: string;
  /** The diagram's id before, when it was renamed. */
  readonly from: string | null;
  readonly before: string | null;
  readonly after: string | null;
}

export interface ReviewFile {
  /** The file's path after (before, for removals), relative to the compared folder. */
  readonly path: string;
  /** Renamed files: the path before. */
  readonly from: string | null;
  readonly status: "added" | "removed" | "renamed" | "changed";
  readonly changes: readonly ModelChange[];
  /** What each scope of the changes is: a diagram, a model or a story. */
  readonly scopes: Readonly<Record<string, "diagram" | "model" | "story">>;
  readonly diagrams: readonly ReviewDiagram[];
}

export interface Review {
  readonly files: readonly ReviewFile[];
}

export interface ReviewOptions {
  /** Draws the pictures of changed diagrams, with their changes marked. */
  readonly images: boolean;
}

/** The colours of the marks: added, removed, renamed and changed (decision 0028). */
export const REVIEW_COLOURS = {
  added: "#1a7f37",
  removed: "#cf222e",
  renamed: "#0969da",
  changed: "#bf8700",
} as const;

const EMPTY: Document = {
  language: null,
  imports: [],
  diagrams: [],
  themes: [],
  models: [],
  stories: [],
  exports: [],
  unsupported: [],
};

/** The compiled files of one side, by path relative to its scope. */
function filesOf(side: ReviewSide): Map<string, FileCompilation> {
  const root = side.workspace.root;
  const scope = side.scope ?? root;
  const program = side.workspace.compileProject();
  const files = new Map<string, FileCompilation>();
  const sources = side.workspace.sources();
  // A single file outside the sources (a loose sheet) is still compared.
  if (side.scope !== null && side.scope.endsWith(".meltemi") && !sources.includes(side.scope)) {
    const file = side.workspace.file(side.scope);
    if (file) files.set(side.scope.slice(side.scope.lastIndexOf("/") + 1), file);
    return files;
  }
  for (const path of sources) {
    if (path !== scope && !path.startsWith(`${scope}/`)) continue;
    const file = program.files.get(path);
    if (!file) continue;
    const key = path === scope ? path.slice(path.lastIndexOf("/") + 1) : relativePath(scope, path);
    files.set(key, file);
  }
  return files;
}

const blockIds = (document: Document) =>
  [
    ...document.diagrams.map((d) => `d:${d.id}`),
    ...document.models.map((m) => `m:${m.id}`),
    ...document.stories.map((s) => `s:${s.id}`),
  ].sort();

function scopesOf(...documents: Document[]): Record<string, "diagram" | "model" | "story"> {
  const scopes: Record<string, "diagram" | "model" | "story"> = {};
  for (const document of documents) {
    for (const d of document.diagrams) scopes[d.id] = "diagram";
    for (const m of document.models) scopes[m.id] = "model";
    for (const s of document.stories) scopes[s.id] = "story";
  }
  return scopes;
}

/** Every group of a scene, nested ones included. */
function groupsOf(items: readonly SceneItem[]): Extract<SceneItem, { kind: "group" }>[] {
  return items.flatMap((item) => (item.kind === "group" ? [item, ...groupsOf(item.items)] : []));
}

/** The scene with outlines around the elements and relations that changed. */
function marked(scene: Scene, marks: ReadonlyMap<string, string>): Scene {
  const overlays: SceneItem[] = [];
  for (const group of groupsOf(scene.items)) {
    const colour = marks.get(group.id);
    if (!colour) continue;
    if (group.role === "element" && group.bounds) {
      const b = group.bounds;
      overlays.push({
        kind: "rect",
        x: b.x - 5,
        y: b.y - 5,
        width: b.width + 10,
        height: b.height + 10,
        radius: b.radius + 5,
        fill: "none",
        stroke: colour,
        strokeWidth: 3,
        dashed: false,
      });
    } else if (group.role === "relation" && group.track && group.track.length > 1) {
      overlays.push({
        kind: "polyline",
        points: group.track,
        stroke: colour,
        strokeWidth: 7,
        dashed: false,
        opacity: 0.4,
      });
    }
  }
  if (overlays.length === 0) return scene;
  return {
    ...scene,
    items: [...scene.items, { kind: "group", id: "review-marks", role: "frame", items: overlays }],
  };
}

/** The SVG of a diagram with its marks, or null when it cannot be drawn. */
function picture(
  side: ReviewSide,
  file: FileCompilation,
  diagram: FlowDiagram,
  marks: ReadonlyMap<string, string>,
): string | null {
  if (diagram.hasErrors) return null;
  const result = layoutIn(side.workspace, side.projects, file, diagram, null, undefined);
  if (!result.scene) return null;
  return renderSvg(marked(result.scene, marks), {
    fonts: "embedded",
    provider: side.projects.fontsFor(side.workspace),
  });
}

/** The pictures of the diagrams of a file that changed, marked. */
function diagramsOf(
  before: { side: ReviewSide; file: FileCompilation } | null,
  after: { side: ReviewSide; file: FileCompilation } | null,
  changes: readonly ModelChange[],
): ReviewDiagram[] {
  const touched = new Map<string, string | null>();
  for (const c of changes) {
    if (c.subject === "diagram") touched.set(c.id, c.from);
    else if (c.scope !== null && (c.subject === "element" || c.subject === "relation")) {
      if (!touched.has(c.scope)) touched.set(c.scope, null);
    }
  }
  const diagrams: ReviewDiagram[] = [];
  for (const [id, renamedFrom] of touched) {
    const removed = changes.some(
      (c) => c.subject === "diagram" && c.kind === "removed" && c.id === id,
    );
    const afterId = removed ? null : id;
    const beforeId =
      renamedFrom ??
      (changes.some((c) => c.subject === "diagram" && c.kind === "added" && c.id === id)
        ? null
        : id);
    const inside = changes.filter((c) => c.scope === id);
    const marksAfter = new Map<string, string>();
    const marksBefore = new Map<string, string>();
    for (const c of inside) {
      if (c.kind === "removed") marksBefore.set(c.id, REVIEW_COLOURS.removed);
      else marksAfter.set(c.id, REVIEW_COLOURS[c.kind]);
      if (c.kind === "changed") marksBefore.set(c.id, REVIEW_COLOURS.changed);
      if (c.kind === "renamed" && c.from !== null) marksBefore.set(c.from, REVIEW_COLOURS.renamed);
    }
    const draw = (
      where: { side: ReviewSide; file: FileCompilation } | null,
      diagramId: string | null,
      marks: ReadonlyMap<string, string>,
    ) => {
      if (!where || diagramId === null) return null;
      const diagram = where.file.compilation.document.diagrams.find((d) => d.id === diagramId);
      return diagram ? picture(where.side, where.file, diagram, marks) : null;
    };
    diagrams.push({
      id,
      from: renamedFrom,
      before: draw(before, beforeId, marksBefore),
      after: draw(after, afterId, marksAfter),
    });
  }
  return diagrams;
}

/**
 * What changed from one version of a project, folder or file to another (decision 0028): files
 * paired by path (renamed files by the blocks they hold), the semantic changes of each, and, with
 * `images`, pictures of every changed diagram before and after with its changes marked.
 */
export function reviewProjects(
  before: ReviewSide,
  after: ReviewSide,
  options: ReviewOptions,
): Review {
  const old = filesOf(before);
  const current = filesOf(after);
  // Two single files are compared whatever their names.
  if (
    old.size === 1 &&
    current.size === 1 &&
    before.scope?.endsWith(".meltemi") &&
    after.scope?.endsWith(".meltemi")
  ) {
    const [[, file]] = [...old];
    const [[name]] = [...current];
    old.clear();
    old.set(name, file);
  }
  const files: ReviewFile[] = [];
  const add = (
    path: string,
    from: string | null,
    status: ReviewFile["status"],
    b: FileCompilation | null,
    a: FileCompilation | null,
  ) => {
    const bd = b?.compilation.document ?? EMPTY;
    const ad = a?.compilation.document ?? EMPTY;
    const changes = diffDocuments(bd, ad);
    if (status === "changed" && changes.length === 0) return;
    files.push({
      path,
      from,
      status,
      changes,
      scopes: scopesOf(bd, ad),
      diagrams: options.images
        ? diagramsOf(b && { side: before, file: b }, a && { side: after, file: a }, changes)
        : [],
    });
  };
  const removed = [...old.keys()].filter((path) => !current.has(path));
  const added = [...current.keys()].filter((path) => !old.has(path));
  const renamed = new Map<string, string>();
  for (const path of added) {
    const ids = blockIds(current.get(path)!.compilation.document);
    if (ids.length === 0) continue;
    const match = removed.find(
      (r) => !renamed.has(r) && same(blockIds(old.get(r)!.compilation.document), ids),
    );
    if (match) renamed.set(match, path);
  }
  for (const [path, file] of current) {
    if (old.has(path)) add(path, null, "changed", old.get(path)!, file);
  }
  for (const [from, path] of renamed)
    add(path, from, "renamed", old.get(from)!, current.get(path)!);
  for (const path of added) {
    if (![...renamed.values()].includes(path)) add(path, null, "added", null, current.get(path)!);
  }
  for (const path of removed) {
    if (!renamed.has(path)) add(path, null, "removed", old.get(path)!, null);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files };
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
