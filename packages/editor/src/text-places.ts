import {
  StyleResolver,
  estimateTextWidth,
  splitLines,
  typeScale,
  type Box,
  type ConnectorGeometry,
  type GroupItem,
  type RectItem,
  type ResolvedStyle,
  type Scene,
  type SceneItem,
  type TextItem,
  type Theme,
} from "@meltemi/diagrams-layout";
import type { FlowDiagram, Point } from "@meltemi/diagrams-model";
import type { TextPlace } from "./canvas/protocol.js";

/** Where the labels of a diagram are drawn, by element id, relation key and event key. */
export interface TextPlaces {
  readonly elements: ReadonlyMap<string, TextPlace>;
  readonly relations: ReadonlyMap<string, TextPlace>;
  readonly events: ReadonlyMap<string, TextPlace>;
}

export const NO_TEXT_PLACES: TextPlaces = {
  elements: new Map(),
  relations: new Map(),
  events: new Map(),
};

/** Kinds whose label the drawing writes on one line: titles of groups and tags. */
const ONE_LINE: ReadonlySet<string> = new Set(["group", "tag"]);
/** Kinds whose text is not drawn around a shape's text centre: their box is their area. */
const UNSHAPED: ReadonlySet<string> = new Set(["group", "note", "tag", "text"]);

const ALIGN = { start: "left", middle: "center", end: "right" } as const;

/**
 * Where and how the layout drew the label of every element, relation and sequence event, read
 * from its scene, in diagram coordinates: the inline editor types over it in the same font, size,
 * weight, colour and alignment. An empty label is drawn as one empty line, so its place is known
 * too; a relation without a label is placed at the middle of its line. `shapes` are the shapes the
 * layout drew elements with: an icon shape's label lies outside its square, and a placeholder's
 * name drawn in the square (when the icon is missing) is not its label.
 */
