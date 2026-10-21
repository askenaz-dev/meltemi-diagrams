import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "./front.js";
import { IdMap, slugId } from "./ids.js";
import { messages, type CoverageNote } from "./messages/index.js";
import type { C4Entity, C4Relation, C4Sheet, EntityKind } from "./writer.js";

export type C4Level = "context" | "container" | "component";

/** A C4 source line: a macro call, a boundary opening with `{`, or `}`. */
export interface C4Statement {
  readonly text: string;
  readonly span: Span;
  readonly comments: readonly string[];
}

export interface C4Options {
  /** The level the source states (Mermaid keyword or C4-PlantUML include), if any. */
  readonly level: C4Level | null;
  /** Mermaid `C4Dynamic` or C4-PlantUML `C4_Dynamic`. */
  readonly dynamic: boolean;
  readonly title?: string;
  /** The diagram's header, for findings about the whole diagram. */
  readonly span: Span;
  /** Prefix for findings: `mermaid.c4` or `plantuml.c4`. */
  readonly construct: string;
}

export interface EntityMacro {
  kind: EntityKind;
  external: boolean;
  /** Positional parameters after alias and label. */
  params: readonly string[];
  /**
   * What the macro loses in the mapping, if anything: the note of the coverage tables that its
   * finding also reports.
   */
  approx?: CoverageNote;
}

const PERSON = ["descr", "sprite", "tags", "link", "type"] as const;
const SYSTEM = ["descr", "sprite", "tags", "link", "type", "baseShape"] as const;
const CONTAINER = ["techn", "descr", "sprite", "tags", "link", "baseShape"] as const;

export const ENTITY_MACROS: Readonly<Record<string, EntityMacro>> = {
  Person: { kind: "person", external: false, params: PERSON },
  Person_Ext: { kind: "person", external: true, params: PERSON },
  System: { kind: "system", external: false, params: SYSTEM },
  System_Ext: { kind: "system", external: true, params: SYSTEM },
  SystemDb: { kind: "system", external: false, params: SYSTEM, approx: "databaseSystem" },
  SystemDb_Ext: { kind: "system", external: true, params: SYSTEM, approx: "databaseSystem" },
  SystemQueue: { kind: "system", external: false, params: SYSTEM, approx: "queueSystem" },
  SystemQueue_Ext: { kind: "system", external: true, params: SYSTEM, approx: "queueSystem" },
  Container: { kind: "container", external: false, params: CONTAINER },
  ContainerDb: { kind: "datastore", external: false, params: CONTAINER },
  ContainerQueue: {
    kind: "container",
    external: false,
    params: CONTAINER,
    approx: "queueContainer",
  },
  Container_Ext: { kind: "container", external: false, params: CONTAINER, approx: "externalOnly" },
  ContainerDb_Ext: {
    kind: "datastore",
    external: false,
    params: CONTAINER,
    approx: "externalOnly",
  },
  ContainerQueue_Ext: {
    kind: "container",
    external: false,
    params: CONTAINER,
    approx: "queueContainerExternal",
  },
  Component: { kind: "component", external: false, params: CONTAINER },
  ComponentDb: {
    kind: "component",
    external: false,
    params: CONTAINER,
    approx: "databaseComponent",
  },
  ComponentQueue: {
    kind: "component",
    external: false,
    params: CONTAINER,
    approx: "queueComponent",
  },
  Component_Ext: { kind: "component", external: false, params: CONTAINER, approx: "externalOnly" },
  ComponentDb_Ext: {
    kind: "component",
    external: false,
    params: CONTAINER,
    approx: "databaseComponentExternal",
  },
  ComponentQueue_Ext: {
    kind: "component",
    external: false,
    params: CONTAINER,
    approx: "queueComponentExternal",
  },
};

export const BOUNDARY_PARAMS: Readonly<Record<string, readonly string[]>> = {
  Boundary: ["type", "tags", "link", "descr"],
  Enterprise_Boundary: ["tags", "link", "descr"],
  System_Boundary: ["tags", "link", "descr"],
  Container_Boundary: ["tags", "link", "descr"],
};

