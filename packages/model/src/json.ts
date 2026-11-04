import type { Diagnostic, Location, Range } from "@meltemi/diagrams-language";
import type {
  AnimationEntry,
  ClassDefinition,
  Compilation,
  ConstraintEntry,
  Element,
  FlowDiagram,
  ImportDeclaration,
  ModelDefinition,
  PlacementEntry,
  Point,
  Relation,
  RouteEndpoint,
  RuleEntry,
  SequenceEvent,
  SequenceScenario,
  StyleEntry,
  StyleProperties,
  TagUse,
  ThemeDefinition,
  StoryAction,
  StoryDefinition,
  ExportProfile,
} from "./types.js";

export const MODEL_JSON_FORMAT = "model-json";
export const MODEL_JSON_VERSION = "0.1";

export interface LocationJson {
  offset: number;
  line: number;
  column: number;
}

export interface RangeJson {
  start: LocationJson;
  end: LocationJson;
}

export interface DiagnosticJson {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  range: RangeJson;
  hints: string[];
  related: { message: string; range: RangeJson }[];
}

export interface ModelJson {
  format: typeof MODEL_JSON_FORMAT;
  version: typeof MODEL_JSON_VERSION;
  language: string | null;
  ok: boolean;
  imports: ImportJson[];
  diagrams: FlowDiagramJson[];
  themes: ThemeJson[];
  models: ArchitectureModelJson[];
  stories: StoryJson[];
  exports: ExportJson[];
  diagnostics: DiagnosticJson[];
}

export interface ExportJson {
  id: string;
  /** The diagram or story after `for`, as written. */
  target: string;
  targetKind: "diagram" | "story" | null;
  format: string | null;
  size: { width: number; height: number } | null;
  scale: number | null;
  background: string | null;
  atMs: number | null;
  motion: string | null;
  theme: string | null;
  fonts: string | null;
  scenario: string | null;
  link: string | null;
  fps: number | null;
  durationMs: number | null;
  file: string | null;
  autoplay: boolean;
  loop: boolean;
  embed: boolean;
  range: RangeJson;
}

export interface StoryJson {
  id: string;
  target: string;
  title: string | null;
  description: string | null;
  durationMs: number;
  scenes: StorySceneJson[];
  range: RangeJson;
}

export interface StorySceneJson {
  id: string;
  title: string | null;
  view: string;
  transition: { kind: string; startMs: number; durationMs: number } | null;
  startMs: number;
  durationMs: number;
  actions: StoryActionJson[];
  range: RangeJson;
}

export interface StoryActionJson {
  kind: string;
  targets: string[];
  all: boolean;
  startMs: number;
  durationMs: number;
  children: StoryActionJson[];
  range: RangeJson;
}

export interface ArchitectureModelJson {
  id: string;
  range: RangeJson;
  entities: {
    path: string;
    id: string;
    kind: string;
    label: string;
    description: string | null;
    technology: string | null;
    external: boolean;
    url: string | null;
    parent: string | null;
    range: RangeJson;
    idRange: RangeJson;
  }[];
  relations: {
    key: string;
    id: string | null;
    from: string;
    to: string;
    label: string | null;
    technology: string | null;
    description: string | null;
    range: RangeJson;
  }[];
}

export interface C4Json {
  model: string;
  level: string;
  scope: string | null;
  includes: string[] | null;
  excludes: string[];
  labels: { target: string; targetKind: string; text: string; range: RangeJson }[];
  combined: string[];
}

export interface ImportJson {
  form: "namespace" | "members";
  path: string | null;
  bindings: { name: string; member: string | null }[];
  range: RangeJson;
}

export interface ThemeJson {
  id: string;
  extends: string | null;
  tokens: Record<string, string | number>;
  classes: ClassJson[];
  rules: RuleJson[];
  range: RangeJson;
}

export interface ClassJson {
  id: string;
  properties: Record<string, string | number>;
  range: RangeJson;
}

