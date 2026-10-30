import { isToken, type CstNode, type Range, type Token } from "@meltemi/diagrams-language";
import { StyleResolver, THEMES, type LayoutResult } from "@meltemi/diagrams-layout";
import {
  MAIN_LAYER,
  PORTS,
  arrowToken,
  type Element,
  type ElementLink,
  type FlowDiagram,
  type PlaceEntry,
  type Relation,
  type RouteEntry,
  type SequenceEvent,
  type SizeEntry,
  type TagUse,
} from "@meltemi/diagrams-model";
import { diagramView, type DocumentAnalysis } from "../analysis.js";
import { measuredFamily } from "../fonts.js";
import { kindWord, serviceMessages } from "../messages/services.js";
import { diagramAt, pathAt, referenceAt, statementPrefix, tokenAt } from "../syntax.js";
import { keywordDoc, listDoc } from "./docs.js";
import { entityAt, entityHover } from "./entities.js";
import { profileAt, profileHover } from "./profiles.js";
import { storyAt, storyHover } from "./stories.js";

export interface Hover {
  readonly range: Range;
  readonly markdown: string;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** A multi-line text in markdown: its line breaks kept. */
const breaks = (text: string) => text.replace(/\n/g, "  \n");

/**
 * What a hover says about an element: its kind, id and label (a pen's point count, a sticky's
 * text), its description, then where it is drawn, its size, a sticky's colour, a list group's
 * arrangement, its ports, groups, layer and link.
 */
export function elementHover(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  element: Element,
): string {
  const t = serviceMessages().hover;
  const kind = kindWord(element.kind);
  const layout = diagramView(analysis, diagram.id)?.layout ?? null;
  const lines = [
    element.source !== null
      ? `**${kind}** \`${element.id}\` — \`${element.source}\``
      : element.pen
        ? `**${kind}** \`${element.id}\` — ${t.points(element.pen.points.length)}`
        : `**${kind}** \`${element.id}\` — ${breaks(element.label)}`,
  ];
  if (element.description) lines.push("", breaks(element.description));
  const facts: string[] = [];
  // A pen is its points: it has no place or size, and its layer is said even when it is `main`.
  if (!element.pen) facts.push(...placeFacts(diagram, element, layout));
  if (element.kind === "sticky") {
    const colour = stickyColour(diagram, element, layout);
    if (colour) facts.push(colour);
  }
  if (element.list) facts.push(...listFacts(element, layout));
  if (element.ports.length > 0) {
    facts.push(t.ports(element.ports.map((p) => `\`${p.name}\` ${p.side}`).join(", ")));
  }
  if (element.groupPath.length > 0)
    facts.push(t.within(element.groupPath.map((g) => `\`${g}\``).join(" › ")));
  if (element.layer !== null || element.pen) facts.push(t.layer(element.layer ?? MAIN_LAYER));
  if (element.link) facts.push(t.linked(element.link.text));
  if (facts.length > 0) lines.push("", facts.join(" · "));
  return lines.join("\n");
}

/**
 * Where an element is drawn and its size: its written `place`, or where the layout put it (the
 * place of a list's child is the list's to choose, whatever is written), and its written or
 * drawn size.
 */
function placeFacts(diagram: FlowDiagram, element: Element, layout: LayoutResult | null): string[] {
  const t = serviceMessages().hover;
  const parent = element.groupPath[element.groupPath.length - 1];
  // A line in a list keeps its points; the list places its other children.
  const listed = element.kind !== "line" && parent !== undefined;
  const list = listed && diagram.elementsById.get(parent)?.list ? parent : null;
  const place = list
    ? undefined
    : diagram.placement.find(
        (p): p is PlaceEntry => p.statement === "place" && p.target === element.id,
      );
  const size = diagram.placement.find(
    (p): p is SizeEntry => p.statement === "size" && p.target === element.id,
  );
  const box = layout?.boxes?.get(element.id);
  const facts: string[] = [];
  if (place) facts.push(t.placed(fmt(place.x), fmt(place.y)));
  else if (box) facts.push(t.arranged(fmt(box.x + box.width / 2), fmt(box.y + box.height / 2)));
  if (list) facts.push(t.placedBy(list));
  if (size) facts.push(t.size(fmt(size.width), fmt(size.height)));
  else if (box) facts.push(t.defaultSize(fmt(box.width), fmt(box.height)));
  return facts;
}

/** The colour of a sticky's card: its style's `fill`, or the theme's `sticky`. */
function stickyColour(
  diagram: FlowDiagram,
  element: Element,
  layout: LayoutResult | null,
): string | undefined {
  const theme = layout?.theme;
  if (!theme) return undefined;
  const t = serviceMessages().hover;
  const fill = new StyleResolver(theme, diagram).element(element).fill;
  return fill ? t.colour(fill, null) : t.colour(theme.sticky, "sticky");
}

/** How a list group arranges its children: its layout, and its spacing and alignment. */
function listFacts(element: Element, layout: LayoutResult | null): string[] {
  const list = element.list;
  if (!list) return [];
  const t = serviceMessages().hover;
  // The layout knows the defaults: half the theme's group padding, and `start`.
  const drawn = layout?.lists?.get(element.id);
  const spacing = list.spacing ?? drawn?.spacing;
  const align = list.align ?? drawn?.align;
  return [
    t.list(list.layout),
    ...(spacing !== undefined ? [t.listSpacing(fmt(spacing), list.spacing === null)] : []),
    ...(align !== undefined ? [t.listAlign(align, list.align === null)] : []),
  ];
}

export function relationHover(diagram: FlowDiagram, relation: Relation): string {
  const t = serviceMessages().hover;
  // The token as written: `->`, `-->`, `<->`, `<-->`, or the lines `--` and `---`.
  const arrow = arrowToken(relation.line, relation.heads);
  const what =
    diagram.type === "sequence"
      ? relation.async
        ? t.asyncMessage
        : relation.line === "dashed"
          ? t.reply
          : t.message
      : t.relation;
  const lines = [
    `**${what}** \`${relation.from} ${arrow} ${relation.to}\`${relation.id ? t.named(relation.id) : ""}`,
  ];
  if (relation.label) lines.push("", t.label(relation.label));
  if (relation.returns !== null) lines.push("", t.returnsFrom(relation.returns));
  if (diagram.type === "sequence" && relation.id) {
    const space = diagram.placement.find(
      (p) => p.statement === "space" && p.target === relation.id,
    );
    if (space && space.statement === "space") lines.push("", t.spaceBefore(fmt(space.amount)));
  }
  const route = relation.id
    ? diagram.placement.find(
        (p): p is RouteEntry => p.statement === "route" && p.target === relation.id,
      )
    : undefined;
  if (route) {
    const via =
      route.via.length > 0
        ? t.via(route.via.map((p) => `(${fmt(p.x)}, ${fmt(p.y)})`).join(" "))
        : "";
    lines.push(
      "",
      t.route(
        `${route.from.element}.${route.from.port}`,
        `${route.to.element}.${route.to.port}`,
        via,
      ),
    );
  }
  return lines.join("\n");
}

/** Where an event sits: its fragments and branches, outermost first. */
function eventPlace(diagram: FlowDiagram, event: SequenceEvent): string {
  const t = serviceMessages();
  return event.path
    .map((place) => {
      // Inside a call's block: the call.
      if ("message" in place) return t.insideCall(place.message);
      const fragment = diagram.eventsByKey.get(place.fragment);
      const condition =
        fragment?.kind === "fragment" ? fragment.branches[place.branch]?.condition : null;
      return `\`${place.fragment}\`${condition ? ` [${condition}]` : ` ${t.branch(place.branch + 1)}`}`;
    })
    .join(" › ");
}

export function eventHover(diagram: FlowDiagram, event: SequenceEvent): string {
  const t = serviceMessages().hover;
  const lines: string[] = [];
  switch (event.kind) {
    case "note": {
      const where =
        event.position === "over"
          ? t.over(event.participants.map((p) => `\`${p}\``).join(", "))
          : t.beside(event.position, event.participants[0]!);
      lines.push(
        `**${kindWord("note")}**${event.id ? ` \`${event.id}\`` : ""} ${where}`,
        "",
        event.text.replace(/\n/g, "  \n"),
      );
      break;
    }
    case "fragment": {
      lines.push(t.fragment(event.operator, event.id ? ` \`${event.id}\`` : ""), "");
      for (const [i, branch] of event.branches.entries()) {
        lines.push(
          `${i + 1}. ${branch.condition ? `“${branch.condition}”` : t.noCondition} — ${t.events(branch.events.length)}`,
        );
      }
      const scenarios = diagram.scenarios.filter((s) =>
        s.choices.some((c) => c.fragment === event.id),
      );
      if (scenarios.length > 0) {
        lines.push("", t.decidedBy(scenarios.map((s) => `\`${s.id}\``).join(", ")));
      }
      break;
    }
    case "activate":
    case "deactivate":
    case "create":
    case "destroy":
      lines.push(`**${kindWord(event.kind)}** \`${event.participant}\``);
      break;
    case "divider":
      lines.push(`**${kindWord("divider")}** “${event.label}”`);
      break;
    case "delay":
      lines.push(`**${kindWord("delay")}**${event.label ? ` “${event.label}”` : ""}`);
      break;
    case "message": {
      lines.push(`**${kindWord("message")}** \`${event.relation}\``);
      const call = diagram.relationsByKey.get(event.relation)?.returns;
      if (call) lines.push("", t.returnsFrom(call));
      break;
    }
  }
  if (event.path.length > 0) lines.push("", t.within(eventPlace(diagram, event)));
  return lines.join("\n");
}