const REL_PARAMS = ["label", "techn", "descr", "sprite", "tags", "link"] as const;
const REL_DIRECTIONS = new Set(["U", "Up", "D", "Down", "L", "Left", "R", "Right", "Neighbor"]);

/** Macros that only style or lay out the picture. */
export const C4_DROPPED_MACROS: ReadonlySet<string> = new Set([
  "AddElementTag",
  "AddRelTag",
  "AddBoundaryTag",
  "AddPersonTag",
  "AddSystemTag",
  "AddContainerTag",
  "AddComponentTag",
  "AddExternalPersonTag",
  "AddExternalSystemTag",
  "AddExternalContainerTag",
  "AddExternalComponentTag",
  "UpdateElementStyle",
  "UpdateRelStyle",
  "UpdateBoundaryStyle",
  "UpdateContainerBoundaryStyle",
  "UpdateSystemBoundaryStyle",
  "UpdateEnterpriseBoundaryStyle",
  "UpdateLayoutConfig",
  "UpdateLegendTitle",
  "UpdateSkinparamsAndLegendEntry",
  "SHOW_LEGEND",
  "SHOW_FLOATING_LEGEND",
  "LAYOUT_WITH_LEGEND",
  "LAYOUT_AS_SKETCH",
  "HIDE_STEREOTYPE",
  "HIDE_PERSON_SPRITE",
  "SHOW_PERSON_SPRITE",
  "SHOW_PERSON_PORTRAIT",
  "SHOW_PERSON_OUTLINE",
  "SHOW_ELEMENT_DESCRIPTIONS",
  "SHOW_INDEX",
  "HIDE_LEGEND",
  "SetDefaultLegendEntries",
  "Lay_U",
  "Lay_Up",
  "Lay_D",
  "Lay_Down",
  "Lay_L",
  "Lay_Left",
  "Lay_R",
  "Lay_Right",
  "Lay_Distance",
  "increment",
  "setIndex",
]);

interface ParsedCall {
  name: string;
  positional: string[];
  named: Map<string, string>;
  opens: boolean;
}

/** Reads `Name(a, "b", $x="y") {`. */
export function parseCall(text: string): ParsedCall | null {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*(\{)?\s*$/.exec(text.trim());
  if (!m) return null;
  const positional: string[] = [];
  const named = new Map<string, string>();
  for (const arg of splitArgs(m[2]!)) {
    const kv = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/.exec(arg);
    if (kv) named.set(kv[1]!, unquote(kv[2]!));
    else positional.push(unquote(arg));
  }
  return { name: m[1]!, positional, named, opens: m[3] === "{" };
}

function splitArgs(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last !== "" || out.length > 0) out.push(last);
  return out;
}

