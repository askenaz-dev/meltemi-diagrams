import { drawableNames, searchIcons } from "@meltemi/diagrams-assets";
import {
  ALIGN_EDGES,
  ANIMATION_DIRECTIONS,
  ANIMATION_EFFECT_PROPERTIES,
  ANIMATION_EFFECTS,
  AXES,
  BUILT_IN_CLASSES,
  BUILT_IN_THEMES,
  CONSTRAINTS,
  C4_LEVELS,
  C4_PROFILE,
  DIAGRAM_TYPES,
  ENTITY_CHILDREN,
  FLOW_PROFILE,
  VIEW_STATEMENTS,
  allowedEntities,
  FRAGMENT_BRANCH_KEYWORDS,
  FREE_PROFILE,
  MESSAGE_KINDS,
  PORTS,
  SCENARIO_STATEMENTS,
  SEQUENCE_PROFILE,
  PORT_SIDES,
  RELATION_ONLY_PROPERTIES,
  STYLE_PROPERTIES,
  THEME_COLOR_TOKENS,
  THEME_TOKENS,
  isFreeStyleProperty,
  profileTakesRotation,
  profileTakesShape,
  type AnimationEffect,
  type FlowDiagram,
  type FragmentEvent,
  type FragmentOperator,
  type ModelDefinition,
  type ProfileSchema,
  declaredProfile,
} from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { kindWord, serviceMessages } from "../messages/services.js";
import { keywordDoc } from "./docs.js";
import { blockAt, diagramAt, scopeAt, statementPrefix, wordBefore } from "../syntax.js";
import { profileCompletions, profileHeaderCompletions } from "./profiles.js";
import { storyCompletions, storyHeaderCompletions } from "./stories.js";

export type CompletionKind =
  | "keyword"
  | "element"
  | "group"
  | "relation"
  | "port"
  | "value"
  | "property"
  | "theme"
  | "class"
  | "icon"
  | "snippet";

export interface CompletionItem {
  readonly label: string;
  readonly kind: CompletionKind;
  readonly detail?: string;
  /** Text to insert; `label` by default. Snippets use `${1:placeholder}` syntax. */
  readonly insertText?: string;
  readonly snippet?: boolean;
  /** Offsets of the text the item replaces. */
  readonly range: { readonly start: number; readonly end: number };
}

const ID = "[A-Za-z_][A-Za-z0-9_]*";
const match = (prefix: string, pattern: string) => new RegExp(`^${pattern}$`).exec(prefix);

const TOP_LEVEL = ["language", "import", "diagram", "theme", "model", "story", "export"];
const PLACEMENT_STATEMENTS = ["place", "size", "route", "label", ...CONSTRAINTS];

/** The profile of a diagram, flow when it is unknown; a declared type's own (decision 0030). */
function profileOf(diagram: FlowDiagram | undefined): ProfileSchema {
  if (diagram?.definition) return declaredProfile(diagram.definition);
  return diagram?.type === "free"
    ? FREE_PROFILE
    : diagram?.type === "sequence"
      ? SEQUENCE_PROFILE
      : diagram?.type === "c4"
        ? C4_PROFILE
        : FLOW_PROFILE;
}

/** The model whose block contains `offset`. */
function modelAt(analysis: DocumentAnalysis, offset: number): ModelDefinition | undefined {
  return analysis.compilation.document.models.find(
    (m) => m.node.start <= offset && offset <= m.node.end,
  );
}

/** Entity paths of a model as completion items. */
function entityItems(
  model: ModelDefinition | undefined,
  range: CompletionItem["range"],
  filter: (path: string) => boolean = () => true,
): CompletionItem[] {
  return (model?.entities ?? [])
    .filter((e) => filter(e.path))
    .map((e) => ({
      label: e.path,
      kind: "element" as const,
      detail: `${kindWord(e.kind)} · ${e.label}`,
      range,
    }));
}

/** The models a view can use: those of the file and the imported names. */
function modelNames(analysis: DocumentAnalysis): string[] {
  const names = analysis.compilation.document.models.map((m) => m.id);
  for (const declaration of analysis.compilation.document.imports) {
    for (const binding of declaration.bindings) {
      names.push(declaration.form === "namespace" ? `${binding.name}.` : binding.name);
    }
  }
  return names;
}

