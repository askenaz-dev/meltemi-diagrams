// The semantic difference between two versions of a document: what was added, removed, renamed or
// changed, by id. Explicit ids tell a rename from a removal and an addition: an element whose id
// changed but whose kind, label, place or relations stayed is a rename (decision 0028).
import { getLocale, type Locale } from "@meltemi/diagrams-i18n";
import { changeMessages } from "./messages/changes.js";
import type {
  Document,
  Element,
  ExportProfile,
  FlowDiagram,
  ModelDefinition,
  ModelEntity,
  ModelRelation,
  Relation,
  StoryAction,
  StoryDefinition,
  StoryScene,
  TagUse,
  ThemeDefinition,
} from "./types.js";

export type ChangeKind = "added" | "removed" | "renamed" | "changed";
export type ChangeSubject =
  "diagram" | "element" | "relation" | "model" | "entity" | "story" | "scene" | "theme" | "export";

/** One difference between two versions. */
export interface ModelChange {
  readonly kind: ChangeKind;
  readonly subject: ChangeSubject;
  /** The diagram, model or story the change is in; null for the blocks of a file. */
  readonly scope: string | null;
  /** The id after the change; the former id for removals. */
  readonly id: string;
  /** Renames: the id before. */
  readonly from: string | null;
  /** The text people read: an element's label, a diagram's title. */
  readonly label: string | null;
  /** What changed, as facts that `describeChange` words in a language. */
  readonly facts: readonly ChangeFact[];
  /** The facts in English, such as `label "API" → "API Gateway"` or `moved`. */
  readonly details: readonly string[];
}

/** One thing that changed, which `describeFact` words in a language. */
export type ChangeFact =
  /** A text written in the source: `label "API" → "API Gateway"`. */
  | {
      readonly fact: "text";
      readonly field: string;
      readonly before: string | null;
      readonly after: string | null;
    }
  /** A value of the language: `kind node → decision`, `preset none → slide`. */
  | {
      readonly fact: "value";
      readonly field: string;
      readonly before: string | null;
      readonly after: string | null;
    }
  /** The classes applied, in order. */
  | {
      readonly fact: "classes";
      readonly before: readonly string[];
      readonly after: readonly string[];
    }
  /** A part that changed, without details. */
  | { readonly fact: "changed"; readonly part: ChangedPart }
  /** A new state. */
  | { readonly fact: "state"; readonly state: ChangeState }
  /** An element moved between groups; `to` is null out of every group. */
  | { readonly fact: "group"; readonly from: string | null; readonly to: string | null }
  /** An entity moved to another parent; null is the model's root. */
  | { readonly fact: "parent"; readonly to: string | null }
  | { readonly fact: "scenario"; readonly id: string; readonly added: boolean }
  | { readonly fact: "duration"; readonly before: number; readonly after: number }
  /** The kind or type of what was added or removed, as written. */
  | { readonly fact: "kind"; readonly kind: string };

/** Parts of a change described without details. */
export type ChangedPart =
  | "description"
  | "style"
  | "effects"
  | "canvas"
  | "layers"
  | "includedEntities"
  | "constraints"
  | "transition"
  | "actions"
  | "assumption"
  | "ends"
  | "heads"
  | "tags";

/** States a change can leave something in. */
export type ChangeState =
  | "external"
  | "notExternal"
  | "placed"
  | "unplaced"
  | "moved"
  | "resized"
  | "twoWay"
  | "oneWay"
  | "async"
  | "sync"
  | "confirmed"
  | "assumed"
  | "rerouted"
  | "labelMoved"
  | "messagesReordered"
  | "scenesReordered";

interface Pairs<T> {
  readonly matched: [T, T][];
  readonly renamed: [T, T][];
  readonly removed: T[];
  readonly added: T[];
}

/**
 * Pairs two lists by key; what is left is paired as renames when `similarity` reaches
 * `threshold`, best pairs first.
 */