function unquote(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** C4 label text: `\n` and `<br>` as line breaks. */
function c4Text(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .trim();
}

interface RawEntity {
  source: string;
  kind: EntityKind;
  label: string;
  description?: string;
  technology?: string;
  external: boolean;
  /** The innermost system or container boundary around the declaration. */
  boundary: RawBoundary | null;
  span: Span;
  comments: string[];
  order: number;
}

interface RawBoundary {
  source: string;
  macro: string;
  /** `system`, `container` or `flat` (enterprise and generic boundaries). */
  role: "system" | "container" | "flat";
  label: string;
  description?: string;
  parent: RawBoundary | null;
  span: Span;
  comments: string[];
  order: number;
}

interface RawRelation {
  from: string;
  to: string;
  label?: string;
  technology?: string;
  span: Span;
  comments: string[];
}

/** Turns C4 macro statements into a model and a view. */
export function readC4(
  ctx: FrontContext,
  statements: readonly C4Statement[],
  options: C4Options,
): C4Sheet {
  const r = ctx.reporter;
  const c = options.construct;
  const entities: RawEntity[] = [];
  const boundaries: RawBoundary[] = [];
  const relations: RawRelation[] = [];
  const stack: RawBoundary[] = [];
  let direction: string | undefined;
  let order = 0;
  const flat: RawBoundary[] = [];

  const enclosing = (): RawBoundary | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.role !== "flat") return stack[i]!;
    return null;
  };

  for (const st of statements) {
    const text = st.text.trim();
    if (text === "}") {
      if (!stack.pop()) r.syntax(`${c}.boundary`, st.span, messages().c4.closeWithoutBoundary);
      continue;
    }
    const call = parseCall(text);
    if (!call) {
      r.syntax(`${c}.statement`, st.span, messages().common.cannotRead(text));
      continue;
    }
    const entity = ENTITY_MACROS[call.name];
    if (entity) {
      const [source, label = source ?? ""] = call.positional;
      if (!source) {
        r.syntax(`${c}.${call.name}`, st.span, messages().c4.needsAlias(call.name));
        continue;
      }
      const values = paramValues(call, entity.params, 2);
      const raw: RawEntity = {
        source,
        kind: entity.kind,
        label: c4Text(label),
        external: entity.external,
        boundary: enclosing(),
        span: st.span,
        comments: [...st.comments],
        order: order++,
      };
      if (values.descr) raw.description = c4Text(values.descr);
      if (values.techn) raw.technology = c4Text(values.techn);
      entities.push(raw);
      if (entity.approx) {
        r.approximated(`${c}.${call.name}`, st.span, messages().coverage[entity.approx]);
      } else r.mapped(`${c}.${call.name}`);
      reportExtras(values, st.span);
      if (call.opens) {
        // An element with a body is read as a boundary of its kind.
        entities.pop();
        const boundary: RawBoundary = {
          source,
          macro: call.name,
          role:
            entity.kind === "system"
              ? "system"
              : entity.kind === "component" || entity.kind === "person"
                ? "flat"
                : "container",
          label: raw.label,
          parent: stack[stack.length - 1] ?? null,
          span: st.span,
          comments: raw.comments,
          order: raw.order,
        };
        if (raw.description !== undefined) boundary.description = raw.description;
        boundaries.push(boundary);
        stack.push(boundary);
        r.approximated(`${c}.${call.name}`, st.span, messages().c4.elementWithBody);
      }
      continue;
    }
    const boundaryParams = BOUNDARY_PARAMS[call.name];
    if (boundaryParams) {
      const [source, label = source ?? ""] = call.positional;
      if (!source) {
        r.syntax(`${c}.${call.name}`, st.span, messages().c4.needsAlias(call.name));
        continue;
      }
      const values = paramValues(call, boundaryParams, 2);
      let role: RawBoundary["role"] =
        call.name === "System_Boundary"
          ? "system"
          : call.name === "Container_Boundary"
            ? "container"
            : "flat";
      if (call.name === "Boundary") {
        const type = (values.type ?? "").toLowerCase();
        if (type === "system") role = "system";
        else if (type === "container") role = "container";
      }
      const boundary: RawBoundary = {
        source,
        macro: call.name,
        role,
        label: c4Text(label),
        parent: stack[stack.length - 1] ?? null,
        span: st.span,
        comments: [...st.comments],
        order: order++,
      };
      if (values.descr) boundary.description = c4Text(values.descr);
      if (role === "flat") {
        r.approximated(`${c}.${call.name}`, st.span, messages().c4.notDrawn(call.name));
        flat.push(boundary);
      } else r.mapped(`${c}.${call.name}`);
      if (call.opens) stack.push(boundary);
      boundaries.push(boundary);
      if (values.tags || values.link) r.dropped(`${c}.tags`, st.span, messages().c4.boundaryTags);
      continue;
    }
    const rel = relationMacro(call.name);
    if (rel) {
      const args = [...call.positional];
      if (rel.indexed) args.shift();
      const [from, to] = args;
      if (!from || !to) {
        r.syntax(`${c}.${call.name}`, st.span, messages().c4.needsEnds(call.name));
        continue;
      }
      const values = paramValues({ ...call, positional: args }, REL_PARAMS, 2);
      const one = (a: string, b: string): RawRelation => {
        const out: RawRelation = { from: a, to: b, span: st.span, comments: [...st.comments] };
        if (values.label) out.label = c4Text(values.label);
        if (values.techn) out.technology = c4Text(values.techn);
        return out;
      };
      if (rel.both) {
        relations.push(one(from, to), one(to, from));
        r.approximated(`${c}.BiRel`, st.span, messages().c4.bidirectional);
      } else if (rel.back) {
        relations.push(one(to, from));
        r.mapped(`${c}.Rel_Back`);
      } else {
        relations.push(one(from, to));
        r.mapped(`${c}.Rel`);
      }
      if (rel.direction) r.approximated(`${c}.Rel_direction`, st.span, messages().c4.directions);
      if (rel.indexed) r.approximated(`${c}.RelIndex`, st.span, messages().c4.numbers);
      if (values.descr) r.dropped(`${c}.Rel.descr`, st.span, messages().c4.descriptions);
      reportExtras(values, st.span);
      continue;
    }
    if (/^LAYOUT_(LEFT_RIGHT|LANDSCAPE)$/.test(call.name)) {
      direction = "LR";
      r.mapped(`${c}.${call.name}`);
      continue;
    }
    if (call.name === "LAYOUT_TOP_DOWN") {
      direction = "TB";
      r.mapped(`${c}.${call.name}`);
      continue;
    }
    if (C4_DROPPED_MACROS.has(call.name)) {
      r.dropped(`${c}.${call.name}`, st.span, messages().c4.drawingOnly(call.name));
      continue;
    }
    if (/^(Deployment_Node|Node|Node_L|Node_R)(_L|_R)?$/.test(call.name)) {
      r.dropped(`${c}.${call.name}`, st.span, messages().c4.deploymentNodes, true);
      if (call.opens)
        stack.push({
          source: call.positional[0] ?? "",
          macro: call.name,
          role: "flat",
          label: "",
          parent: stack[stack.length - 1] ?? null,
          span: st.span,
          comments: [],
          order: order++,
        });
      continue;
    }
    r.dropped(`${c}.unknown`, st.span, messages().c4.unknownMacro(call.name), true);
  }
  for (const open of stack) r.syntax(`${c}.boundary`, open.span, messages().c4.boundaryNotClosed);

  function reportExtras(values: Record<string, string | undefined>, span: Span): void {
    if (values.sprite) r.dropped(`${c}.sprite`, span, messages().common.sprites);
    if (values.tags) r.dropped(`${c}.tags`, span, messages().c4.tags);
    if (values.link) r.dropped(`${c}.link`, span, messages().c4.links);
  }

  return buildModel(ctx, options, entities, boundaries, relations, direction);
}