/** The entity whose block holds `offset` in a model. */
function entityBlockAt(analysis: DocumentAnalysis, offset: number) {
  const model = modelAt(analysis, offset);
  if (!model) return undefined;
  let found: (typeof model.entities)[number] | undefined;
  for (const entity of model.entities) {
    const block = entity.node.block;
    if (block && block.open.end <= offset && offset <= block.end) {
      if (!found || entity.path.length > found.path.length) found = entity;
    }
  }
  return found ? { model, entity: found } : undefined;
}

/** Completion inside a `model` block or one of its entities. */
function modelCompletions(
  analysis: DocumentAnalysis,
  scope: "model" | "entity",
  prefix: string,
  range: CompletionItem["range"],
  offset: number,
): CompletionItem[] {
  const model = modelAt(analysis, offset);
  if (match(prefix, `[\\w.]+\\s*->\\s*[\\w.]*`)) return entityItems(model, range);
  if (prefix !== "" && !match(prefix, `[\\w.]*`)) return [];
  if (scope === "model") {
    return [...words(ENTITY_CHILDREN.model!, "keyword", range), ...entityItems(model, range)];
  }
  const at = entityBlockAt(analysis, offset);
  const kind = at?.entity.kind ?? "system";
  const properties = [
    "description",
    "technology",
    ...(kind === "person" || kind === "system" ? ["external"] : []),
  ];
  return [
    ...words(ENTITY_CHILDREN[kind] ?? [], "keyword", range),
    ...words(properties, "property", range),
    ...entityItems(model, range),
  ];
}

/** Completion in the body of a C4 view. */
function viewCompletions(
  diagram: FlowDiagram,
  prefix: string,
  range: CompletionItem["range"],
): CompletionItem[] | undefined {
  const c4 = diagram.c4;
  const model = c4?.resolved?.definition;
  if (!c4) return undefined;
  if (match(prefix, `level\\s+\\w*`)) return words(C4_LEVELS, "value", range);
  if (match(prefix, `scope\\s+[\\w.]*`)) {
    const kind = c4.level === "component" ? "container" : "system";
    return entityItems(model, range, (p) => model!.entitiesByPath.get(p)!.kind === kind);
  }
  const list = /^(include|exclude)\s+((?:[\w.]+\s*,\s*)*)[\w.]*$/.exec(prefix);
  if (list) {
    const listed = new Set(
      list[2]!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
    );
    if (list[1] === "exclude") {
      return entityItems(model, range, (p) => diagram.elementsById.has(p) && !listed.has(p));
    }
    const allowed = model ? allowedEntities(model, c4.level, c4.scope) : new Set<string>();
    return entityItems(model, range, (p) => allowed.has(p) && !listed.has(p));
  }
  if (match(prefix, `label\\s+[\\w.]*`)) {
    return [
      ...elementItems(diagram, range).filter((i) => i.kind === "element"),
      ...relationItems(diagram, range),
    ];
  }
  if (match(prefix, `[\\w.]+\\s*->\\s*[\\w.]*`)) {
    return elementItems(diagram, range).filter((i) => i.kind === "element");
  }
  if (match(prefix, `(style|animate)\\s+([\\w.]+\\s*,\\s*)*[\\w.]*`)) {
    return [...elementItems(diagram, range), ...relationItems(diagram, range)];
  }
  if (prefix === "" || match(prefix, ID)) {
    return [
      ...words(["level", "scope", ...VIEW_STATEMENTS], "keyword", range),
      ...words(
        Object.keys(C4_PROFILE.diagramProperties).filter((p) => p !== "level" && p !== "scope"),
        "keyword",
        range,
      ),
      ...words(C4_PROFILE.diagramBlocks, "keyword", range),
      ...elementItems(diagram, range).filter((i) => i.kind === "element"),
    ];
  }
  return undefined;
}

/** Statements that start a line in a diagram body or a group of a profile. */
function bodyStatements(profile: ProfileSchema, group: boolean): string[] {
  if (group) {
    // Participant groups hold participants, not further groups' events.
    return [...profile.elementKinds, ...Object.keys(profile.groupProperties)];
  }
  return [
    ...profile.elementKinds,
    ...profile.events,
    ...Object.keys(profile.diagramProperties),
    ...profile.diagramBlocks,
  ];
}

/** The participants of a sequence diagram, without their groups. */
function participantItems(
  diagram: FlowDiagram | undefined,
  range: CompletionItem["range"],
): CompletionItem[] {
  return elementItems(diagram, range).filter((i) => i.kind === "element");
}