export interface RuleJson {
  kind: string;
  properties: Record<string, string | number>;
  range: RangeJson;
}

export interface FlowDiagramJson {
  id: string;
  type: "flow" | "free" | "sequence" | "c4";
  /** Diagrams of a type declared by a plugin: the type and the plugin. */
  declaredType?: { type: string; plugin: { name: string; version: string } | null };
  range: RangeJson;
  properties: {
    direction: string;
    layout: string;
    theme: string | null;
    title: string | null;
    description: string | null;
    preset: string | null;
    canvas: { width: number; height: number } | null;
    routing: string;
    layers: string[];
    autonumber: number | null;
    spacing: number | null;
  };
  classes: ClassJson[];
  rules: RuleJson[];
  elements: ElementJson[];
  relations: RelationJson[];
  placement: PlacementJson[];
  constraints: ConstraintJson[];
  styles: StyleJson[];
  animations: AnimationJson[];
  /** Sequence diagrams: the ordered tree of events; empty otherwise. */
  events: EventJson[];
  scenarios: ScenarioJson[];
  /** C4 views: the model, level, scope, lists, local labels and combinations; null otherwise. */
  c4: C4Json | null;
}

export type EventJson =
  | { kind: "message"; key: string; relation: string; events: EventJson[]; range: RangeJson }
  | {
      kind: "activate" | "deactivate" | "create" | "destroy";
      key: string;
      participant: string;
      range: RangeJson;
    }
  | {
      kind: "note";
      key: string;
      id: string | null;
      position: string;
      participants: string[];
      text: string;
      range: RangeJson;
    }
  | {
      kind: "fragment";
      key: string;
      id: string | null;
      operator: string;
      branches: { condition: string | null; events: EventJson[]; range: RangeJson }[];
      range: RangeJson;
    }
  | { kind: "divider"; key: string; label: string; range: RangeJson }
  | { kind: "delay"; key: string; label: string | null; range: RangeJson };

export interface ScenarioJson {
  id: string;
  label: string;
  choices: {
    kind: string;
    fragment: string;
    branch: number | null;
    iterations: number | null;
    range: RangeJson;
  }[];
  range: RangeJson;
}

/** A sequence tag: its text and the range of its `tag` statement. */
export interface TagJson {
  text: string;
  range: RangeJson;
}

export interface ElementJson {
  id: string;
  kind: string;
  /** Declared types: the kind there, and the values of its properties. */
  typeKind?: string;
  data?: Record<string, string | number | boolean>;
  label: string;
  implicit: boolean;
  description: string | null;
  url: string | null;
  classes: string[];
  /** Sequence participants: their `tag "Text"` statements in source order; empty elsewhere. */
  tags: TagJson[];
  ports: { name: string; side: string; position: number }[];
  layer: string | null;
  link: {
    binding: string | null;
    diagram: string;
    element: string;
    target: "diagram" | "model" | null;
  } | null;
  source: string | null;
  /** The shape the declaration implies, such as `cylinder` for `id[("…")]`; styles keep theirs. */
  shape: string | null;
  /** Free `line` objects: their points as written; null on every other kind. */
  line: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    via: { x: number; y: number }[];
  } | null;
  /** `pen` strokes: their points as written; null on every other kind. */
  pen: { points: { x: number; y: number }[] } | null;
  /**
   * List groups (`layout column|row` in a free group block): the layout, and the `spacing` and
   * `align` written (null when not); null on other groups and on elements.
   */
  list: { layout: string; spacing: number | null; align: string | null } | null;
  /** Notes: the id of the element (the entity path in a C4 view) the note is attached to. */
  attachedTo: string | null;
  entity: { model: string; path: string; file: string | null } | null;
  technology: string | null;
  external: boolean;
  groupPath: string[];
  range: RangeJson;
  idRange: RangeJson;
}

export interface ConstraintJson {
  kind: string;
  targets: string[];
  edge: string | null;
  axis: string | null;
  distance: number | null;
  range: RangeJson;
}