function relationMacro(
  name: string,
): { back: boolean; both: boolean; direction: boolean; indexed: boolean } | null {
  if (name === "RelIndex") return { back: false, both: false, direction: false, indexed: true };
  const m = /^(Rel|BiRel|RelIndex)(?:_(Back))?(?:_([A-Za-z]+))?$/.exec(name);
  if (!m) return null;
  const dir = m[3];
  if (dir !== undefined && !REL_DIRECTIONS.has(dir)) return null;
  return {
    back: m[2] === "Back",
    both: m[1] === "BiRel",
    direction: dir !== undefined,
    indexed: m[1] === "RelIndex",
  };
}

function paramValues(
  call: ParsedCall,
  params: readonly string[],
  skip: number,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  params.forEach((name, i) => {
    const value = call.positional[skip + i];
    if (value !== undefined && value !== "") out[name] = value;
  });
  for (const [name, value] of call.named) if (value !== "") out[name] = value;
  return out;
}

function buildModel(
  ctx: FrontContext,
  options: C4Options,
  entities: RawEntity[],
  boundaries: RawBoundary[],
  relations: RawRelation[],
  direction: string | undefined,
): C4Sheet {
  const r = ctx.reporter;
  const c = options.construct;
  const ids = new IdMap(r);
  // A container boundary around containers and no components stands for their system, as
  // Mermaid's own examples write it.
  for (const b of boundaries) {
    if (b.role !== "container" || systemOfRaw(b.parent)) continue;
    const held = entities.filter((e) => e.boundary === b);
    if (
      held.some((e) => e.kind === "container" || e.kind === "datastore") &&
      !held.some((e) => e.kind === "component")
    ) {
      b.role = "system";
      r.approximated(`${c}.Container_Boundary`, b.span, messages().c4.containerBoundaryAsSystem);
    }
  }
  const level: C4Level =
    options.level ??
    (entities.some((e) => e.kind === "component")
      ? "component"
      : entities.some((e) => e.kind === "container" || e.kind === "datastore") ||
          boundaries.some((b) => b.role === "system")
        ? "container"
        : "context");

  // Every system and container boundary is an entity; boundaries nest by role.
  interface Node {
    entity: C4Entity;
    source: string | null;
    parent: Node | null;
    order: number;
  }
  const nodes = new Map<string, Node>();
  const roots: Node[] = [];
  const add = (node: Node) => {
    if (node.parent) node.parent.entity.children.push(node.entity);
    else roots.push(node);
    if (node.source !== null) nodes.set(node.source, node);
  };
  const systemOf = (b: RawBoundary | null): RawBoundary | null => {
    for (let x = b; x; x = x.parent) if (x.role === "system") return x;
    return null;
  };

  // The labels of a system or a container the importer adds are content, in the import's language.
  const content = messages(ctx.locale).content;
  let syntheticSystem: Node | null = null;
  const synthetic = (): Node => {
    if (syntheticSystem) return syntheticSystem;
    const label = options.title ?? content.system;
    const id = ids.unique(slugId(options.title ?? "", "system"));
    syntheticSystem = {
      entity: { kind: "system", id, label, external: false, children: [], comments: [] },
      source: null,
      parent: null,
      order: -1,
    };
    roots.unshift(syntheticSystem);
    return syntheticSystem;
  };
  let syntheticContainer: Node | null = null;
  const containerFor = (system: Node): Node => {
    if (syntheticContainer) return syntheticContainer;
    const id = ids.unique("components");
    syntheticContainer = {
      entity: {
        kind: "container",
        id,
        label: content.components,
        external: false,
        children: [],
        comments: [],
      },
      source: null,
      parent: system,
      order: -1,
    };
    system.entity.children.unshift(syntheticContainer.entity);
    return syntheticContainer;
  };

  // Ids in declaration order, boundaries and entities together.
  const declared = [
    ...boundaries
      .filter((b) => b.role !== "flat")
      .map((b) => ({ order: b.order, source: b.source, span: b.span })),
    ...entities.map((e) => ({ order: e.order, source: e.source, span: e.span })),
  ].sort((a, b) => a.order - b.order);
  for (const d of declared) ids.id(d.source, d.span);

  // System boundaries first (they hold containers), then container boundaries.
  const scopeSystems: RawBoundary[] = [];
  const scopeContainers: RawBoundary[] = [];
  for (const b of boundaries.filter((b) => b.role === "system").sort((a, b) => a.order - b.order)) {
    if (nodes.has(b.source)) continue;
    add({
      entity: entityOf("system", ids.id(b.source), b.label, b.description, b.comments),
      source: b.source,
      parent: null,
      order: b.order,
    });
    if (systemOf(b.parent)) {
      r.approximated(`${c}.System_Boundary`, b.span, messages().c4.systemInSystem);
    }
    scopeSystems.push(b);
  }
  for (const b of boundaries
    .filter((b) => b.role === "container")
    .sort((a, b) => a.order - b.order)) {
    if (nodes.has(b.source)) continue;
    const sys = systemOf(b.parent);
    let parent = sys ? nodes.get(sys.source)! : null;
    if (!parent) {
      parent = synthetic();
      r.approximated(`${c}.Container_Boundary`, b.span, messages().c4.containerBoundaryOutside);
    }
    add({
      entity: entityOf("container", ids.id(b.source), b.label, b.description, b.comments),
      source: b.source,
      parent,
      order: b.order,
    });
    scopeContainers.push(b);
  }
  // The component view's scope decides where loose containers go.
  const firstContainer = scopeContainers[0];
  const scopeSystemNode = (): Node | null => {
    if (level === "component" && firstContainer) return nodes.get(firstContainer.source)!.parent;
    const s = scopeSystems[0];
    return s ? nodes.get(s.source)! : null;
  };

  for (const e of [...entities].sort((a, b) => a.order - b.order)) {
    if (nodes.has(e.source)) {
      r.syntax(`${c}.duplicate`, e.span, messages().c4.duplicate(e.source));
      continue;
    }
    const id = ids.id(e.source);
    const entity = entityOf(
      e.kind,
      id,
      e.label,
      e.description,
      e.comments,
      e.technology,
      e.external,
    );
    let parent: Node | null = null;
    if (e.kind === "container" || e.kind === "datastore") {
      const sys = systemOf(e.boundary);
      parent = sys ? nodes.get(sys.source)! : null;
      if (!parent && e.boundary?.role === "container")
        parent = nodes.get(e.boundary.source)!.parent;
      if (!parent) {
        parent = scopeSystemNode() ?? synthetic();
        r.approximated(
          `${c}.${e.kind === "datastore" ? "ContainerDb" : "Container"}`,
          e.span,
          parent === syntheticSystem
            ? messages().c4.containerInNamedSystem
            : messages().c4.containerInScope,
        );
      }
    } else if (e.kind === "component") {
      let b = e.boundary;
      while (b && b.role !== "container") b = b.parent;
      parent = b ? nodes.get(b.source)! : null;
      if (!parent) {
        const sys = systemOf(e.boundary);
        const system = (sys ? nodes.get(sys.source) : null) ?? scopeSystemNode() ?? synthetic();
        parent = firstContainer ? nodes.get(firstContainer.source)! : containerFor(system);
        r.approximated(`${c}.Component`, e.span, messages().c4.componentOutside);
      }
    } else if (e.boundary && e.boundary.role !== "flat") {
      r.approximated(`${c}.nesting`, e.span, messages().c4.nested(e.kind));
    }
    add({ entity, source: e.source, parent, order: e.order });
  }

  // Paths.
  const pathOf = new Map<C4Entity, string>();
  const walk = (list: C4Entity[], prefix: string) => {
    for (const entity of list) {
      const path = prefix === "" ? entity.id : `${prefix}.${entity.id}`;
      pathOf.set(entity, path);
      walk(entity.children, path);
    }
  };
  roots.sort((a, b) => a.order - b.order);
  walk(
    roots.map((n) => n.entity),
    "",
  );
  const path = (source: string) => {
    const node = nodes.get(source);
    return node ? pathOf.get(node.entity)! : null;
  };

  const modelRelations: C4Relation[] = [];
  for (const rel of relations) {
    const from = path(rel.from);
    const to = path(rel.to);
    if (from === null || to === null) {
      const missing = from === null ? rel.from : rel.to;
      r.dropped(
        `${c}.Rel`,
        rel.span,
        messages().c4.missingEnd(missing, flatSource(boundaries, missing)),
        true,
      );
      continue;
    }
    if (from === to || to.startsWith(`${from}.`) || from.startsWith(`${to}.`)) {
      r.dropped(`${c}.Rel`, rel.span, messages().c4.relationToParent, true);
      continue;
    }
    const out: C4Relation = { from, to, comments: rel.comments };
    if (rel.label !== undefined && rel.label !== "") out.label = rel.label;
    if (rel.technology !== undefined) out.technology = rel.technology;
    modelRelations.push(out);
  }

  // The view: the level's scope, with fallbacks when the source has none.
  let viewLevel = level;
  let scopeNode: Node | null = null;
  const firstOfKind = (kinds: readonly string[]) =>
    [...nodes.values()]
      .sort((a, b) => a.order - b.order)
      .find((n) => kinds.includes(n.entity.kind)) ?? null;
  if (viewLevel === "component") {
    scopeNode = firstContainer
      ? nodes.get(firstContainer.source)!
      : (syntheticContainer ?? firstOfKind(["container"]));
    if (scopeContainers.length > 1) {
      r.approximated(
        `${c}.Container_Boundary`,
        scopeContainers[1]!.span,
        messages().c4.componentScopes,
      );
    }
    if (!scopeNode) {
      viewLevel = "container";
      r.approximated(`${c}.level`, options.span, messages().c4.componentNeedsContainer);
    }
  }
  if (viewLevel === "container") {
    scopeNode = scopeSystems[0]
      ? nodes.get(scopeSystems[0].source)!
      : (syntheticSystem ?? firstOfKind(["system"]));
    if (scopeSystems.length > 1) {
      r.approximated(`${c}.System_Boundary`, scopeSystems[1]!.span, messages().c4.containerScopes);
    }
    if (!scopeNode) {
      viewLevel = "context";
      r.approximated(`${c}.level`, options.span, messages().c4.containerNeedsSystem);
    }
  }
  const scope = scopeNode ? pathOf.get(scopeNode.entity) : undefined;

  const include: string[] = [];
  const push = (p: string | undefined) => {
    if (p !== undefined && !include.includes(p)) include.push(p);
  };
  const ordered = [...nodes.values()].sort((a, b) => a.order - b.order);
  const scopeSystem = viewLevel === "component" ? (scopeNode?.parent ?? null) : scopeNode;
  const systemNodeOf = (n: Node): Node => {
    let x = n;
    while (x.parent) x = x.parent;
    return x;
  };
  const containerNodeOf = (n: Node): Node | null => {
    for (let x: Node | null = n; x; x = x.parent) {
      if (x.entity.kind === "container" || x.entity.kind === "datastore") return x;
    }
    return null;
  };
  for (const node of ordered) {
    const kind = node.entity.kind;
    const p = pathOf.get(node.entity);
    if (viewLevel === "context") {
      push(pathOf.get(systemNodeOf(node).entity));
    } else if (viewLevel === "container") {
      if (kind === "person") push(p);
      else if (systemNodeOf(node) !== scopeNode) push(pathOf.get(systemNodeOf(node).entity));
      else if (kind !== "system") push(pathOf.get(containerNodeOf(node)!.entity));
    } else if (kind === "person") push(p);
    else if (systemNodeOf(node) !== scopeSystem) push(pathOf.get(systemNodeOf(node).entity));
    else if (kind === "component" && node.parent === scopeNode) push(p);
    else if (kind !== "system") {
      const container = containerNodeOf(node);
      if (container && container !== scopeNode) push(pathOf.get(container.entity));
    }
  }

  if (options.dynamic) {
    r.approximated(`${c}.dynamic`, options.span, messages().c4.dynamic);
  }

  const sheet: C4Sheet = {
    type: "c4",
    id: "c4",
    model: "c4_model",
    level: viewLevel,
    include,
    entities: roots.map((n) => n.entity),
    relations: modelRelations,
    comments: [],
    trailing: [],
  };
  if (scope !== undefined) sheet.scope = scope;
  if (options.title !== undefined) sheet.title = options.title;
  if (direction !== undefined) sheet.direction = direction;
  return sheet;
}

function flatSource(boundaries: readonly RawBoundary[], source: string): boolean {
  return boundaries.some((b) => b.role === "flat" && b.source === source);
}

function entityOf(
  kind: EntityKind,
  id: string,
  label: string,
  description: string | undefined,
  comments: readonly string[],
  technology?: string,
  external = false,
): C4Entity {
  const entity: C4Entity = {
    kind,
    id,
    label: label === "" || label === id ? null : label,
    external,
    children: [],
    comments: [...comments],
  };
  if (description !== undefined && description !== "") entity.description = description;
  if (technology !== undefined && technology !== "") entity.technology = technology;
  return entity;
}

function systemOfRaw(b: RawBoundary | null): RawBoundary | null {
  for (let x = b; x; x = x.parent) if (x.role === "system") return x;
  return null;
}