/** The named fragments of a sequence diagram with one of the operators. */
function fragmentsOf(
  diagram: FlowDiagram | undefined,
  operators: readonly FragmentOperator[],
): FragmentEvent[] {
  return [...(diagram?.eventsByKey.values() ?? [])].filter(
    (e): e is FragmentEvent =>
      e.kind === "fragment" && e.id !== null && operators.includes(e.operator),
  );
}

function fragmentItems(
  diagram: FlowDiagram | undefined,
  operators: readonly FragmentOperator[],
  range: CompletionItem["range"],
): CompletionItem[] {
  return fragmentsOf(diagram, operators).map((f) => ({
    label: f.id!,
    kind: "element",
    detail: [f.operator, ...f.branches.map((b) => (b.condition ? `“${b.condition}”` : ""))]
      .filter((s) => s !== "")
      .join(" · "),
    range,
  }));
}

/** Messages, notes and fragments with ids, which `space` and `style` can name. */
function namedEventItems(
  diagram: FlowDiagram | undefined,
  range: CompletionItem["range"],
  messages: boolean,
): CompletionItem[] {
  return [...(diagram?.eventsByKey.values() ?? [])]
    .filter((e) => e.id !== null && (messages || e.kind !== "message"))
    .map((e) => ({
      label: e.id!,
      kind: e.kind === "message" ? ("relation" as const) : ("element" as const),
      detail:
        e.kind === "fragment"
          ? serviceMessages().completion.fragment(e.operator)
          : kindWord(e.kind),
      range,
    }));
}

const NOTE_POSITIONS = ["over", "left", "right"];

/** Completion inside the body or a fragment branch of a sequence diagram, if the prefix is one. */
function sequenceBody(
  diagram: FlowDiagram | undefined,
  prefix: string,
  range: CompletionItem["range"],
  offset: number,
): CompletionItem[] | undefined {
  // `} else`, `} and`, `} option` after the branch of a fragment.
  if (match(prefix, `\\}\\s*\\w*`)) {
    const closed = [...(diagram?.eventsByKey.values() ?? [])]
      .filter((e): e is FragmentEvent => e.kind === "fragment" && e.node.end <= offset)
      .sort((a, b) => b.node.end - a.node.end)[0];
    const keyword = closed ? FRAGMENT_BRANCH_KEYWORDS[closed.operator] : undefined;
    return keyword ? words([keyword], "keyword", range) : [];
  }
  if (match(prefix, `(activate|deactivate|create|destroy)\\s+\\w*`)) {
    return participantItems(diagram, range);
  }
  const note = /^note\s+(.*)$/.exec(prefix);
  if (note) {
    if (note[1]!.includes('"')) return [];
    const parts = note[1]!.split(/\s+/);
    // An id may come first.
    const at = parts.length > 1 && !NOTE_POSITIONS.includes(parts[0]!) ? 1 : 0;
    const position = parts[at];
    if (parts.length - 1 === at) return words(NOTE_POSITIONS, "keyword", range);
    if (position === "over") return participantItems(diagram, range);
    if (position === "left" || position === "right") {
      if (parts.length - 1 === at + 1) return words(["of"], "keyword", range);
      return parts[at + 1] === "of" && parts.length - 1 === at + 2
        ? participantItems(diagram, range)
        : [];
    }
    return [];
  }
  if (match(prefix, `(style|animate)\\s+(${ID}\\s*,\\s*)*\\w*`)) {
    return [
      ...elementItems(diagram, range),
      ...relationItems(diagram, range),
      ...namedEventItems(diagram, range, false),
    ];
  }
  return undefined;
}

/**
 * `<diagram>.<element>` targets of links: the elements of the file's other diagrams, and
 * `<model>.<entity>` paths of the file's models.
 */
function linkTargets(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram | undefined,
  range: CompletionItem["range"],
): CompletionItem[] {
  const entities = analysis.compilation.document.models.flatMap((m) =>
    m.entities.map((e) => ({
      label: `${m.id}.${e.path}`,
      kind: "element" as const,
      detail: `${kindWord(e.kind)} · ${e.label}`,
      range,
    })),
  );
  return [
    ...analysis.compilation.document.diagrams
      .filter((d) => d !== diagram && d.type !== "c4")
      .flatMap((d) =>
        d.elements.map((e) => ({
          label: `${d.id}.${e.id}`,
          kind: "element" as const,
          detail: `${kindWord(e.kind)} · ${e.label}`,
          range,
        })),
      ),
    ...entities,
  ];
}