export interface RelationJson {
  key: string;
  id: string | null;
  from: string;
  to: string;
  line: string;
  twoWay: boolean;
  /** Where the written token puts heads: `end`, `both` or `none`. */
  heads: "end" | "both" | "none";
  async: boolean;
  returns: string | null;
  technology: string | null;
  sources: string[];
  derived: boolean;
  label: string | null;
  description: string | null;
  assumption: string | null;
  data?: Record<string, string | number | boolean>;
  classes: string[];
  /** Sequence messages: their `tag "Text"` statements in source order; empty elsewhere. */
  tags: TagJson[];
  layer: string | null;
  groupPath: string[];
  range: RangeJson;
  idRange: RangeJson | null;
}

export type PlacementJson =
  | {
      statement: "place";
      target: string;
      x: number;
      y: number;
      range: RangeJson;
      targetRange: RangeJson;
    }
  | {
      statement: "size";
      target: string;
      width: number;
      height: number;
      range: RangeJson;
      targetRange: RangeJson;
    }
  | {
      statement: "route";
      target: string;
      from: EndpointJson;
      to: EndpointJson;
      via: { x: number; y: number }[];
      range: RangeJson;
      targetRange: RangeJson;
    }
  | {
      statement: "label";
      target: string;
      at: number;
      offset: { x: number; y: number };
      range: RangeJson;
      targetRange: RangeJson;
    }
  | {
      statement: "space" | "gap";
      target: string;
      amount: number;
      side: "before" | "after";
      range: RangeJson;
      targetRange: RangeJson;
    };

export interface StyleJson {
  target: string;
  targetKind: string;
  properties: Record<string, string | number>;
  classes: string[];
  range: RangeJson;
  targetRange: RangeJson;
}

export interface AnimationJson {
  target: string;
  targetKind: string;
  effect: string | null;
  durationMs: number | null;
  repeat: number | "forever" | null;
  delayMs: number | null;
  direction: string | null;
  particles: number | null;
  color: string | null;
  range: RangeJson;
  targetRange: RangeJson;
}

/**
 * JSON interchange of a compilation (format `model-json` 0.1). Diagrams with errors are left out;
 * their problems are in `diagnostics`. Keys are emitted in a fixed order so output is stable.
 */
export function toJson(compilation: Compilation): ModelJson {
  return {
    format: MODEL_JSON_FORMAT,
    version: MODEL_JSON_VERSION,
    language: compilation.document.language,
    ok: compilation.ok,
    imports: compilation.document.imports.map(importJson),
    diagrams: compilation.document.diagrams.filter((d) => !d.hasErrors).map(diagramJson),
    themes: compilation.document.themes.map(themeJson),
    models: compilation.document.models.map(modelJson),
    stories: compilation.document.stories.map(storyJson),
    exports: compilation.document.exports.map(exportJson),
    diagnostics: diagnosticsToJson(compilation.diagnostics),
  };
}

function storyActionJson(action: StoryAction): StoryActionJson {
  return {
    kind: action.kind,
    targets: action.targets.map((t) => t.id),
    all: action.all,
    startMs: action.startMs,
    durationMs: action.durationMs,
    children: action.children.map(storyActionJson),
    range: rangeJson(action.range),
  };
}

function exportJson(profile: ExportProfile): ExportJson {
  return {
    id: profile.id,
    target: profile.target.name,
    targetKind: profile.target.kind,
    format: profile.format,
    size: profile.size ? { ...profile.size } : null,
    scale: profile.scale,
    background: profile.background,
    atMs: profile.atMs,
    motion: profile.motion,
    theme: profile.theme,
    fonts: profile.fonts,
    scenario: profile.scenario,
    link: profile.link,
    fps: profile.fps,
    durationMs: profile.durationMs,
    file: profile.file,
    autoplay: profile.autoplay,
    loop: profile.loop,
    embed: profile.embed,
    range: rangeJson(profile.range),
  };
}

