// What the explorer lists, without a DOM: the project's files as a tree of folders, diagrams and
// images, with what each file declares and the problems it has; the rows the keyboard walks; and
// the rules of the names the explorer writes (new diagrams and folders, renames, moves, copies).

import { planEdit } from "@meltemi/diagrams-edit";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { MANIFEST_NAME } from "@meltemi/diagrams-project";
import { cleanPath, isImagePath } from "../files.js";
import type { FileOutline, ProjectProblems } from "../studio.js";

/** The picture of a row: a folder, a kind of diagram, or a kind of file. */
export type NodeIcon =
  | "folder"
  | "flow"
  | "free"
  | "sequence"
  | "c4"
  | "model"
  | "story"
  | "theme"
  | "image"
  | "settings"
  | "file";

export interface TreeNode {
  /** Unique in the tree, the same across redraws: `d:` folders, `f:` files, `g:`/`s:` children. */
  readonly key: string;
  readonly kind: "folder" | "file" | "diagram" | "story";
  /** The folder's path, the file's path, or the path of the file a diagram or story is in. */
  readonly path: string;
  readonly name: string;
  readonly icon: NodeIcon;
  /** The id of a diagram or story. */
  readonly id?: string;
  readonly children: readonly TreeNode[];
  /** Problems of the file; of a folder, the sum of what it holds. */
  readonly errors: number;
  readonly warnings: number;
}

export interface TreeInput {
  readonly paths: readonly string[];
  readonly outlines: ReadonlyMap<string, FileOutline>;
  readonly problems: ProjectProblems;
  /** Every file is listed; otherwise folders, `.meltemi` files and images only. */
  readonly showAll: boolean;
  /** Folders made in the explorer that hold no file yet. */
  readonly folders?: readonly string[];
}

/** Files that describe the project rather than draw it: listed with the settings picture. */
const SETTINGS = new Set([MANIFEST_NAME, "assets.lock.json"]);

/** The folder of a path, `""` for the project's root. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** The last segment of a path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** A path in a folder (`""` is the root). */
export function within(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/** The name a file is listed by: a `.meltemi` file without its extension. */
export function displayName(path: string): string {
  const name = baseName(path);
  return name.endsWith(".meltemi") ? name.slice(0, -".meltemi".length) : name;
}

/** Whether the explorer lists a file: everything with `showAll`, else diagrams and images. */
export function isListed(path: string, showAll: boolean): boolean {
  return showAll || path.endsWith(".meltemi") || isImagePath(path);
}

/** The files the explorer hides that have errors or warnings, in path order. */
export function hiddenProblems(input: TreeInput): string[] {
  if (input.showAll) return [];
  return input.paths.filter((path) => {
    if (isListed(path, false)) return false;
    const counts = input.problems.get(path);
    return counts !== undefined && counts.errors + counts.warnings > 0;
  });
}

/** The picture of a file: its first diagram's kind, else what it declares, else its kind. */
export function iconOf(path: string, outline: FileOutline | undefined): NodeIcon {
  if (SETTINGS.has(path)) return "settings";
  if (isImagePath(path)) return "image";
  if (!path.endsWith(".meltemi")) return "file";
  const first = outline?.diagrams[0];
  if (first) return first.type;
  if (outline && outline.models > 0) return "model";
  if (outline && outline.stories.length > 0) return "story";
  if (outline && outline.themes > 0) return "theme";
  return "flow";
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) ||
  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

interface Folder {
  readonly folders: Map<string, Folder>;
  readonly files: string[];
}

/**
 * The tree of the project: folders before files at every level, each sorted by name. A `.meltemi`
 * file that declares more than one diagram or story has one child per diagram, then one per story;
 * a folder carries the problems of what it holds. Folders that hold nothing listed are left out,
 * unless the explorer made them.
 */
export function buildTree(input: TreeInput): TreeNode[] {
  const root: Folder = { folders: new Map(), files: [] };
  const folderAt = (path: string): Folder => {
    let folder = root;
    if (path === "") return folder;
    for (const segment of path.split("/")) {
      let next = folder.folders.get(segment);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(segment, next);
      }
      folder = next;
    }
    return folder;
  };
  for (const path of input.paths) {
    if (isListed(path, input.showAll)) folderAt(folderOf(path)).files.push(path);
  }
  for (const folder of input.folders ?? []) folderAt(folder);

  const fileNode = (path: string): TreeNode => {
    const outline = input.outlines.get(path);
    const counts = input.problems.get(path) ?? { errors: 0, warnings: 0 };
    const parts = [
      ...(outline?.diagrams ?? []).map((d): TreeNode => ({
        key: `g:${path}#${d.id}`,
        kind: "diagram",
        path,
        id: d.id,
        name: d.title ?? d.id,
        icon: d.type,
        children: [],
        errors: 0,
        warnings: 0,
      })),
      ...(outline?.stories ?? []).map((s): TreeNode => ({
        key: `s:${path}#${s.id}`,
        kind: "story",
        path,
        id: s.id,
        name: s.title ?? s.id,
        icon: "story",
        children: [],
        errors: 0,
        warnings: 0,
      })),
    ];
    return {
      key: `f:${path}`,
      kind: "file",
      path,
      name: displayName(path),
      icon: iconOf(path, outline),
      children: parts.length > 1 ? parts : [],
      errors: counts.errors,
      warnings: counts.warnings,
    };
  };

  const build = (folder: Folder, path: string): TreeNode[] => {
    const folders = [...folder.folders].map(([name, inner]): TreeNode => {
      const at = within(path, name);
      const children = build(inner, at);
      // A folder has problems of its own too: an icon pack without licence.
      const own = input.problems.get(at) ?? { errors: 0, warnings: 0 };
      return {
        key: `d:${at}`,
        kind: "folder",
        path: at,
        name,
        icon: "folder",
        children,
        errors: children.reduce((n, c) => n + c.errors, own.errors),
        warnings: children.reduce((n, c) => n + c.warnings, own.warnings),
      };
    });
    const made = new Set(input.folders ?? []);
    const kept = folders.filter((f) => f.children.length > 0 || made.has(f.path));
    return [...kept.sort(byName), ...folder.files.map(fileNode).sort(byName)];
  };
  return build(root, "");
}