/** The diagram's element ids, with the kind as detail. */
function elementItems(
  diagram: FlowDiagram | undefined,
  range: CompletionItem["range"],
): CompletionItem[] {
  return (diagram?.elements ?? []).map((e) => ({
    label: e.id,
    kind: e.kind === "group" ? "group" : "element",
    detail: `${kindWord(e.kind)} · ${e.label}`,
    range,
  }));
}

function relationItems(
  diagram: FlowDiagram | undefined,
  range: CompletionItem["range"],
): CompletionItem[] {
  return (diagram?.relations ?? [])
    .filter((r) => r.id !== null)
    .map((r) => ({ label: r.id!, kind: "relation", detail: `${r.from} -> ${r.to}`, range }));
}

function words(
  values: readonly string[],
  kind: CompletionKind,
  range: CompletionItem["range"],
  detail?: (word: string) => string | undefined,
): CompletionItem[] {
  return values.map((label) => {
    const text = detail?.(label) ?? keywordDoc(label);
    return text ? { label, kind, detail: text, range } : { label, kind, range };
  });
}

/** Class names in scope: built-in, the diagram's and those of the themes in scope. */
function classNames(analysis: DocumentAnalysis, diagram: FlowDiagram | undefined): string[] {
  // The C4 classes are offered in C4 views only.
  const names = new Set<string>(
    Object.keys(BUILT_IN_CLASSES).filter((c) => !c.startsWith("c4_") || diagram?.type === "c4"),
  );
  for (const theme of analysis.themes) for (const c of theme.classes) names.add(c.id);
  for (const c of diagram?.classes ?? []) names.add(c.id);
  return [...names].sort();
}

/** Themes in scope: built-in themes and the themes of the document and its imports. */
function themeNames(analysis: DocumentAnalysis): string[] {
  const names = new Set<string>(BUILT_IN_THEMES);
  for (const theme of analysis.themes) if (!theme.id.includes("#")) names.add(theme.id);
  return [...names].sort();
}

/** Values a style property takes. */
function styleValues(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram | undefined,
  property: string,
): string[] {
  const spec = STYLE_PROPERTIES[property];
  if (property === "class") return classNames(analysis, diagram);
  if (!spec) return [];
  if (spec.kind === "enum") return [...spec.values];
  if (spec.kind === "color") return [...THEME_COLOR_TOKENS];
  if (spec.kind === "number" && spec.values) return spec.values.map(String);
  // `iconSize auto`; numbers are typed.
  if (spec.kind === "keywordOrNumber") return [...spec.keywords];
  return [];
}

/** The start of a dotted reference being typed before `offset`. */
function linkStart(text: string, offset: number): number {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_.]/.test(text[start - 1]!)) start--;
  return start;
}

/**
 * Completion items valid at `offset`, from the block around the cursor and the text of the
 * statement before it.
 */