function storyJson(story: StoryDefinition): StoryJson {
  return {
    id: story.id,
    target: story.target.name,
    title: story.title,
    description: story.description,
    durationMs: story.durationMs,
    scenes: story.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      view: scene.view.name,
      transition: scene.transition
        ? {
            kind: scene.transition.kind,
            startMs: scene.transition.startMs,
            durationMs: scene.transition.durationMs,
          }
        : null,
      startMs: scene.startMs,
      durationMs: scene.durationMs,
      actions: scene.actions.map(storyActionJson),
      range: rangeJson(scene.range),
    })),
    range: rangeJson(story.range),
  };
}

export function diagnosticsToJson(diagnostics: readonly Diagnostic[]): DiagnosticJson[] {
  return diagnostics.map((d) => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    range: rangeJson(d.range),
    hints: [...(d.hints ?? [])],
    related: (d.related ?? []).map((r) => ({ message: r.message, range: rangeJson(r.range) })),
  }));
}

/** Serialises interchange JSON with two-space indentation and a final line break. */
export function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function importJson(declaration: ImportDeclaration): ImportJson {
  return {
    form: declaration.form,
    path: declaration.path,
    bindings: declaration.bindings.map((b) => ({ name: b.name, member: b.member })),
    range: rangeJson(declaration.range),
  };
}

function themeJson(theme: ThemeDefinition): ThemeJson {
  return {
    id: theme.id,
    extends: theme.extends,
    tokens: sortedProperties(theme.tokens),
    classes: theme.classes.map(classJson),
    rules: theme.rules.map(ruleJson),
    range: rangeJson(theme.range),
  };
}

function sortedProperties(properties: StyleProperties): Record<string, string | number> {
  const sorted: Record<string, string | number> = {};
  for (const name of Object.keys(properties).sort()) sorted[name] = properties[name]!;
  return sorted;
}

function classJson(definition: ClassDefinition): ClassJson {
  return {
    id: definition.id,
    properties: sortedProperties(definition.properties),
    range: rangeJson(definition.range),
  };
}

function ruleJson(rule: RuleEntry): RuleJson {
  return {
    kind: rule.kind,
    properties: sortedProperties(rule.properties),
    range: rangeJson(rule.range),
  };
}

function locationJson(location: Location): LocationJson {
  return { offset: location.offset, line: location.line, column: location.column };
}

function rangeJson(range: Range): RangeJson {
  return { start: locationJson(range.start), end: locationJson(range.end) };
}

function pointJson(point: Point): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

/** A route end: its element and port, and the percentage of the side it is pinned to. */
export interface EndpointJson {
  element: string;
  port: string;
  position?: number;
}

function endpointJson(endpoint: RouteEndpoint): EndpointJson {
  return endpoint.position === undefined
    ? { element: endpoint.element, port: endpoint.port }
    : {
        element: endpoint.element,
        port: endpoint.port,
        position: Math.round(endpoint.position * 1000) / 10,
      };
}