/** A row the tree shows, in the order a person reads them, with its depth and its parent. */
export interface TreeRow {
  readonly node: TreeNode;
  /** 1 for the root's entries. */
  readonly level: number;
  readonly parent: string | undefined;
}

/** The rows of the tree whose parents are all expanded, in order. */
export function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (list: readonly TreeNode[], level: number, parent: string | undefined) => {
    for (const node of list) {
      rows.push({ node, level, parent });
      if (node.children.length > 0 && expanded.has(node.key)) {
        walk(node.children, level + 1, node.key);
      }
    }
  };
  walk(nodes, 1, undefined);
  return rows;
}

/** Every node of the tree by its key. */
export function nodesByKey(nodes: readonly TreeNode[]): Map<string, TreeNode> {
  const all = new Map<string, TreeNode>();
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      all.set(node.key, node);
      walk(node.children);
    }
  };
  walk(nodes);
  return all;
}

/** The keys of the folders that hold a path, outermost first: what to expand to show it. */
export function ancestorKeys(path: string): string[] {
  const keys: string[] = [];
  let folder = folderOf(path);
  while (folder !== "") {
    keys.unshift(`d:${folder}`);
    folder = folderOf(folder);
  }
  return keys;
}

// Names ---------------------------------------------------------------------------------------

/** Why a name is refused. */
export type NameProblem =
  | { readonly reason: "empty" }
  | { readonly reason: "invalid" }
  | { readonly reason: "extension" }
  | { readonly reason: "exists"; readonly path: string }
  | { readonly reason: "itself" };

/** Whether a name can be one segment of a path: not empty, no `/`, `\` or `:`, no leading dot. */
export function checkSegment(name: string): NameProblem | undefined {
  const trimmed = name.trim();
  if (trimmed === "") return { reason: "empty" };
  if (/[\\/:]/.test(trimmed) || cleanPath(trimmed) !== trimmed) return { reason: "invalid" };
  return undefined;
}

/** The path of a new diagram named `name` in a folder; the extension is added when missing. */
export function diagramPath(folder: string, name: string): string {
  const trimmed = name.trim();
  return within(folder, trimmed.endsWith(".meltemi") ? trimmed : `${trimmed}.meltemi`);
}