function pair<T>(
  before: readonly T[],
  after: readonly T[],
  key: (item: T) => string,
  similarity: (before: T, after: T) => number,
  threshold: number,
): Pairs<T> {
  const afterBy = new Map(after.map((a) => [key(a), a]));
  const beforeKeys = new Set(before.map(key));
  const matched: [T, T][] = [];
  const left: T[] = [];
  for (const b of before) {
    const a = afterBy.get(key(b));
    if (a !== undefined) matched.push([b, a]);
    else left.push(b);
  }
  const fresh = after.filter((a) => !beforeKeys.has(key(a)));
  const scored: { b: number; a: number; score: number }[] = [];
  left.forEach((b, i) =>
    fresh.forEach((a, j) => {
      const score = similarity(b, a);
      if (score >= threshold) scored.push({ b: i, a: j, score });
    }),
  );
  scored.sort((x, y) => y.score - x.score || x.b - y.b || x.a - y.a);
  const usedB = new Set<number>();
  const usedA = new Set<number>();
  const renamed: [T, T][] = [];
  for (const { b, a } of scored) {
    if (usedB.has(b) || usedA.has(a)) continue;
    usedB.add(b);
    usedA.add(a);
    renamed.push([left[b]!, fresh[a]!]);
  }
  return {
    matched,
    renamed,
    removed: left.filter((_, i) => !usedB.has(i)),
    added: fresh.filter((_, j) => !usedA.has(j)),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** `name "a" → "b"` when a text field changed. */
function field(details: ChangeFact[], name: string, before: string | null, after: string | null) {
  if (before !== after) details.push({ fact: "text", field: name, before, after });
}

/** A value of the language that changed: `kind node → decision`. */
function value(details: ChangeFact[], name: string, before: string | null, after: string | null) {
  if (before !== after) details.push({ fact: "value", field: name, before, after });
}

/** A number as a value fact writes it, or null when there is none. */
function numberOrNull(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : String(n);
}

function change(
  kind: ChangeKind,
  subject: ChangeSubject,
  scope: string | null,
  id: string,
  label: string | null,
  facts: readonly ChangeFact[] = [],
  from: string | null = null,
): ModelChange {
  const details = facts.map((f) => describeFact(f, "en"));
  return { kind, subject, scope, id, from, label, facts, details };
}

// ----------------------------------------------------------------------------------- diagrams

function placeOf(diagram: FlowDiagram, target: string) {
  const place = diagram.placement.find((p) => p.statement === "place" && p.target === target);
  return place?.statement === "place" ? { x: place.x, y: place.y } : null;
}

function placementOf(diagram: FlowDiagram, target: string, statement: string): unknown {
  const entry = diagram.placement.find((p) => p.statement === statement && p.target === target);
  if (!entry) return null;
  const {
    range: _r,
    targetRange: _t,
    node: _n,
    ...rest
  } = entry as unknown as Record<string, unknown>;
  return JSON.parse(
    JSON.stringify(rest, (k, v) => (k.endsWith("Range") || k === "range" ? undefined : v)),
  );
}

function styleOf(diagram: FlowDiagram, target: string): unknown {
  return diagram.styles
    .filter((s) => s.target === target)
    .map((s) => ({ properties: s.properties, classes: s.classes.map((c) => c.name) }));
}

function animationOf(diagram: FlowDiagram, target: string): unknown {
  return diagram.animations
    .filter((a) => a.target === target)
    .map(({ effect, durationMs, repeat }) => ({ effect, durationMs, repeat }));
}

/** What an element touches, by the labels of the other ends, so renames keep it. */
function neighbours(diagram: FlowDiagram, id: string): string[] {
  const label = (other: string) => diagram.elementsById.get(other)?.label ?? other;
  return diagram.relations
    .filter((r) => r.from === id || r.to === id)
    .map((r) => (r.from === id ? `>${label(r.to)}` : `<${label(r.from)}`) + `:${r.label ?? ""}`);
}

function elementSimilarity(b: FlowDiagram, be: Element, a: FlowDiagram, ae: Element): number {
  if (be.kind !== ae.kind) return 0;
  let score = 0;
  if (be.labelWritten && ae.labelWritten && be.label === ae.label) score += 3;
  if (be.description !== null && be.description === ae.description) score += 1;
  const bp = placeOf(b, be.id);
  if (bp !== null && same(bp, placeOf(a, ae.id))) score += 2;
  // A pen has no label: the same points tell a renamed stroke as a label tells a box.
  if (be.pen !== null && same(be.pen.points, ae.pen?.points)) score += 3;
  const theirs = neighbours(a, ae.id);
  score += Math.min(4, neighbours(b, be.id).filter((n) => theirs.includes(n)).length * 2);
  return score;
}

/** Whether two owners write the same tags in the same order, wherever they are written. */
function sameTags(before: readonly TagUse[], after: readonly TagUse[]): boolean {
  return same(
    before.map((t) => t.text),
    after.map((t) => t.text),
  );
}

function elementDetails(b: FlowDiagram, be: Element, a: FlowDiagram, ae: Element): ChangeFact[] {
  const details: ChangeFact[] = [];
  value(details, "kind", be.kind, ae.kind);
  field(details, "label", be.label, ae.label);
  if (be.description !== ae.description) details.push({ fact: "changed", part: "description" });
  field(details, "technology", be.technology, ae.technology);
  field(details, "url", be.url, ae.url);
  field(details, "link", be.link?.text ?? null, ae.link?.text ?? null);
  field(details, "source", be.source, ae.source);
  if (be.external !== ae.external)
    details.push({ fact: "state", state: ae.external ? "external" : "notExternal" });
  const bc = be.classes.map((c) => c.name);
  const ac = ae.classes.map((c) => c.name);
  if (!same(bc, ac)) details.push({ fact: "classes", before: bc, after: ac });
  if (!sameTags(be.tags, ae.tags)) details.push({ fact: "changed", part: "tags" });
  const bg = be.groupPath.at(-1) ?? null;
  const ag = ae.groupPath.at(-1) ?? null;
  if (bg !== ag) details.push({ fact: "group", from: bg, to: ag });
  const bp = placeOf(b, be.id);
  const ap = placeOf(a, ae.id);
  if (!same(bp, ap)) {
    details.push({
      fact: "state",
      state: bp === null ? "placed" : ap === null ? "unplaced" : "moved",
    });
  }
  // A pen's points are compared as a place is: a stroke dragged, scaled or redrawn has moved.
  if (be.pen !== null && ae.pen !== null && !same(be.pen.points, ae.pen.points)) {
    details.push({ fact: "state", state: "moved" });
  }
  // A group made a list, or a list arranged otherwise: `layout none → column`.
  value(details, "layout", be.list?.layout ?? null, ae.list?.layout ?? null);
  value(details, "spacing", numberOrNull(be.list?.spacing), numberOrNull(ae.list?.spacing));
  value(details, "align", be.list?.align ?? null, ae.list?.align ?? null);
  if (!same(placementOf(b, be.id, "size"), placementOf(a, ae.id, "size"))) {
    details.push({ fact: "state", state: "resized" });
  }
  if (!same(styleOf(b, be.id), styleOf(a, ae.id))) details.push({ fact: "changed", part: "style" });
  if (!same(animationOf(b, be.id), animationOf(a, ae.id)))
    details.push({ fact: "changed", part: "effects" });
  return details;
}

/** A relation's key after element renames: its id, or its mapped ends and their count. */
function relationKeys(diagram: FlowDiagram, map: (id: string) => string): Map<Relation, string> {
  const counts = new Map<string, number>();
  const keys = new Map<Relation, string>();
  for (const relation of diagram.relations) {
    if (relation.id !== null) {
      keys.set(relation, relation.id);
      continue;
    }
    const ends = `${map(relation.from)}->${map(relation.to)}`;
    const n = (counts.get(ends) ?? 0) + 1;
    counts.set(ends, n);
    keys.set(relation, `${ends}#${n}`);
  }
  return keys;
}

function relationLabel(diagram: FlowDiagram, relation: Relation): string {
  const name = (id: string) => diagram.elementsById.get(id)?.label ?? id;
  return `${name(relation.from)} → ${name(relation.to)}${relation.label ? `: ${relation.label}` : ""}`;
}

function relationDetails(b: FlowDiagram, br: Relation, a: FlowDiagram, ar: Relation): ChangeFact[] {
  const details: ChangeFact[] = [];
  field(details, "label", br.label, ar.label);
  value(details, "line", br.line, ar.line);
  if (br.twoWay !== ar.twoWay) {
    details.push({ fact: "state", state: ar.twoWay ? "twoWay" : "oneWay" });
  } else if (br.heads !== ar.heads) {
    // An arrow written as a line, or a line as an arrow.
    details.push({ fact: "changed", part: "heads" });
  }
  if (br.async !== ar.async) details.push({ fact: "state", state: ar.async ? "async" : "sync" });
  if (br.description !== ar.description) details.push({ fact: "changed", part: "description" });
  field(details, "technology", br.technology, ar.technology);
  if (br.assumption !== ar.assumption) {
    details.push(
      ar.assumption === null
        ? { fact: "state", state: "confirmed" }
        : br.assumption === null
          ? { fact: "state", state: "assumed" }
          : { fact: "changed", part: "assumption" },
    );
  }
  const bc = br.classes.map((c) => c.name);
  const ac = ar.classes.map((c) => c.name);
  if (!same(bc, ac)) details.push({ fact: "classes", before: bc, after: ac });
  if (!sameTags(br.tags, ar.tags)) details.push({ fact: "changed", part: "tags" });
  if (!same(placementOf(b, br.key, "route"), placementOf(a, ar.key, "route"))) {
    details.push({ fact: "state", state: "rerouted" });
  }
  if (!same(placementOf(b, br.key, "label"), placementOf(a, ar.key, "label"))) {
    details.push({ fact: "state", state: "labelMoved" });
  }
  if (!same(styleOf(b, br.key), styleOf(a, ar.key)))
    details.push({ fact: "changed", part: "style" });
  if (!same(animationOf(b, br.key), animationOf(a, ar.key)))
    details.push({ fact: "changed", part: "effects" });
  return details;
}

function diagramDetails(b: FlowDiagram, a: FlowDiagram): ChangeFact[] {
  const details: ChangeFact[] = [];
  value(details, "type", b.type, a.type);
  const bp = b.properties;
  const ap = a.properties;
  field(details, "title", bp.title, ap.title);
  if (bp.description !== ap.description) details.push({ fact: "changed", part: "description" });
  field(details, "theme", bp.theme, ap.theme);
  value(details, "direction", bp.direction, ap.direction);
  value(details, "layout", bp.layout, ap.layout);
  value(details, "routing", bp.routing, ap.routing);
  value(details, "preset", bp.preset, ap.preset);
  if (!same(bp.canvas, ap.canvas)) details.push({ fact: "changed", part: "canvas" });
  if (!same(bp.layers, ap.layers)) details.push({ fact: "changed", part: "layers" });
  const bs = b.scenarios.map((s) => s.id);
  const as = a.scenarios.map((s) => s.id);
  for (const id of as.filter((s) => !bs.includes(s)))
    details.push({ fact: "scenario", id, added: true });
  for (const id of bs.filter((s) => !as.includes(s)))
    details.push({ fact: "scenario", id, added: false });
  if (b.c4 && a.c4) {
    value(details, "level", b.c4.level, a.c4.level);
    field(details, "scope", b.c4.scope, a.c4.scope);
    const list = (entries: readonly { path: string }[] | null) =>
      entries?.map((e) => e.path) ?? null;
    if (
      !same(list(b.c4.includes), list(a.c4.includes)) ||
      !same(list(b.c4.excludes), list(a.c4.excludes))
    ) {
      details.push({ fact: "changed", part: "includedEntities" });
    }
  }
  const constraints = (d: FlowDiagram) => d.constraints.map((c) => [c.kind, c.targets, c.edge]);
  if (!same(constraints(b), constraints(a))) details.push({ fact: "changed", part: "constraints" });
  return details;
}

/** The changes inside a diagram, and the ids its elements and relations had before. */
function diffDiagram(
  b: FlowDiagram,
  a: FlowDiagram,
): { changes: ModelChange[]; renames: Map<string, string> } {
  const scope = a.id;
  const changes: ModelChange[] = [];
  const elements = pair(
    b.elements,
    a.elements,
    (e) => e.id,
    (be, ae) => elementSimilarity(b, be, a, ae),
    3,
  );
  const renames = new Map(elements.renamed.map(([be, ae]) => [be.id, ae.id]));
  for (const [be, ae] of elements.renamed) {
    changes.push(
      change("renamed", "element", scope, ae.id, ae.label, elementDetails(b, be, a, ae), be.id),
    );
  }
  for (const [be, ae] of elements.matched) {
    const details = elementDetails(b, be, a, ae);
    if (details.length > 0)
      changes.push(change("changed", "element", scope, ae.id, ae.label, details));
  }
  for (const ae of elements.added)
    changes.push(
      change("added", "element", scope, ae.id, ae.label, [{ fact: "kind", kind: ae.kind }]),
    );
  for (const be of elements.removed) {
    changes.push(
      change("removed", "element", scope, be.id, be.label, [{ fact: "kind", kind: be.kind }]),
    );
  }

  const beforeKeys = relationKeys(b, (id) => renames.get(id) ?? id);
  const afterKeys = relationKeys(a, (id) => id);
  const mapped = (r: Relation, keys: Map<Relation, string>) => keys.get(r)!;
  const relations = pair(
    b.relations,
    a.relations,
    (r) => mapped(r, b.relations.includes(r) ? beforeKeys : afterKeys),
    (br, ar) =>
      (renames.get(br.from) ?? br.from) === ar.from &&
      (renames.get(br.to) ?? br.to) === ar.to &&
      br.label === ar.label
        ? 3
        : 0,
    3,
  );
  for (const [br, ar] of relations.renamed) {
    changes.push(
      change(
        "renamed",
        "relation",
        scope,
        ar.key,
        relationLabel(a, ar),
        relationDetails(b, br, a, ar),
        br.key,
      ),
    );
  }
  for (const [br, ar] of relations.matched) {
    const details = relationDetails(b, br, a, ar);
    if (details.length > 0) {
      changes.push(change("changed", "relation", scope, ar.key, relationLabel(a, ar), details));
    }
  }
  for (const ar of relations.added) {
    changes.push(change("added", "relation", scope, ar.key, relationLabel(a, ar)));
  }
  for (const br of relations.removed) {
    changes.push(change("removed", "relation", scope, br.key, relationLabel(b, br)));
  }
  if (a.type === "sequence" && b.type === "sequence") {
    const order = (d: FlowDiagram, keys: Map<Relation, string>) =>
      d.relations.map((r) => keys.get(r)).filter((k) => k !== undefined);
    const before = order(b, beforeKeys).filter((k) => order(a, afterKeys).includes(k));
    const after = order(a, afterKeys).filter((k) => before.includes(k));
    if (!same(before, after))
      changes.push(
        change("changed", "diagram", null, a.id, a.properties.title, [
          { fact: "state", state: "messagesReordered" },
        ]),
      );
  }
  for (const [br, ar] of relations.renamed) renames.set(br.key, ar.key);
  return { changes, renames };
}

// ------------------------------------------------------------------------------------- models

function entityDetails(be: ModelEntity, ae: ModelEntity, parent: string | null): ChangeFact[] {
  const details: ChangeFact[] = [];
  value(details, "kind", be.kind, ae.kind);
  field(details, "label", be.label, ae.label);
  if (be.description !== ae.description) details.push({ fact: "changed", part: "description" });
  field(details, "technology", be.technology, ae.technology);
  field(details, "url", be.url, ae.url);
  if (be.external !== ae.external)
    details.push({ fact: "state", state: ae.external ? "external" : "notExternal" });
  if (parent !== ae.parent) details.push({ fact: "parent", to: ae.parent });
  return details;
}

function diffModel(b: ModelDefinition, a: ModelDefinition): ModelChange[] {
  const scope = a.id;
  const changes: ModelChange[] = [];
  const renames = new Map<string, string>();
  const mapPath = (path: string | null) => {
    if (path === null) return null;
    for (const [from, to] of renames) {
      if (path === from) return to;
      if (path.startsWith(`${from}.`)) return `${to}${path.slice(from.length)}`;
    }
    return path;
  };
  const entities = pair(
    b.entities,
    a.entities,
    (e) => e.path,
    (be, ae) =>
      be.kind !== ae.kind
        ? 0
        : (be.label === ae.label ? 3 : 0) +
          (be.parent === ae.parent ? 1 : 0) +
          (be.technology !== null && be.technology === ae.technology ? 1 : 0),
    3,
  );
  // Parents before children, so a renamed parent maps its children's paths.
  for (const [be, ae] of entities.renamed) renames.set(be.path, ae.path);
  for (const [be, ae] of entities.renamed) {
    const details = entityDetails(be, ae, mapPath(be.parent));
    changes.push(change("renamed", "entity", scope, ae.path, ae.label, details, be.path));
  }
  for (const [be, ae] of entities.matched) {
    const details = entityDetails(be, ae, mapPath(be.parent));
    if (details.length > 0)
      changes.push(change("changed", "entity", scope, ae.path, ae.label, details));
  }
  for (const ae of entities.added)
    changes.push(
      change("added", "entity", scope, ae.path, ae.label, [{ fact: "kind", kind: ae.kind }]),
    );
  for (const be of entities.removed)
    changes.push(
      change("removed", "entity", scope, be.path, be.label, [{ fact: "kind", kind: be.kind }]),
    );

  const key = (r: ModelRelation, map: (p: string) => string) =>
    r.id ?? `${map(r.from)}->${map(r.to)}:${r.label ?? ""}`;
  const beforeKey = new Map(b.relations.map((r) => [r, key(r, (p) => mapPath(p)!)]));
  const relations = pair(
    b.relations,
    a.relations,
    (r) => beforeKey.get(r) ?? key(r, (p) => p),
    (br, ar) => (mapPath(br.from) === ar.from && mapPath(br.to) === ar.to ? 3 : 0),
    3,
  );
  const label = (r: ModelRelation) => `${r.from} → ${r.to}${r.label ? `: ${r.label}` : ""}`;
  for (const [br, ar] of [...relations.matched, ...relations.renamed]) {
    const details: ChangeFact[] = [];
    field(details, "label", br.label, ar.label);
    field(details, "technology", br.technology, ar.technology);
    if (br.description !== ar.description) details.push({ fact: "changed", part: "description" });
    if (br.assumption !== ar.assumption) {
      details.push(
        ar.assumption === null
          ? { fact: "state", state: "confirmed" }
          : br.assumption === null
            ? { fact: "state", state: "assumed" }
            : { fact: "changed", part: "assumption" },
      );
    }
    if (mapPath(br.from) !== ar.from || mapPath(br.to) !== ar.to) {
      details.push({ fact: "changed", part: "ends" });
    }
    const renamed = relations.renamed.some(([x]) => x === br);
    if (renamed)
      changes.push(change("renamed", "relation", scope, ar.key, label(ar), details, br.key));
    else if (details.length > 0)
      changes.push(change("changed", "relation", scope, ar.key, label(ar), details));
  }
  for (const ar of relations.added)
    changes.push(change("added", "relation", scope, ar.key, label(ar)));
  for (const br of relations.removed)
    changes.push(change("removed", "relation", scope, br.key, label(br)));
  return changes;
}

// ------------------------------------------------------------------------------------ stories

/** Diagram and element renames of a document, so stories compare by what they show. */
interface Renames {
  readonly diagrams: ReadonlyMap<string, string>;
  /** By the diagram's id after the change: element and relation ids before to after. */
  readonly targets: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

const NO_RENAMES: Renames = { diagrams: new Map(), targets: new Map() };

/** The actions of a scene; with `renames`, the ids of a version before, as they are named after. */
const actionsOf = (
  actions: readonly StoryAction[],
  view: string | null,
  renames: Renames = NO_RENAMES,
): unknown =>
  actions.map((x) => ({
    kind: x.kind,
    all: x.all,
    writtenMs: x.writtenMs,
    targets: x.targets.map(
      (t) => (view !== null ? renames.targets.get(view)?.get(t.id) : undefined) ?? t.id,
    ),
    children: actionsOf(x.children, view, renames),
  }));

/** The diagram a scene shows, as named after the change. */
const viewOf = (scene: StoryScene, renames: Renames = NO_RENAMES): string | null => {
  const id = scene.view.diagram?.id ?? null;
  return id === null ? scene.view.name : (renames.diagrams.get(id) ?? id);
};

function sceneDetails(b: StoryScene, a: StoryScene, renames: Renames): ChangeFact[] {
  const details: ChangeFact[] = [];
  field(details, "title", b.title, a.title);
  if (viewOf(b, renames) !== viewOf(a)) value(details, "view", b.view.name, a.view.name);
  const transition = (s: StoryScene) =>
    s.transition ? [s.transition.kind, s.transition.writtenMs] : null;
  if (!same(transition(b), transition(a))) details.push({ fact: "changed", part: "transition" });
  if (!same(actionsOf(b.actions, viewOf(b, renames), renames), actionsOf(a.actions, viewOf(a)))) {
    details.push({ fact: "changed", part: "actions" });
  }
  if (b.durationMs !== a.durationMs)
    details.push({ fact: "duration", before: b.durationMs, after: a.durationMs });
  return details;
}

function diffStory(b: StoryDefinition, a: StoryDefinition, renames: Renames): ModelChange[] {
  const changes: ModelChange[] = [];
  const scenes = pair(
    b.scenes,
    a.scenes,
    (s) => s.id,
    (bs, as) =>
      viewOf(bs, renames) === viewOf(as) &&
      same(actionsOf(bs.actions, viewOf(bs, renames), renames), actionsOf(as.actions, viewOf(as)))
        ? 3
        : 0,
    3,
  );
  for (const [bs, as] of scenes.renamed) {
    changes.push(
      change("renamed", "scene", a.id, as.id, as.title, sceneDetails(bs, as, renames), bs.id),
    );
  }
  for (const [bs, as] of scenes.matched) {
    const details = sceneDetails(bs, as, renames);
    if (details.length > 0)
      changes.push(change("changed", "scene", a.id, as.id, as.title, details));
  }
  for (const as of scenes.added) changes.push(change("added", "scene", a.id, as.id, as.title));
  for (const bs of scenes.removed) changes.push(change("removed", "scene", a.id, bs.id, bs.title));
  const order = (s: StoryDefinition, ids: readonly string[]) =>
    s.scenes.map((x) => x.id).filter((id) => ids.includes(id));
  const kept = scenes.matched.map(([, as]) => as.id);
  if (!same(order(b, kept), order(a, kept))) {
    changes.push(
      change("changed", "story", null, a.id, a.title, [
        { fact: "state", state: "scenesReordered" },
      ]),
    );
  }
  return changes;
}

// -------------------------------------------------------------------------------- documents

const themeOf = (t: ThemeDefinition) => ({
  extends: t.extends,
  tokens: t.tokens,
  classes: t.classes.map((c) => ({ id: c.id, properties: c.properties })),
  rules: t.rules.map((r) => ({ kind: r.kind, properties: r.properties })),
});

const profileOf = (p: ExportProfile) => {
  const { options: _o, range: _r, idRange: _i, node: _n, target, ...rest } = p;
  return { ...rest, target: target.name };
};

/** Shares of ids two diagrams have in common, for diagram renames. */
function overlap(b: FlowDiagram, a: FlowDiagram): number {
  const ids = new Set(b.elements.map((e) => e.id));
  const shared = a.elements.filter((e) => ids.has(e.id)).length;
  const total = new Set([...ids, ...a.elements.map((e) => e.id)]).size;
  return total === 0 ? 0 : shared / total;
}

/**
 * The semantic changes from one version of a document to another: diagrams, their elements and
 * relations, models and their entities, stories and their scenes, themes and export profiles.
 */
export function diffDocuments(before: Document, after: Document): ModelChange[] {
  const changes: ModelChange[] = [];
  const diagrams = pair(
    before.diagrams,
    after.diagrams,
    (d) => d.id,
    (b, a) =>
      b.type === a.type
        ? (overlap(b, a) >= 0.5 ? 3 : 0) +
          (b.properties.title !== null && b.properties.title === a.properties.title ? 3 : 0)
        : 0,
    3,
  );
  const renames = {
    diagrams: new Map(diagrams.renamed.map(([b, a]) => [b.id, a.id])),
    targets: new Map<string, Map<string, string>>(),
  };
  for (const [b, a] of [...diagrams.renamed, ...diagrams.matched]) {
    const details = diagramDetails(b, a);
    const renamed = diagrams.renamed.some(([x]) => x === b);
    if (renamed)
      changes.push(change("renamed", "diagram", null, a.id, a.properties.title, details, b.id));
    else if (details.length > 0)
      changes.push(change("changed", "diagram", null, a.id, a.properties.title, details));
    const inside = diffDiagram(b, a);
    changes.push(...inside.changes);
    renames.targets.set(a.id, inside.renames);
  }
  for (const a of diagrams.added)
    changes.push(
      change("added", "diagram", null, a.id, a.properties.title, [{ fact: "kind", kind: a.type }]),
    );
  for (const b of diagrams.removed)
    changes.push(
      change("removed", "diagram", null, b.id, b.properties.title, [
        { fact: "kind", kind: b.type },
      ]),
    );

  const models = pair(
    before.models,
    after.models,
    (m) => m.id,
    (b, a) =>
      b.entities.length > 0 &&
      same(
        b.entities.map((e) => e.path),
        a.entities.map((e) => e.path),
      )
        ? 3
        : 0,
    3,
  );
  for (const [b, a] of [...models.renamed, ...models.matched]) {
    if (models.renamed.some(([x]) => x === b))
      changes.push(change("renamed", "model", null, a.id, null, [], b.id));
    changes.push(...diffModel(b, a));
  }
  for (const a of models.added) changes.push(change("added", "model", null, a.id, null));
  for (const b of models.removed) changes.push(change("removed", "model", null, b.id, null));

  const stories = pair(
    before.stories,
    after.stories,
    (s) => s.id,
    (b, a) => (b.title !== null && b.title === a.title ? 3 : 0),
    3,
  );
  for (const [b, a] of [...stories.renamed, ...stories.matched]) {
    const details: ChangeFact[] = [];
    field(details, "title", b.title, a.title);
    if (b.description !== a.description) details.push({ fact: "changed", part: "description" });
    const target = (s: StoryDefinition, r?: Renames) => {
      const id = s.target.diagram?.id ?? null;
      return id === null ? s.target.name : (r?.diagrams.get(id) ?? id);
    };
    if (target(b, renames) !== target(a)) value(details, "view", b.target.name, a.target.name);
    if (b.durationMs !== a.durationMs)
      details.push({ fact: "duration", before: b.durationMs, after: a.durationMs });
    if (stories.renamed.some(([x]) => x === b))
      changes.push(change("renamed", "story", null, a.id, a.title, details, b.id));
    else if (details.length > 0)
      changes.push(change("changed", "story", null, a.id, a.title, details));
    changes.push(...diffStory(b, a, renames));
  }
  for (const a of stories.added) changes.push(change("added", "story", null, a.id, a.title));
  for (const b of stories.removed) changes.push(change("removed", "story", null, b.id, b.title));

  const blocks = <T extends { id: string }>(
    subject: ChangeSubject,
    b: readonly T[],
    a: readonly T[],
    value: (item: T) => unknown,
  ) => {
    const paired = pair(
      b,
      a,
      (x) => x.id,
      (x, y) => (same(value(x), value(y)) ? 3 : 0),
      3,
    );
    for (const [x, y] of paired.renamed)
      changes.push(change("renamed", subject, null, y.id, null, [], x.id));
    for (const [x, y] of paired.matched) {
      if (!same(value(x), value(y))) changes.push(change("changed", subject, null, y.id, null));
    }
    for (const y of paired.added) changes.push(change("added", subject, null, y.id, null));
    for (const x of paired.removed) changes.push(change("removed", subject, null, x.id, null));
  };
  blocks("theme", before.themes, after.themes, themeOf);
  blocks("export", before.exports, after.exports, profileOf);
  return changes;
}

/** One line per change, such as `~ element api: label "API" → "API Gateway"`. */
export function describeChange(c: ModelChange, locale: Locale = getLocale()): string {
  const words = changeMessages(locale);
  const sign = { added: "+", removed: "-", renamed: ">", changed: "~" }[c.kind];
  const what = `${words.subjects[c.subject]} ${c.from !== null ? `${c.from} → ${c.id}` : c.id}`;
  const label =
    c.label !== null && c.label !== c.id && c.subject !== "relation"
      ? ` "${c.label}"`
      : c.subject === "relation" && c.label
        ? ` (${c.label})`
        : "";
  const details = c.facts.map((f) => describeFact(f, locale));
  return `${sign} ${what}${label}${details.length > 0 ? `: ${details.join("; ")}` : ""}`;
}

/** One fact in a language, by default the interface's: `label "API" → "API Gateway"`, `moved`. */
export function describeFact(fact: ChangeFact, locale: Locale = getLocale()): string {
  const words = changeMessages(locale);
  const name = (field: string) => words.fields[field] ?? field;
  const plain = (value: string | null) => value ?? words.none;
  const quoted = (value: string | null) => (value === null ? words.none : `"${value}"`);
  const list = (values: readonly string[]) => values.join(", ") || words.none;
  switch (fact.fact) {
    case "text":
      return `${name(fact.field)} ${quoted(fact.before)} → ${quoted(fact.after)}`;
    case "value":
      return `${name(fact.field)} ${plain(fact.before)} → ${plain(fact.after)}`;
    case "classes":
      return `${name("classes")} ${list(fact.before)} → ${list(fact.after)}`;
    case "changed":
      return words.changed[fact.part];
    case "state":
      return words.states[fact.state];
    case "group":
      return fact.to === null ? words.movedOutOf(fact.from ?? "") : words.movedInto(fact.to);
    case "parent":
      return fact.to === null ? words.movedToRoot : words.movedInto(fact.to);
    case "scenario":
      return words.scenario(fact.id, fact.added);
    case "duration":
      return words.duration(fact.before, fact.after);
    case "kind":
      return fact.kind;
  }
}