function diagramJson(diagram: FlowDiagram): FlowDiagramJson {
  return {
    id: diagram.id,
    type: diagram.type,
    ...(diagram.definition
      ? {
          declaredType: {
            type: diagram.definition.type,
            plugin: diagram.definition.plugin,
          },
        }
      : {}),
    range: rangeJson(diagram.range),
    properties: {
      direction: diagram.properties.direction,
      layout: diagram.properties.layout,
      theme: diagram.properties.theme,
      title: diagram.properties.title,
      description: diagram.properties.description,
      preset: diagram.properties.preset,
      canvas: diagram.properties.canvas
        ? { width: diagram.properties.canvas.width, height: diagram.properties.canvas.height }
        : null,
      routing: diagram.properties.routing,
      layers: [...diagram.properties.layers],
      autonumber: diagram.properties.autonumber,
      spacing: diagram.properties.spacing,
    },
    classes: diagram.classes.map(classJson),
    rules: diagram.rules.map(ruleJson),
    elements: diagram.elements.map(elementJson),
    relations: diagram.relations.map(relationJson),
    placement: diagram.placement.map(placementJson),
    constraints: diagram.constraints.map(constraintJson),
    styles: diagram.styles.map(styleJson),
    animations: diagram.animations.map(animationJson),
    events: diagram.events.map(eventJson),
    scenarios: diagram.scenarios.map(scenarioJson),
    c4: diagram.c4
      ? {
          model: diagram.c4.model,
          level: diagram.c4.level,
          scope: diagram.c4.scope,
          includes: diagram.c4.includes ? diagram.c4.includes.map((e) => e.path) : null,
          excludes: diagram.c4.excludes.map((e) => e.path),
          labels: diagram.c4.labels.map((l) => ({
            target: l.target,
            targetKind: l.targetKind,
            text: l.text,
            range: rangeJson(l.range),
          })),
          combined: [...diagram.c4.combined],
        }
      : null,
  };
}

function modelJson(model: ModelDefinition): ArchitectureModelJson {
  return {
    id: model.id,
    range: rangeJson(model.range),
    entities: model.entities.map((e) => ({
      path: e.path,
      id: e.id,
      kind: e.kind,
      label: e.label,
      description: e.description,
      technology: e.technology,
      external: e.external,
      url: e.url,
      parent: e.parent,
      range: rangeJson(e.range),
      idRange: rangeJson(e.idRange),
    })),
    relations: model.relations.map((r) => ({
      key: r.key,
      id: r.id,
      from: r.from,
      to: r.to,
      label: r.label,
      technology: r.technology,
      description: r.description,
      assumption: r.assumption,
      range: rangeJson(r.range),
    })),
  };
}

function eventJson(event: SequenceEvent): EventJson {
  const range = rangeJson(event.range);
  switch (event.kind) {
    case "message":
      return {
        kind: "message",
        key: event.key,
        relation: event.relation,
        events: event.events.map(eventJson),
        range,
      };
    case "activate":
    case "deactivate":
    case "create":
    case "destroy":
      return { kind: event.kind, key: event.key, participant: event.participant, range };
    case "note":
      return {
        kind: "note",
        key: event.key,
        id: event.id,
        position: event.position,
        participants: [...event.participants],
        text: event.text,
        range,
      };
    case "fragment":
      return {
        kind: "fragment",
        key: event.key,
        id: event.id,
        operator: event.operator,
        branches: event.branches.map((branch) => ({
          condition: branch.condition,
          events: branch.events.map(eventJson),
          range: rangeJson(branch.range),
        })),
        range,
      };
    case "divider":
      return { kind: "divider", key: event.key, label: event.label, range };
    case "delay":
      return { kind: "delay", key: event.key, label: event.label, range };
  }
}

function scenarioJson(scenario: SequenceScenario): ScenarioJson {
  return {
    id: scenario.id,
    label: scenario.label,
    choices: scenario.choices.map((choice) => ({
      kind: choice.kind,
      fragment: choice.fragment,
      branch: choice.branch,
      iterations: choice.iterations,
      range: rangeJson(choice.range),
    })),
    range: rangeJson(scenario.range),
  };
}