function iconPreview(analysis: DocumentAnalysis, reference: string): string | undefined {
  const t = serviceMessages().hover;
  const lookup = analysis.icons?.lookup(reference);
  if (!lookup) return undefined;
  if (lookup.status !== "found") return `\`${reference}\`: ${t.iconStatus[lookup.status]}`;
  const { icon } = lookup;
  const g = icon.geometry;
  const paths = g.paths
    .map((p) => {
      const paint = (x: typeof p.fill) =>
        x.kind === "none" ? "none" : x.kind === "color" ? x.value : "#555";
      return `<path d="${p.d}" fill="${paint(p.fill)}" stroke="${paint(p.stroke)}" stroke-width="${p.strokeWidth}" stroke-linecap="${p.lineCap}" stroke-linejoin="${p.lineJoin}"${p.transform ? ` transform="${p.transform}"` : ""}/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="${g.viewBox.x} ${g.viewBox.y} ${g.viewBox.width} ${g.viewBox.height}">${paths}</svg>`;
  const data = `data:image/svg+xml;base64,${btoa(svg)}`;
  const meta = icon.pack.metadata;
  return [
    `**${kindWord("icon")}** \`${reference}\``,
    "",
    `![${icon.name}](${data})`,
    "",
    `${meta.title}${meta.version ? ` ${meta.version}` : ""} · ${meta.license ?? t.unknownLicence}`,
  ].join("\n");
}

function themeHover(analysis: DocumentAnalysis, name: string): string | undefined {
  const t = serviceMessages().hover;
  const defined = analysis.themes.find((theme) => theme.id === name);
  if (defined) {
    const frame = defined.tokens["frame"];
    return [
      t.theme(name),
      "",
      t.extends(defined.extends ?? "technical.light", frame ? `${frame}` : undefined),
    ].join("\n");
  }
  const builtIn = THEMES[name];
  if (builtIn) {
    return t.builtInTheme(
      name,
      builtIn.background,
      builtIn.font.split(",")[0]!,
      `${builtIn.frame}`,
    );
  }
  return undefined;
}

/** The link whose reference contains `offset`. */
export function linkAt(analysis: DocumentAnalysis, offset: number): ElementLink | undefined {
  const diagram = diagramAt(analysis.compilation, offset);
  return diagram?.links.find(
    (link) => link.range.start.offset <= offset && offset <= link.range.end.offset,
  );
}

function linkHover(analysis: DocumentAnalysis, link: ElementLink): string {
  const t = serviceMessages().hover;
  if (link.binding === null) {
    const target = analysis.compilation.document.diagrams.find((d) => d.id === link.diagram);
    const element = target?.elementsById.get(link.element);
    if (target && element) {
      return [
        t.linkTo(link.element, link.diagram, target.type),
        "",
        `${kindWord(element.kind)} — ${element.label}`,
        "",
        t.identityOnly,
      ].join("\n");
    }
  }
  return t.link(link.text);
}

/** Markdown about the token under the cursor. */
export function hover(analysis: DocumentAnalysis, offset: number): Hover | undefined {
  const t = serviceMessages().hover;
  const compilation = analysis.compilation;
  const lines = compilation.parse.lines;
  const entity = entityAt(analysis, offset);
  if (entity) return { range: entity.range, markdown: entityHover(analysis, entity) };
  // Inside a story, its own vocabulary and the ids of its views.
  if (storyAt(analysis, offset)) return storyHover(analysis, offset);
  if (profileAt(analysis, offset)) return profileHover(analysis, offset);
  // The model of a view.
  for (const diagram of compilation.document.diagrams) {
    const c4 = diagram.c4;
    if (!c4 || offset < c4.modelRange.start.offset || offset > c4.modelRange.end.offset) continue;
    const model = c4.resolved?.definition;
    return {
      range: c4.modelRange,
      markdown: model
        ? t.model(
            c4.model,
            model.entities.length,
            model.relations.length,
            c4.resolved!.file !== null,
          )
        : t.unresolvedModel(c4.model),
    };
  }
  const link = linkAt(analysis, offset);
  if (link) return { range: link.range, markdown: linkHover(analysis, link) };
  const found = referenceAt(compilation, offset);
  if (found) {
    const { diagram, reference } = found;
    const range = lines.range(reference.token);
    if (reference.targetKind === "element") {
      const element = diagram.elementsById.get(reference.target);
      if (element) return { range, markdown: elementHover(analysis, diagram, element) };
    } else if (reference.targetKind === "event") {
      const event = diagram.eventsByKey.get(reference.target);
      if (event) return { range, markdown: eventHover(diagram, event) };
    } else {
      const relation = diagram.relationsByKey.get(reference.target);
      if (relation) return { range, markdown: relationHover(diagram, relation) };
    }
  }
  const token = tokenAt(compilation.parse.root, offset);
  if (!token) return undefined;
  const range = lines.range(token);
  const diagram = diagramAt(compilation, offset);

  // A tag of a sequence message or participant, by its keyword or its text: what it marks.
  const tagged = diagram?.type === "sequence" ? tagAt(diagram, offset) : undefined;
  if (tagged) return { range: tagged.tag.range, markdown: tagHover(tagged) };

  // A port after a dot in a route, or a port declaration.
  const path = pathAt(compilation.parse.root, offset);
  const ref = [...path].reverse().find((n) => n.kind === "QualifiedRef");
  if (ref?.kind === "QualifiedRef" && ref.parts.length === 2 && ref.parts[1] === token && diagram) {
    const element = diagram.elementsById.get(ref.parts[0]!.text);
    const port = element?.ports.find((p) => p.name === token.text);
    if (port) {
      return {
        range,
        markdown: t.port(port.name, element!.id, port.side, Math.round(port.position * 100)),
      };
    }
    if ((PORTS as readonly string[]).includes(token.text)) {
      return { range, markdown: t.compassPort(token.text) };
    }
  }

  if (token.kind === "String" && typeof token.value === "string") {
    const prefix = statementPrefix(analysis.text, token.start);
    if (/^icon\s+([A-Za-z_]\w*\s+)?$/.test(prefix)) {
      const markdown = iconPreview(analysis, token.value);
      return markdown ? { range, markdown } : undefined;
    }
    if (/^image\s+[A-Za-z_]\w*\s+$/.test(prefix)) {
      const image = analysis.layoutOptions.images?.resolve(token.value);
      return {
        range,
        markdown: image
          ? t.image(token.value, image.format.toUpperCase(), image.width, image.height)
          : t.missingImage(token.value),
      };
    }
    if (/^(theme|extends)\s+$/.test(prefix)) {
      const markdown = themeHover(analysis, token.value);
      return markdown ? { range, markdown } : undefined;
    }
    // A font stack: the family its text is measured with, or that it is estimated.
    if (/^(font|mono)\s+$/.test(prefix)) {
      const family = measuredFamily(analysis.fonts, token.value);
      return {
        range,
        markdown: !family
          ? t.fontEstimated(token.value)
          : family.source === "project"
            ? t.fontProject(family.family)
            : t.fontBundled(family.family, serviceMessages().completion.fontGroup(family.group)),
      };
    }
    return undefined;
  }
  if (token.kind === "Identifier" && isToken(token)) {
    // The keyword of an event statement describes the event.
    if (diagram?.type === "sequence") {
      for (const event of diagram.eventsByKey.values()) {
        if (event.kind === "message" || event.node.kind !== "KeywordStatement") continue;
        if (event.node.keyword === token) return { range, markdown: eventHover(diagram, event) };
      }
      const scenario = diagram.scenarios.find((s) => s.idRange.start.offset === token.start);
      if (scenario) {
        const choices = scenario.choices.map((c) => {
          const fragment = diagram.eventsByKey.get(c.fragment);
          const condition =
            c.kind === "choose" && fragment?.kind === "fragment"
              ? (fragment.branches[c.branch!]?.condition ?? serviceMessages().branch(c.branch! + 1))
              : null;
          return `- ${c.kind} \`${c.fragment}\`${condition ? ` “${condition}”` : ""}${c.iterations !== null ? t.times(c.iterations) : ""}`;
        });
        return {
          range,
          markdown: [t.scenario(scenario.id, scenario.label), "", ...choices].join("\n"),
        };
      }
    }
    // A kind or the type of a declared diagram type: what its plugin says (decision 0030).
    const declared = diagramAt(analysis.compilation, token.start)?.definition;
    const kind = declared?.elements[token.text];
    const plugin = declared?.plugin
      ? `\`${declared.plugin.name}\` ${declared.plugin.version}`
      : null;
    if (declared && kind) {
      const properties = Object.entries(kind.properties).map(
        ([name, p]) =>
          `- \`${name}\` ${p.kind === "enum" ? p.values.join(" | ") : p.kind}${kind.required.includes(name) ? t.required : ""}${p.description ? ` — ${p.description}` : ""}`,
      );
      return {
        range,
        markdown: [
          `**${token.text}** — ${kind.label}${kind.description ? `: ${kind.description}` : ""}`,
          t.kindOf(declared.title, plugin),
          ...(properties.length > 0 ? ["", ...properties] : []),
        ].join("\n"),
      };
    }
    if (declared && token.text === declared.type) {
      return {
        range,
        markdown: `**${declared.type}** — ${declared.title}${declared.description ? `: ${declared.description}` : ""}${t.kinds(Object.keys(declared.elements).join(", "), plugin)}`,
      };
    }
    const doc = (diagram && listWordAt(diagram, path, token)) ?? keywordDoc(token.text);
    if (doc) return { range, markdown: `**${token.text}** — ${doc}` };
  }
  return undefined;
}

/** The tag statement of a sequence participant or message at `offset`, with its owner. */
function tagAt(
  diagram: FlowDiagram,
  offset: number,
): { readonly tag: TagUse; readonly owner: Element | Relation } | undefined {
  const inside = (tag: TagUse) =>
    tag.range.start.offset <= offset && offset <= tag.range.end.offset;
  for (const owner of [...diagram.elements, ...diagram.relations]) {
    const tag = owner.tags.find(inside);
    if (tag) return { tag, owner };
  }
  return undefined;
}

/** What a hover says about a tag: its text and the participant or the message it marks. */
function tagHover({
  tag,
  owner,
}: {
  readonly tag: TagUse;
  readonly owner: Element | Relation;
}): string {
  const t = serviceMessages().hover;
  if (!("from" in owner)) return t.tagOf(tag.text, t.tagParticipant(owner.id));
  const name = owner.id ?? `${owner.from} ${arrowToken(owner.line, owner.heads)} ${owner.to}`;
  return t.tagOf(tag.text, t.tagMessage(name));
}

/**
 * What a word of a group block means when it arranges a list: `layout`, `spacing` and `align`
 * of a free group block, and the values of `layout` and `align` there. `path` runs from the root
 * to the innermost node at the token.
 */
function listWordAt(
  diagram: FlowDiagram,
  path: readonly CstNode[],
  token: Token,
): string | undefined {
  // Declared types compile on the free profile, lists included.
  if (diagram.type !== "free" && !diagram.definition) return undefined;
  for (let i = path.length - 1; i >= 2; i--) {
    const statement = path[i]!;
    if (statement.kind !== "KeywordStatement") continue;
    const block = path[i - 1]!;
    const owner = path[i - 2]!;
    const word = statement.keyword.text;
    const inGroup =
      block.kind === "Block" && owner.kind === "KeywordStatement" && owner.keyword.text === "group";
    if (!inGroup || (word !== "layout" && word !== "spacing" && word !== "align")) return undefined;
    // The keyword itself, or a value of `layout` or `align`.
    const value = statement.args.some((a) => a.start <= token.start && token.end <= a.end);
    return statement.keyword === token || value ? listDoc(token.text) : undefined;
  }
  return undefined;
}