/**
 * The text of a new diagram's file: the `language` header and an empty diagram of a kind, written
 * by the `createDiagram` edit the canvas uses, with the name as its id and its title.
 */
export function newDiagramText(kind: "flow" | "free" | "sequence", name: string): string {
  const title = name.trim().replace(/\.meltemi$/, "");
  const planned = planEdit(compile(""), {
    kind: "createDiagram",
    type: kind,
    id: diagramId(title),
    title,
  });
  if (!planned.ok) throw new Error(planned.rejection.reason);
  return applyTextEdits("", planned.plan.edits);
}

/** An identifier from a name, for the diagram a new file holds: `Order flow` gives `Order_flow`. */
export function diagramId(name: string): string {
  // Ids are ASCII: a letter keeps its base and loses its accent, as `Diseño` gives `Diseno`.
  const stem = name
    .trim()
    .replace(/\.meltemi$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  return stem.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(?=\d)/, "d") || "diagram";
}

/**
 * The path a file or folder takes when renamed to `name` in its folder: a `.meltemi` file keeps its
 * extension when the name has none; another file must keep its extension.
 */
export function renamedPath(
  path: string,
  name: string,
  kind: "file" | "folder",
): { path: string } | NameProblem {
  const problem = checkSegment(name);
  if (problem) return problem;
  const trimmed = name.trim();
  const folder = folderOf(path);
  if (kind === "folder") return { path: within(folder, trimmed) };
  if (path.endsWith(".meltemi")) return { path: diagramPath(folder, trimmed) };
  const extension = (p: string) => (p.includes(".") ? p.slice(p.lastIndexOf(".")) : "");
  if (extension(baseName(path)) !== extension(trimmed)) return { reason: "extension" };
  return { path: within(folder, trimmed) };
}

/** The files a folder holds, at any depth. */
export function filesIn(folder: string, paths: readonly string[]): string[] {
  return paths.filter((p) => p.startsWith(`${folder}/`));
}

/**
 * The moves that put files and folders into a folder (`""`: the root), each keeping its name; a
 * folder moves with every file it holds. Refused when a source is the target or a folder moves
 * into itself, and when a target path is taken by a file that does not move.
 */
export function movesInto(
  sources: readonly { readonly kind: "file" | "folder"; readonly path: string }[],
  folder: string,
  paths: readonly string[],
): { moves: [string, string][] } | NameProblem {
  const moves: [string, string][] = [];
  for (const source of sources) {
    if (source.kind === "folder") {
      if (folder === source.path || folder.startsWith(`${source.path}/`)) {
        return { reason: "itself" };
      }
      const target = within(folder, baseName(source.path));
      if (target === source.path) continue;
      for (const file of filesIn(source.path, paths)) {
        moves.push([file, target + file.slice(source.path.length)]);
      }
    } else {
      const target = within(folder, baseName(source.path));
      if (target !== source.path) moves.push([source.path, target]);
    }
  }
  const moving = new Set(moves.map(([from]) => from));
  const taken = new Set(paths.filter((p) => !moving.has(p)));
  for (const [, to] of moves) {
    if (taken.has(to)) return { reason: "exists", path: to };
    taken.add(to);
  }
  return { moves };
}

/** The moves of a folder renamed to another path: every file it holds goes along. */
export function folderMoves(
  from: string,
  to: string,
  paths: readonly string[],
): { moves: [string, string][] } | NameProblem {
  if (to === from) return { moves: [] };
  if (to.startsWith(`${from}/`)) return { reason: "itself" };
  const moves = filesIn(from, paths).map((file): [string, string] => [
    file,
    to + file.slice(from.length),
  ]);
  const moving = new Set(moves.map(([source]) => source));
  for (const [, target] of moves) {
    if (paths.includes(target) && !moving.has(target)) return { reason: "exists", path: target };
  }
  return { moves };
}

/** The path of a copy of a file beside it: `<stem>-copy<.ext>`, then `-copy-2`, `-copy-3`… */
export function copyPath(path: string, exists: (path: string) => boolean): string {
  const folder = folderOf(path);
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = within(folder, `${stem}-copy${n === 1 ? "" : `-${n}`}${extension}`);
    if (!exists(candidate)) return candidate;
  }
}