function elementJson(element: Element): ElementJson {
  return {
    id: element.id,
    kind: element.kind,
    ...(element.typeKind !== null ? { typeKind: element.typeKind, data: { ...element.data } } : {}),
    label: element.label,
    implicit: element.implicit,
    description: element.description,
    url: element.url,
    classes: element.classes.map((c) => c.name),
    tags: element.tags.map(tagJson),
    ports: element.ports.map((p) => ({ name: p.name, side: p.side, position: p.position })),
    layer: element.layer,
    link: element.link
      ? {
          binding: element.link.binding,
          diagram: element.link.diagram,
          element: element.link.element,
          target: element.link.target,
        }
      : null,
    source: element.source,
    shape: element.shape,
    line: element.line
      ? {
          from: { x: element.line.from.x, y: element.line.from.y },
          to: { x: element.line.to.x, y: element.line.to.y },
          via: element.line.via.map((p) => ({ x: p.x, y: p.y })),
        }
      : null,
    pen: element.pen ? { points: element.pen.points.map((p) => ({ x: p.x, y: p.y })) } : null,
    list: element.list
      ? { layout: element.list.layout, spacing: element.list.spacing, align: element.list.align }
      : null,
    attachedTo: element.attachedTo,
    entity: element.entity
      ? { model: element.entity.model, path: element.entity.path, file: element.entity.file }
      : null,
    technology: element.technology,
    external: element.external,
    groupPath: [...element.groupPath],
    range: rangeJson(element.range),
    idRange: rangeJson(element.idRange),
  };
}

function tagJson(tag: TagUse): TagJson {
  return { text: tag.text, range: rangeJson(tag.range) };
}

function relationJson(relation: Relation): RelationJson {
  return {
    key: relation.key,
    id: relation.id,
    from: relation.from,
    to: relation.to,
    line: relation.line,
    twoWay: relation.twoWay,
    heads: relation.heads,
    async: relation.async,
    returns: relation.returns,
    technology: relation.technology,
    sources: [...relation.sources],
    derived: relation.derived,
    label: relation.label,
    description: relation.description,
    assumption: relation.assumption,
    ...(Object.keys(relation.data).length > 0 ? { data: { ...relation.data } } : {}),
    classes: relation.classes.map((c) => c.name),
    tags: relation.tags.map(tagJson),
    layer: relation.layer,
    groupPath: [...relation.groupPath],
    range: rangeJson(relation.range),
    idRange: relation.idRange ? rangeJson(relation.idRange) : null,
  };
}

function placementJson(entry: PlacementEntry): PlacementJson {
  const range = rangeJson(entry.range);
  const targetRange = rangeJson(entry.targetRange);
  switch (entry.statement) {
    case "place":
      return {
        statement: "place",
        target: entry.target,
        x: entry.x,
        y: entry.y,
        range,
        targetRange,
      };
    case "size":
      return {
        statement: "size",
        target: entry.target,
        width: entry.width,
        height: entry.height,
        range,
        targetRange,
      };
    case "route":
      return {
        statement: "route",
        target: entry.target,
        from: endpointJson(entry.from),
        to: endpointJson(entry.to),
        via: entry.via.map(pointJson),
        range,
        targetRange,
      };
    case "label":
      return {
        statement: "label",
        target: entry.target,
        at: entry.at,
        offset: pointJson(entry.offset),
        range,
        targetRange,
      };
    case "space":
    case "gap":
      return {
        statement: entry.statement,
        target: entry.target,
        amount: entry.amount,
        side: entry.side,
        range,
        targetRange,
      };
  }
}

function constraintJson(entry: ConstraintEntry): ConstraintJson {
  return {
    kind: entry.kind,
    targets: [...entry.targets],
    edge: entry.edge,
    axis: entry.axis,
    distance: entry.distance,
    range: rangeJson(entry.range),
  };
}

function styleJson(entry: StyleEntry): StyleJson {
  return {
    target: entry.target,
    targetKind: entry.targetKind,
    properties: sortedProperties(entry.properties),
    classes: entry.classes.map((c) => c.name),
    range: rangeJson(entry.range),
    targetRange: rangeJson(entry.targetRange),
  };
}

function animationJson(entry: AnimationEntry): AnimationJson {
  return {
    target: entry.target,
    targetKind: entry.targetKind,
    effect: entry.effect,
    durationMs: entry.durationMs,
    repeat: entry.repeat,
    delayMs: entry.delayMs,
    direction: entry.direction,
    particles: entry.particles,
    color: entry.color,
    range: rangeJson(entry.range),
    targetRange: rangeJson(entry.targetRange),
  };
}