export function textPlaces(
  diagram: FlowDiagram,
  scene: Scene,
  offset: Point,
  theme: Theme,
  connectors: ReadonlyMap<string, ConnectorGeometry>,
  shapes: ReadonlyMap<string, string> = new Map(),
): TextPlaces {
  const scale = typeScale(theme);
  const styles = new StyleResolver(theme, diagram);
  const elements = new Map<string, TextPlace>();
  const relations = new Map<string, TextPlace>();
  const events = new Map<string, TextPlace>();
  const toDiagram = (box: Box): Box => ({
    x: box.x - offset.x,
    y: box.y - offset.y,
    width: box.width,
    height: box.height,
  });
  const fontOf = (item: TextItem) => (item.font === "mono" ? scene.fonts.mono : scene.fonts.body);

  /** A place from the drawn lines of a label, the first of them `lines[0]`. */
  const place = (
    lines: readonly TextItem[],
    area: Box,
    multiline: boolean,
    line?: number,
  ): TextPlace => {
    const first = lines[0]!;
    const last = lines[lines.length - 1]!;
    return {
      anchor: { x: first.x - offset.x, y: (first.y + last.y) / 2 - offset.y },
      area: toDiagram(area),
      align: ALIGN[first.anchor],
      font: fontOf(first),
      size: first.size,
      weight: first.weight,
      color: first.fill,
      line:
        lines.length > 1
          ? (last.y - first.y) / (lines.length - 1)
          : (line ?? Math.round(first.size * 1.25)),
      lines: multiline,
    };
  };

  /**
   * Where the first line of an icon shape's label goes, as the layout draws it: outside the icon's
   * square at `labelPosition` (below by default), half the padding away, in the label's font. Text
   * typed left of the square grows leftwards, right of it rightwards.
   */
  const iconShapeLabel = (style: ResolvedStyle, free: boolean, box: Box): TextPlace => {
    const size = (free ? style.fontSize : undefined) ?? scale.label;
    const weight = (free ? style.fontWeight : undefined) ?? scale.labelWeight;
    const line = Math.round(size * 1.25);
    const gap = Math.round(theme.padding / 2);
    const side = style.labelPosition ?? "bottom";
    const middle = box.y + box.height / 2;
    let align: TextPlace["align"] =
      side === "left" ? "right" : side === "right" ? "left" : "center";
    let x = side === "left" ? box.x - gap : side === "right" ? box.x + box.width + gap : 0;
    if (side === "top" || side === "bottom") {
      align = (free ? style.textAlign : undefined) ?? "center";
      x = align === "left" ? box.x : align === "right" ? box.x + box.width : box.x + box.width / 2;
    }
    const y =
      side === "bottom"
        ? box.y + box.height + gap + line / 2
        : side === "top"
          ? box.y - gap - line / 2
          : middle;
    const width = box.width;
    const left = align === "left" ? x : align === "right" ? x - width : x - width / 2;
    return {
      anchor: { x: x - offset.x, y: y - offset.y },
      area: toDiagram({ x: left, y: y - line / 2, width, height: line }),
      align,
      font: scene.fonts.body,
      size,
      weight,
      color: style.color ?? theme.ink,
      line,
      lines: true,
    };
  };

  /** The text items a group draws itself, in order: icons are groups of their own. */
  const textsOf = (group: GroupItem): TextItem[] =>
    group.items.filter((item): item is TextItem => item.kind === "text");

  /**
   * A box narrowed by the room left of the anchor of left-aligned text (right of right-aligned),
   * so the editor keeps the same room on its other side.
   */
  const around = (box: Box, anchor: number, align: TextPlace["align"]): Box => {
    const margin =
      align === "left" ? anchor - box.x : align === "right" ? box.x + box.width - anchor : 0;
    const inset = Math.max(0, Math.min(margin, box.width / 2));
    return { x: box.x + inset, y: box.y, width: box.width - 2 * inset, height: box.height };
  };

  /** Whether a text is drawn inside a box: its anchor strictly within it. */
  const within = (text: TextItem, box: Box) =>
    text.x > box.x && text.x < box.x + box.width && text.y > box.y && text.y < box.y + box.height;

  const element = (group: GroupItem) => {
    const owner = diagram.elementsById.get(group.id);
    if (!owner || elements.has(owner.id) || owner.kind === "icon" || owner.kind === "image") return;
    const bounds = group.bounds;
    if (!bounds) return;
    const single = ONE_LINE.has(owner.kind) || diagram.type === "sequence";
    const count = single ? 1 : splitLines(owner.label).length;
    // An icon shape draws its label outside its square; a text inside it is the name a dashed
    // placeholder shows while the shape has no icon to draw.
    const iconShaped = shapes.get(owner.id) === "icon";
    const texts = textsOf(group);
    const lines = (iconShaped ? texts.filter((t) => !within(t, bounds)) : texts).slice(0, count);
    if (lines.length === 0) {
      // An icon shape without a label draws none: a new one goes outside its square.
      if (iconShaped) {
        elements.set(owner.id, iconShapeLabel(styles.element(owner), owner.kind === "box", bounds));
      }
      return;
    }
    const box = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    const align = ALIGN[lines[0]!.anchor];
    let area: Box;
    if (UNSHAPED.has(owner.kind) || diagram.type === "sequence") {
      area = around(box, lines[0]!.x, align);
    } else if (bounds.label) {
      // An icon shape's label, drawn outside the icon's square.
      area = bounds.label;
    } else {
      // A shape's inscribed text area (a person's or an agent's body keeps the box's width),
      // inside the padding that aligned text keeps too.
      const inner = bounds.inner ?? box;
      const padding = Math.min(theme.padding, inner.width / 2);
      area = { ...inner, x: inner.x + padding, width: inner.width - 2 * padding };
      // Text moved up or down by `verticalAlign` is typed in the band it is drawn in.
      const vertical = owner.kind === "box" ? styles.element(owner).verticalAlign : undefined;
      if (!bounds.inner && (vertical === "top" || vertical === "bottom")) {
        const first = lines[0]!;
        const last = lines[lines.length - 1]!;
        const top = first.y - first.size / 2;
        area = { ...area, y: top, height: last.y + last.size / 2 - top };
      }
    }
    elements.set(
      owner.id,
      place(lines, area, !single, owner.kind === "note" ? scale.noteLine : undefined),
    );
  };

  /**
   * The default label of a relation: the pill's text, as the layout draws a new one. Messages of
   * sequence diagrams draw theirs without a pill.
   */
  const relationStyle = (key: string) => {
    const relation = diagram.relationsByKey.get(key);
    const style = relation ? styles.relation(relation) : {};
    const sequence = diagram.type === "sequence";
    return {
      font: scene.fonts.body,
      size: scale.relationLabel,
      weight: sequence ? 400 : 500,
      color: style.color ?? theme.ink,
      line: Math.round(scale.relationLabel * 1.25),
      lines: false,
      align: "center" as const,
      ...(sequence ? {} : { background: style.fill ?? theme.surface }),
    };
  };

  /** A free line's pill: its label, edited as a relation's, in the line's own style. */
  const lineStyle = (id: string) => {
    const line = diagram.elementsById.get(id);
    const style = line ? styles.element(line) : {};
    return {
      font: scene.fonts.body,
      size: scale.relationLabel,
      weight: 500,
      color: style.color ?? theme.ink,
      line: Math.round(scale.relationLabel * 1.25),
      lines: false,
      align: "center" as const,
      background: style.fill ?? theme.surface,
    };
  };

  const lineLabel = (group: GroupItem) => {
    if (elements.has(group.id)) return;
    const pill = group.items.find((item): item is RectItem => item.kind === "rect");
    const [first] = textsOf(group);
    if (first) {
      const drawn = place([first], pill ?? boxAt(first), false);
      elements.set(group.id, pill ? { ...drawn, background: pill.fill } : drawn);
      return;
    }
    if (!pill) return;
    elements.set(group.id, {
      ...lineStyle(group.id),
      anchor: { x: pill.x + pill.width / 2 - offset.x, y: pill.y + pill.height / 2 - offset.y },
      area: toDiagram(pill),
    });
  };

  const relationLabel = (group: GroupItem) => {
    const relation = diagram.relationsByKey.get(group.id);
    if (!relation || relations.has(relation.key)) return;
    const pill = group.items.find((item): item is RectItem => item.kind === "rect");
    const [first] = textsOf(group);
    if (relation.label && first) {
      const drawn = place([first], pill ?? boxAt(first), false);
      relations.set(relation.key, pill ? { ...drawn, background: pill.fill } : drawn);
      return;
    }
    // A pill without text holds an icon or a technology: the label goes at its centre.
    const area = pill ?? undefined;
    if (!area) return;
    relations.set(relation.key, {
      ...relationStyle(relation.key),
      anchor: { x: area.x + area.width / 2 - offset.x, y: area.y + area.height / 2 - offset.y },
      area: toDiagram(area),
    });
  };

  const event = (group: GroupItem) => {
    const found = diagram.eventsByKey.get(group.id);
    if (!found || events.has(found.key)) return;
    const texts = textsOf(group);
    const bounds = group.bounds;
    switch (found.kind) {
      case "note": {
        if (group.role !== "event" || !bounds) return;
        const lines = texts.slice(0, splitLines(found.text).length);
        if (lines.length === 0) return;
        events.set(
          found.key,
          place(lines, around(bounds, lines[0]!.x, "left"), true, scale.noteLine),
        );
        return;
      }
      case "fragment": {
        // The header: the operator's tab, then the first condition in brackets; a region writes
        // its label alone.
        if (group.role !== "label") return;
        const frame = groupBounds.get(found.key);
        if (!frame) return;
        const size = scale.relationLabel;
        const region = found.operator === "region";
        const condition = found.branches[0]?.condition ?? null;
        const drawn =
          condition !== null
            ? texts.find((t) => t.text === (region ? condition : `[${condition}]`))
            : undefined;
        const tab = region ? 0 : estimateTextWidth(found.operator, size, "body") + 18;
        const x = drawn
          ? drawn.x + (region ? 0 : estimateTextWidth("[", size, "body"))
          : frame.x + tab + 8;
        const y = drawn?.y ?? texts[0]?.y ?? frame.y + size;
        // The condition may reach the frame's right side.
        const width = Math.max(0, frame.x + frame.width - 8 - x);
        events.set(found.key, {
          anchor: { x: x - offset.x, y: y - offset.y },
          area: toDiagram({ x, y: y - size / 2, width, height: size }),
          align: "left",
          font: scene.fonts.body,
          size,
          weight: region ? 600 : 400,
          color: drawn?.fill ?? theme.muted,
          line: Math.round(size * 1.25),
          lines: false,
        });
        return;
      }
      case "divider":
      case "delay": {
        const [first] = texts;
        if (!first) return;
        const frame = group.items.find((item): item is RectItem => item.kind === "rect");
        events.set(found.key, place([first], frame ?? boxAt(first), false));
        return;
      }
      default:
        return;
    }
  };

  // Fragments draw their frame and their header in two groups: the frame first.
  const groupBounds = new Map<string, Box>();
  const walk = (items: readonly SceneItem[]) => {
    for (const item of items) {
      if (item.kind !== "group") continue;
      if (item.role === "event" && item.bounds && !groupBounds.has(item.id)) {
        groupBounds.set(item.id, item.bounds);
      }
      walk(item.items);
    }
  };
  walk(scene.items);
  const visit = (items: readonly SceneItem[]) => {
    for (const item of items) {
      if (item.kind !== "group") continue;
      if (item.role === "element") element(item);
      else if (item.role === "label" && diagram.relationsByKey.has(item.id)) relationLabel(item);
      else if (item.role === "label" && diagram.elementsById.get(item.id)?.kind === "line") {
        lineLabel(item);
      }
      if ((item.role === "event" || item.role === "label") && diagram.eventsByKey.has(item.id)) {
        event(item);
      }
      visit(item.items);
    }
  };
  visit(scene.items);

  // A relation without a label: a new one goes at the middle of its line.
  for (const [key, connector] of connectors) {
    const line = diagram.elementsById.get(key)?.kind === "line";
    if (line ? elements.has(key) : relations.has(key)) continue;
    const middle = halfway(connector.line.length > 1 ? connector.line : connector.points);
    if (!middle) continue;
    // A free line without a label: a new one goes at its middle too.
    if (line) {
      elements.set(key, {
        ...lineStyle(key),
        anchor: middle,
        area: { x: middle.x, y: middle.y, width: 0, height: 0 },
      });
      continue;
    }
    relations.set(key, {
      ...relationStyle(key),
      anchor: middle,
      area: { x: middle.x, y: middle.y, width: 0, height: 0 },
    });
  }
  return { elements, relations, events };
}

/** A zero-width box on a text's anchor, for a text drawn without a frame. */
function boxAt(text: TextItem): Box {
  return { x: text.x, y: text.y - text.size / 2, width: 0, height: text.size };
}

/** The point halfway along a polyline, or undefined for none. */
function halfway(points: readonly Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (left <= length && length > 0) {
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    }
    left -= length;
  }
  return points[points.length - 1];
}