export function completions(analysis: DocumentAnalysis, offset: number): CompletionItem[] {
  const text = analysis.text;
  const root = analysis.compilation.parse.root;
  const written = scopeAt(root, offset);
  // A diagram of a declared type completes as the free profile it compiles on.
  const scope =
    written === "other" && diagramAt(analysis.compilation, offset)?.definition ? "free" : written;
  const diagram = diagramAt(analysis.compilation, offset);
  const prefix = statementPrefix(text, offset);
  const { start } = wordBefore(text, offset);
  // Entity paths are dotted: their whole written part is replaced.
  const pathed = diagram?.type === "c4" || scope === "model" || scope === "entity";
  const range = { start: pathed ? linkStart(text, offset) : start, end: offset };

  // Inside quotes: themes and icons.
  const quoted = /"([^"\\]*)$/.exec(prefix);
  if (quoted) {
    const inner = { start: offset - quoted[1]!.length, end: offset };
    if (/^theme\s+"[^"]*$/.test(prefix) || /^extends\s+"[^"]*$/.test(prefix)) {
      return words(themeNames(analysis), "theme", inner);
    }
    const choose = /^choose\s+([A-Za-z_]\w*)\s+"[^"]*$/.exec(prefix);
    if (choose && scope === "scenario") {
      const fragment = fragmentsOf(diagram, ["alt", "critical"]).find((f) => f.id === choose[1]);
      return (fragment?.branches ?? []).flatMap((b, i) =>
        b.condition
          ? [
              {
                label: b.condition,
                kind: "value" as const,
                detail: serviceMessages().branch(i + 1),
                range: inner,
              },
            ]
          : [],
      );
    }
    if (/^image\s+[A-Za-z_]\w*\s+"[^"]*$/.test(prefix)) {
      const detail = serviceMessages().completion.imageFile;
      return words(analysis.imageFiles?.() ?? [], "value", inner, () => detail);
    }
    if (/^icon\s+([A-Za-z_]\w*\s+)?"[^"]*$/.test(prefix) && analysis.icons) {
      const typed = quoted[1]!;
      const colon = typed.indexOf(":");
      if (colon < 0) {
        return analysis.icons.list().map((pack) => ({
          label: `${pack.prefix}:`,
          kind: "icon",
          detail: pack.metadata.title,
          range: inner,
        }));
      }
      const query = typed.slice(colon + 1).replace(/-/g, " ") || typed.slice(0, colon);
      const pack = analysis.icons.pack(typed.slice(0, colon));
      const references = typed.slice(colon + 1)
        ? searchIcons(analysis.icons, query, 200)
        : (pack ? drawableNames(pack, 200) : []).map((n) => `${typed.slice(0, colon)}:${n}`);
      return references
        .filter((r) => r.startsWith(typed.slice(0, colon + 1)))
        .map((reference) => ({ label: reference, kind: "icon", range: inner }));
    }
    return [];
  }

  // A port after `<element>.`
  const dotted = new RegExp(`(${ID})\\.(${ID})?$`).exec(prefix);
  if (dotted && scope === "placement") {
    const element = diagram?.elementsById.get(dotted[1]!);
    if (!element) return [];
    const t = serviceMessages().completion;
    return [
      ...element.ports.map((p) => ({
        label: p.name,
        kind: "port" as const,
        detail: t.port(p.side, Math.round(p.position * 100)),
        range,
      })),
      ...words(PORTS, "port", range, () => t.compassPort),
    ];
  }

  switch (scope) {
    case "top": {
      const story = storyHeaderCompletions(analysis, prefix, offset);
      if (story) return story;
      const profile = profileHeaderCompletions(analysis, prefix, {
        start: linkStart(text, offset),
        end: offset,
      });
      if (profile) return profile;
      if (match(prefix, `diagram\\s+${ID}\\s*:\\s*\\w*`))
        return words(DIAGRAM_TYPES, "keyword", range);
      if (match(prefix, `diagram\\s+${ID}\\s*:\\s*c4\\s+\\w*`))
        return words(["using"], "keyword", range);
      if (match(prefix, `diagram\\s+${ID}\\s*:\\s*c4\\s+using\\s+[\\w.]*`)) {
        const detail = serviceMessages().completion.model;
        return words(
          modelNames(analysis),
          "value",
          { start: linkStart(text, offset), end: offset },
          () => detail,
        );
      }
      if (prefix === "" || match(prefix, ID)) {
        // The labels the snippets write follow the interface language; ids stay as they are.
        const label = serviceMessages().snippets;
        return [
          ...words(TOP_LEVEL, "keyword", range),
          {
            label: "diagram (flow)",
            kind: "snippet",
            snippet: true,
            insertText: "diagram ${1:id}: flow {\n  layout ${2|auto,assisted,manual|}\n  $0\n}",
            range,
          },
          {
            label: "model",
            kind: "snippet",
            snippet: true,
            insertText: `model \${1:id} {\n  person \${2:customer} "\${3:${label.customer}}"\n  system \${4:shop} "\${5:${label.shop}}" {\n    container \${6:api} "\${7:API}" { technology "\${8:HTTP}" }\n  }\n\n  \${2:customer} -> \${4:shop}.\${6:api}: "\${9:${label.uses}}"\n  $0\n}`,
            range,
          },
          {
            label: "diagram (c4)",
            kind: "snippet",
            snippet: true,
            insertText:
              "diagram ${1:id}: c4 using ${2:model} {\n  level ${3|context,container,component|}\n  $0\n}",
            range,
          },
          {
            label: "diagram (sequence)",
            kind: "snippet",
            snippet: true,
            insertText: `diagram \${1:id}: sequence {\n  participant \${2:a} "\${3:A}"\n  participant \${4:b} "\${5:B}"\n\n  \${2:a} -> \${4:b}: "\${6:${label.request}}"\n  \${4:b} --> \${2:a}: "\${7:${label.response}}"\n  $0\n}`,
            range,
          },
          {
            label: "story",
            kind: "snippet",
            snippet: true,
            insertText: `story \${1:id} for \${2:diagram} {\n  title "\${3:${label.title}}"\n\n  scene \${4:first} {\n    reveal \${5:element}\n    hold \${6:1s}\n  }\n  $0\n}`,
            range,
          },
          {
            label: "diagram (free)",
            kind: "snippet",
            snippet: true,
            insertText: `diagram \${1:id}: free {\n  canvas (\${2:1600}, \${3:900})\n\n  text \${4:heading} "\${5:${label.title}}"\n  $0\n\n  placement {\n    place \${4:heading} at (\${6:800}, \${7:90})\n  }\n}`,
            range,
          },
        ];
      }
      return [];
    }
    case "model":
    case "entity":
      return modelCompletions(analysis, scope, prefix, range, offset);
    case "c4":
      return diagram ? (viewCompletions(diagram, prefix, range) ?? []) : [];
    case "flow":
    case "free":
    case "sequence":
    case "fragment":
    case "group": {
      const profile = profileOf(diagram);
      if (diagram?.type === "sequence" && scope !== "group") {
        const items = sequenceBody(diagram, prefix, range, offset);
        if (items) return items;
        if (scope === "fragment") {
          if (match(prefix, `${ID}\\s*--?>\\s*\\w*`)) return participantItems(diagram, range);
          if (prefix === "" || match(prefix, ID)) {
            return [
              ...words(profile.events, "keyword", range),
              ...participantItems(diagram, range),
            ];
          }
          return [];
        }
      }
      const relation = match(prefix, `${ID}\\s*--?>\\s*\\w*`);
      if (relation) return elementItems(diagram, range);
      const property = match(prefix, `(direction|layout|routing|preset)\\s+\\w*`);
      if (property) {
        const spec = profile.diagramProperties[property[1]!];
        return spec?.kind === "enum" ? words(spec.values, "value", range) : [];
      }
      if (match(prefix, `(style|animate)\\s+(${ID}\\s*,\\s*)*\\w*`)) {
        return [...elementItems(diagram, range), ...relationItems(diagram, range)];
      }
      if (match(prefix, `rule\\s+\\w*`)) return words(profile.ruleKinds, "keyword", range);
      if (match(prefix, `layer\\s+\\w*`)) {
        const detail = serviceMessages().completion.layer;
        return words(diagram?.properties.layers ?? [], "value", range, () => detail);
      }
      if (match(prefix, `link\\s+[\\w.]*`)) {
        return linkTargets(analysis, diagram, { start: linkStart(text, offset), end: offset });
      }
      if (prefix === "" || match(prefix, ID)) {
        return [
          ...words(bodyStatements(profile, scope === "group"), "keyword", range),
          ...elementItems(diagram, range),
        ];
      }
      return [];
    }
    case "element":
    case "relation": {
      if (scope === "relation" && modelAt(analysis, offset)) {
        return prefix === "" || match(prefix, ID)
          ? words(["technology", "description", "assumption"], "property", range)
          : [];
      }
      const profile = profileOf(diagram);
      if (match(prefix, `port\\s+${ID}\\s+\\w*`)) return words(PORT_SIDES, "value", range);
      if (scope === "relation" && match(prefix, `kind\\s+\\w*`)) {
        return words(MESSAGE_KINDS, "value", range);
      }
      if (match(prefix, `class\\s+(${ID}\\s*,\\s*)*\\w*`)) {
        return words(classNames(analysis, diagram), "class", range);
      }
      if (match(prefix, `layer\\s+\\w*`)) {
        const detail = serviceMessages().completion.layer;
        return words(diagram?.properties.layers ?? [], "value", range, () => detail);
      }
      if (match(prefix, `link\\s+[\\w.]*`)) {
        return linkTargets(analysis, diagram, { start: linkStart(text, offset), end: offset });
      }
      // Properties of a kind of a declared type, and their values.
      const kindOf = diagram?.elements.find(
        (e) => e.typeKind !== null && e.node && e.node.start <= offset && offset <= e.node.end,
      )?.typeKind;
      const declared =
        scope === "element"
          ? kindOf
            ? diagram?.definition?.elements[kindOf]?.properties
            : undefined
          : diagram?.definition?.relations.properties;
      const valued = match(prefix, `(${ID})\\s+\\w*`);
      const property = valued ? declared?.[valued[1]!] : undefined;
      if (property) {
        return property.kind === "enum"
          ? words(property.values, "value", range)
          : property.kind === "boolean"
            ? words(["true", "false"], "value", range)
            : [];
      }
      if (prefix === "" || match(prefix, ID)) {
        const table = scope === "element" ? profile.elementProperties : profile.relationProperties;
        return words(
          [
            ...Object.keys(table),
            ...(scope === "element" && declared ? Object.keys(declared) : []),
            ...(scope === "element" && profile.ports.length > 0 ? ["port"] : []),
          ],
          "keyword",
          range,
        );
      }
      return [];
    }
    case "placement": {
      if (diagram?.type === "sequence") {
        if (match(prefix, `space\\s+\\w*`)) return namedEventItems(diagram, range, true);
        if (match(prefix, `gap\\s+\\w*`)) return participantItems(diagram, range);
        if (match(prefix, `label\\s+\\w*`)) return relationItems(diagram, range);
        if (match(prefix, `label\\s+${ID}\\s+\\w*`)) return words(["at"], "keyword", range);
        if (prefix === "" || match(prefix, ID)) {
          return words(SEQUENCE_PROFILE.placementStatements, "keyword", range);
        }
        return [];
      }
      if (match(prefix, `(place|size)\\s+\\w*`)) return elementItems(diagram, range);
      if (match(prefix, `place\\s+${ID}\\s+\\w*`)) return words(["at"], "keyword", range);
      if (match(prefix, `(route|label)\\s+\\w*`)) return relationItems(diagram, range);
      if (match(prefix, `route\\s+${ID}\\s+\\w*`)) return words(["from"], "keyword", range);
      if (match(prefix, `route\\s+${ID}\\s+from\\s+\\w*`)) {
        const id = /route\s+(\w+)/.exec(prefix)![1]!;
        const relation = diagram?.relationsByKey.get(id);
        const items = elementItems(diagram, range);
        return relation ? items.filter((i) => i.label === relation.from) : items;
      }
      if (match(prefix, `route\\s+${ID}\\s+from\\s+${ID}(\\.${ID})?\\s+\\w*`)) {
        return words(["to"], "keyword", range);
      }
      if (match(prefix, `route\\s+${ID}\\s+from\\s+${ID}(\\.${ID})?\\s+to\\s+\\w*`)) {
        const id = /route\s+(\w+)/.exec(prefix)![1]!;
        const relation = diagram?.relationsByKey.get(id);
        const items = elementItems(diagram, range);
        return relation ? items.filter((i) => i.label === relation.to) : items;
      }
      if (match(prefix, `route\\s+.*\\s+to\\s+${ID}(\\.${ID})?\\s+\\w*`)) {
        return words(["via"], "keyword", range);
      }
      if (match(prefix, `label\\s+${ID}\\s+\\w*`)) return words(["at"], "keyword", range);
      const constraint = /^(align|row|column|order|distance)\s+(.*)$/.exec(prefix);
      if (constraint) {
        // After the last target comes the edge, the axis or the gap.
        const last = constraint[2]!.split(",").pop()!.trimStart();
        if (/^\w+\s+\w*$/.test(last)) {
          if (constraint[1] === "align") return words(ALIGN_EDGES, "value", range);
          if (constraint[1] === "order") return words(AXES, "value", range);
          return [];
        }
        return elementItems(diagram, range);
      }
      if (prefix === "" || match(prefix, ID)) return words(PLACEMENT_STATEMENTS, "keyword", range);
      return [];
    }
    case "style":
    case "class":
    case "rule": {
      const property = match(prefix, `(${ID})\\s+(${ID}\\s*,\\s*)*\\w*`);
      if (property) {
        return words(styleValues(analysis, diagram, property[1]!), "value", range);
      }
      if (prefix === "" || match(prefix, ID)) {
        const free = diagram?.type === "free" || diagram === undefined;
        const profile = profileOf(diagram);
        // `shape` is for free boxes and flow nodes, `radius` for the corners of boxes, nodes,
        // notes and groups, `rotation` for the elements of flow and free diagrams; sequence
        // participants and C4 entities draw their own, upright.
        const shapes = diagram === undefined || profileTakesShape(profile);
        const turns = diagram === undefined || profileTakesRotation(profile);
        const names = Object.keys(profile.styleProperties).filter(
          (p) =>
            (scope !== "class" || p !== "class") &&
            (free || !isFreeStyleProperty(p)) &&
            (shapes || p !== "shape") &&
            (turns || p !== "rotation") &&
            (diagram?.type !== "sequence" || p !== "radius"),
        );
        const relationsOnly = serviceMessages().completion.relationsOnly;
        return words(names, "property", range, (p) =>
          RELATION_ONLY_PROPERTIES.includes(p) ? relationsOnly : keywordDoc(p),
        );
      }
      return [];
    }
    case "scenario": {
      if (match(prefix, `choose\\s+\\w*`))
        return fragmentItems(diagram, ["alt", "critical"], range);
      if (match(prefix, `repeat\\s+\\w*`)) return fragmentItems(diagram, ["loop"], range);
      if (match(prefix, `(skip|take)\\s+\\w*`))
        return fragmentItems(diagram, ["opt", "break"], range);
      const choose = match(prefix, `choose\\s+(${ID})\\s+\\w*`);
      if (choose) {
        const fragment = fragmentsOf(diagram, ["alt", "critical"]).find((f) => f.id === choose[1]);
        const t = serviceMessages();
        return (fragment?.branches ?? []).map((b, i) => ({
          label: b.condition ? `"${b.condition}"` : String(i + 1),
          kind: "value" as const,
          detail: b.condition ? t.branch(i + 1) : t.completion.noConditionBranch,
          range,
        }));
      }
      if (prefix === "" || match(prefix, ID)) return words(SCENARIO_STATEMENTS, "keyword", range);
      return [];
    }
    case "animate": {
      if (match(prefix, `effect\\s+\\w*`)) return words(ANIMATION_EFFECTS, "value", range);
      if (match(prefix, `repeat\\s+\\w*`)) return words(["forever"], "value", range);
      if (match(prefix, `direction\\s+\\w*`)) return words(ANIMATION_DIRECTIONS, "value", range);
      if (match(prefix, `color\\s+\\w*`)) return words(THEME_COLOR_TOKENS, "value", range);
      if (prefix === "" || match(prefix, ID)) {
        // Properties that apply to the block's effect, once the effect is written.
        const effect = animateEffectAt(analysis, offset);
        const names = Object.keys(FLOW_PROFILE.animateProperties).filter(
          (p) =>
            effect === null ||
            ["effect", "duration", "repeat", "delay"].includes(p) ||
            ANIMATION_EFFECT_PROPERTIES[effect].includes(p),
        );
        return words(names, "property", range);
      }
      return [];
    }
    case "story":
    case "scene":
    case "parallel":
      return storyCompletions(analysis, scope, prefix, range, offset);
    case "export":
      return profileCompletions(analysis, prefix, range, offset);
    case "theme": {
      if (prefix === "" || match(prefix, ID)) {
        return words([...Object.keys(THEME_TOKENS), "extends", "class", "rule"], "property", range);
      }
      return [];
    }
    default:
      return [];
  }
}

/**
 * Icon references for a picker: those matching `query`, or the first icons of the first pack
 * when the query is empty; only icons the packs can draw.
 */
export function iconChoices(analysis: DocumentAnalysis, query: string, limit = 100): string[] {
  const icons = analysis.icons;
  if (!icons) return [];
  if (query.trim() !== "") return searchIcons(icons, query, limit);
  const pack = icons.list()[0];
  return (pack ? drawableNames(pack, limit) : []).map((name) => `${pack!.prefix}:${name}`);
}

/** The effect written in the `animate` block around `offset`, or null. */
function animateEffectAt(analysis: DocumentAnalysis, offset: number): AnimationEffect | null {
  const found = blockAt(analysis.compilation.parse.root, offset);
  if (!found) return null;
  for (const statement of found.block.statements) {
    if (statement.kind !== "KeywordStatement" || statement.keyword.text !== "effect") continue;
    const value = statement.args[0];
    if (
      value?.kind === "QualifiedRef" &&
      (ANIMATION_EFFECTS as readonly string[]).includes(value.text)
    ) {
      return value.text as AnimationEffect;
    }
  }
  return null;
}
