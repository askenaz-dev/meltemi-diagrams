import type { Diagnostic } from "@meltemi/diagrams-language";
import {
  resolveScenario,
  type Compilation,
  type Element,
  type FlowDiagram,
  type FragmentEvent,
  type LabelEntry,
  type NoteEvent,
  type Point,
  type Relation,
  type SequenceEvent,
} from "@meltemi/diagrams-model";
import { brandFrame, round2, textItem } from "./frame.js";
import { cylinderPaths, unionBoxes, type Box } from "./geometry.js";
import { markerItems, relationEnds, shiftMarker, type MarkerPart } from "./markers.js";
import {
  canvasSize,
  frameMinWidth,
  type ConnectorGeometry,
  type LayoutOptions,
  type LayoutResult,
  type TypeScale,
} from "./layout.js";
import type { TextMetrics } from "./measure.js";
import { markGradient } from "./mark.js";
import type { BoxShape } from "./shapes.js";
import {
  strokeDash,
  type GroupItem,
  type SceneBounds,
  type SceneGradient,
  type SceneItem,
  type StrokeDash,
  type TextItem,
} from "./scene.js";
import { StyleResolver, type ResolvedStyle } from "./styles.js";
import { splitLines } from "./text.js";
import type { Theme } from "./theme.js";

export interface SequenceInput {
  readonly compilation: Compilation;
  readonly diagram: FlowDiagram;
  readonly options: LayoutOptions;
  readonly theme: Theme;
  readonly scale: TypeScale;
  readonly metrics: TextMetrics;
  readonly diagnostics: Diagnostic[];
}

const BOX_KINDS: ReadonlySet<string> = new Set(["participant", "database", "collections", "queue"]);
/** The horizontal radius of a queue's ends. */
const QUEUE_CAP = 8;
/** How far the second box of a collections head stands up and to the right of the first. */
const STACK = 4;
/** The opacity of a lifeline's stroke: half of `muted`, behind the messages. */
const LIFELINE_OPACITY = 0.5;
const BAR = 10;
const BAR_STEP = 5;
const SELF_WIDTH = 34;
const SELF_HEIGHT = 22;

interface Lifeline {
  readonly participant: string;
  readonly x: number;
  top: number;
  bottom: number | null;
}

interface MessageGeo {
  readonly key: string;
  readonly relation: Relation;
  readonly points: Point[];
  readonly self: boolean;
  readonly label: { box: Box; text: string } | undefined;
  readonly number: number | null;
}

interface FrameGeo {
  readonly key: string;
  readonly event: FragmentEvent;
  readonly box: Box;
  readonly headerHeight: number;
  readonly separators: { y: number; condition: string | null }[];
}

interface Bar {
  readonly participant: string;
  readonly depth: number;
  readonly top: number;
  bottom: number;
}

/** Lays out a sequence diagram (decision 0019): columns in source order, events top to bottom. */
export function layoutSequence(input: SequenceInput): LayoutResult {
  const { compilation, diagram, options, theme, scale, metrics, diagnostics } = input;
  const f = theme.labelSize / 13;
  const styles = new StyleResolver(theme, diagram);
  const scenario = options.scenario
    ? diagram.scenarios.find((s) => s.id === options.scenario)
    : undefined;
  const events: readonly SequenceEvent[] = scenario
    ? (resolveScenario(diagram, scenario.id) ?? diagram.events)
    : diagram.events;
  const participants = diagram.elements.filter((e) => e.kind !== "group");
  const groups = diagram.elements.filter((e) => e.kind === "group");
  const column = new Map(participants.map((p, i) => [p.id, i]));

  // ---------------------------------------------------------------- measures
  const labelLine = Math.round(scale.label * 1.5);
  const boxHeight = Math.round(40 * f);
  const figureHeight = Math.round(34 * f);
  const hasFigures = participants.some((p) => !BOX_KINDS.has(p.kind));
  const headHeight = Math.max(boxHeight, hasFigures ? figureHeight + 6 + labelLine : 0);
  const labelWidth = (p: Element) => metrics.width(p.label, "body", scale.labelWeight, scale.label);
  const widths = participants.map((p) =>
    BOX_KINDS.has(p.kind)
      ? Math.max(Math.round(96 * f), Math.ceil(labelWidth(p) + 2 * theme.padding)) +
        // A queue's right cap takes room from its body.
        (p.kind === "queue" ? 2 * QUEUE_CAP : 0)
      : Math.max(Math.round(48 * f), Math.ceil(labelWidth(p) + 8)),
  );
  const messageLabel = (relation: Relation) =>
    relation.label === null ? 0 : metrics.width(relation.label, "body", 400, scale.relationLabel);
  const noteLines = (note: NoteEvent) => splitLines(note.text);
  const noteSize = (note: NoteEvent) => {
    const lines = noteLines(note);
    const width = Math.max(
      ...lines.map((line) => metrics.width(line, "body", 400, scale.note)),
      24,
    );
    return { width: Math.ceil(width + 16), height: lines.length * scale.noteLine + 12 };
  };
  const numbered = diagram.properties.autonumber !== null;
  const discRoom = numbered ? 22 : 0;
  const spaces = new Map<string, number>();
  const gaps = new Map<string, number>();
  const labelEntries = new Map<string, LabelEntry>();
  for (const entry of diagram.placement) {
    if (entry.statement === "space") spaces.set(entry.target, entry.amount);
    else if (entry.statement === "gap") gaps.set(entry.target, entry.amount);
    else if (entry.statement === "label") labelEntries.set(entry.target, entry);
  }
  const baseKey = (key: string) => key.replace(/@\d+$/, "").replace(/@\d+$/, "");

  // ---------------------------------------------------------------- columns
  const xs: number[] = [];
  participants.forEach((p, i) => {
    xs[i] =
      i === 0
        ? widths[0]! / 2
        : xs[i - 1]! +
          widths[i - 1]! / 2 +
          widths[i]! / 2 +
          Math.round(40 * f) +
          (gaps.get(p.id) ?? 0);
  });
  const constraints: { a: number; b: number; length: number }[] = [];
  let leftExtra = 0;
  let rightExtra = 0;
  const walk = (list: readonly SequenceEvent[]) => {
    for (const event of list) {
      if (event.kind === "message") {
        const relation = diagram.relationsByKey.get(event.relation);
        if (!relation) continue;
        const a = column.get(relation.from)!;
        const b = column.get(relation.to)!;
        const room = messageLabel(relation) + discRoom;
        if (a === b) {
          const length = SELF_WIDTH + room + 16;
          if (a < participants.length - 1) {
            constraints.push({ a, b: a + 1, length: length + widths[a + 1]! / 2 });
          } else rightExtra = Math.max(rightExtra, length);
        } else {
          constraints.push({ a: Math.min(a, b), b: Math.max(a, b), length: room + 24 });
        }
      } else if (event.kind === "note") {
        const size = noteSize(event);
        const indices = event.participants.map((p) => column.get(p)!).sort((x, y) => x - y);
        const i = indices[0]!;
        const j = indices[indices.length - 1]!;
        if (event.position === "over" && i === j) {
          if (i > 0)
            constraints.push({ a: i - 1, b: i, length: size.width / 2 + widths[i - 1]! / 2 + 10 });
          else leftExtra = Math.max(leftExtra, size.width / 2 - widths[i]! / 2);
          if (i < participants.length - 1) {
            constraints.push({ a: i, b: i + 1, length: size.width / 2 + widths[i + 1]! / 2 + 10 });
          } else rightExtra = Math.max(rightExtra, size.width / 2 - widths[i]! / 2);
        } else if (event.position === "over") {
          constraints.push({ a: i, b: j, length: size.width - 48 });
        } else if (event.position === "left") {
          if (i > 0)
            constraints.push({ a: i - 1, b: i, length: size.width + 20 + widths[i - 1]! / 2 });
          else leftExtra = Math.max(leftExtra, size.width + 20 - widths[i]! / 2);
        } else if (i < participants.length - 1) {
          constraints.push({ a: i, b: i + 1, length: size.width + 20 + widths[i + 1]! / 2 });
        } else rightExtra = Math.max(rightExtra, size.width + 20 - widths[i]! / 2);
      } else if (event.kind === "fragment") {
        for (const branch of event.branches) walk(branch.events);
      }
    }
  };
  walk(events);
  constraints.sort((p, q) => p.b - q.b || p.a - q.a);
  for (const { a, b, length } of constraints) {
    const deficit = length - (xs[b]! - xs[a]!);
    if (deficit > 0) for (let k = b; k < xs.length; k++) xs[k] = xs[k]! + deficit;
  }

  // ---------------------------------------------------------------- rows
  const groupTitle = groups.length > 0 ? labelLine + 12 : 0;
  const rowGap = Math.round(14 * f);
  const labelHeight = scale.relationLabelHeight;
  let y = groupTitle + headHeight + Math.round(24 * f);
  const lifelines = new Map<string, Lifeline>();
  for (const p of participants) {
    lifelines.set(p.id, {
      participant: p.id,
      x: xs[column.get(p.id)!]!,
      top: groupTitle + headHeight,
      bottom: null,
    });
  }
  const created = new Map<string, number>();
  const heads = new Map<string, Box>();
  const messages: MessageGeo[] = [];
  const notes: { key: string; event: NoteEvent; box: Box }[] = [];
  const frames: FrameGeo[] = [];
  const dividers: { key: string; y: number; label: string }[] = [];
  const delays: { key: string; y: number; label: string | null }[] = [];
  const crosses: { key: string; x: number; y: number }[] = [];
  const bars: Bar[] = [];
  const stacks = new Map<string, Bar[]>();
  const rows = new Map<string, { y: number; height: number }>();
  const open: { minX: number; maxX: number }[] = [];
  const extend = (x0: number, x1: number) => {
    for (const frame of open) {
      frame.minX = Math.min(frame.minX, x0);
      frame.maxX = Math.max(frame.maxX, x1);
    }
  };
  let number = (diagram.properties.autonumber ?? 1) - 1;
  let last: { participants: Set<string>; y: number } | undefined;

  const depth = (p: string) => stacks.get(p)?.length ?? 0;
  const edge = (p: string, side: -1 | 1) => {
    const x = xs[column.get(p)!]!;
    const d = depth(p);
    return d === 0 ? x : x + (d - 1) * BAR_STEP + (side * BAR) / 2;
  };
  const headBoxAt = (p: Element, top: number): Box => {
    const i = column.get(p.id)!;
    const width = widths[i]!;
    return { x: xs[i]! - width / 2, y: top, width, height: headHeight };
  };
  /**
   * The box a head is drawn in, within its row's cell: a box kind's box at the bottom of the cell
   * (a collections head with its second box), a figure's whole cell. Editors select, halos pulse
   * and highlights frame this box.
   */
  const drawnHead = (p: Element, cell: Box): Box => {
    if (!BOX_KINDS.has(p.kind)) return cell;
    const box = {
      x: cell.x,
      y: cell.y + cell.height - boxHeight,
      width: cell.width,
      height: boxHeight,
    };
    return p.kind === "collections"
      ? { x: box.x, y: box.y - STACK, width: box.width + STACK, height: box.height + STACK }
      : box;
  };

  const process = (list: readonly SequenceEvent[]) => {
    for (const [index, event] of list.entries()) {
      y += spaces.get(baseKey(event.key)) ?? 0;
      const start = y;
      switch (event.kind) {
        case "message": {
          const relation = diagram.relationsByKey.get(event.relation);
          if (!relation) break;
          const a = relation.from;
          const b = relation.to;
          number += numbered ? 1 : 0;
          const text = relation.label ?? "";
          const textWidth = messageLabel(relation);
          let points: Point[];
          let arrowY: number;
          if (a === b) {
            const top = y + labelHeight;
            const x0 = edge(a, 1);
            points = [
              { x: x0, y: top },
              { x: x0 + SELF_WIDTH, y: top },
              { x: x0 + SELF_WIDTH, y: top + SELF_HEIGHT },
              { x: x0, y: top + SELF_HEIGHT },
            ];
            arrowY = top;
            y = top + SELF_HEIGHT + rowGap;
          } else {
            const createdHead = created.get(b);
            const dir: -1 | 1 = xs[column.get(b)!]! > xs[column.get(a)!]! ? 1 : -1;
            if (createdHead !== undefined && createdHead < 0) {
              // The creating message ends on the new head, drawn at this row.
              const top = y + 4;
              const head = headBoxAt(diagram.elementsById.get(b)!, top);
              heads.set(b, head);
              created.set(b, top);
              lifelines.get(b)!.top = top + headHeight;
              arrowY = top + headHeight - boxHeight / 2;
              const x1 = edge(a, dir);
              const x2 = dir > 0 ? head.x : head.x + head.width;
              points = [
                { x: x1, y: arrowY },
                { x: x2, y: arrowY },
              ];
              y = top + headHeight + rowGap;
            } else {
              arrowY = y + labelHeight + 4;
              points = [
                { x: edge(a, dir), y: arrowY },
                { x: edge(b, dir === 1 ? -1 : 1), y: arrowY },
              ];
              y = arrowY + rowGap;
            }
          }
          let label: MessageGeo["label"];
          if (text !== "" || numbered) {
            const entry = relation.id ? labelEntries.get(relation.id) : undefined;
            const first = points[0]!;
            const lastPoint = points[points.length - 1]!;
            const at = entry ? entry.at / 100 : 0.5;
            const offset = entry?.offset ?? { x: 0, y: 0 };
            const width = Math.max(textWidth + 8, 8);
            const anchor =
              a === b
                ? { x: first.x + SELF_WIDTH + 8 + width / 2, y: first.y + SELF_HEIGHT / 2 }
                : { x: first.x + (lastPoint.x - first.x) * at, y: arrowY - labelHeight / 2 - 1 };
            label = {
              box: {
                x: anchor.x - width / 2 + offset.x,
                y: anchor.y - labelHeight / 2 + offset.y,
                width,
                height: labelHeight,
              },
              text,
            };
          }
          messages.push({
            key: event.key,
            relation,
            points,
            self: a === b,
            label,
            number: numbered ? number : null,
          });
          const xsOf = points.map((p) => p.x);
          extend(
            Math.min(...xsOf) - 8,
            Math.max(...xsOf, label ? label.box.x + label.box.width : -Infinity) + 8,
          );
          last = { participants: new Set([a, b]), y: a === b ? points[3]!.y : arrowY };
          rows.set(event.key, { y: start, height: y - start });
          continue;
        }
        case "activate": {
          const top = last && last.participants.has(event.participant) ? last.y : y;
          const stack = stacks.get(event.participant) ?? [];
          const bar: Bar = {
            participant: event.participant,
            depth: stack.length,
            top,
            bottom: top,
          };
          stack.push(bar);
          stacks.set(event.participant, stack);
          bars.push(bar);
          rows.set(event.key, { y: top, height: 0 });
          continue;
        }
        case "deactivate": {
          const stack = stacks.get(event.participant) ?? [];
          const bar = stack.pop();
          const bottom = last && last.participants.has(event.participant) ? last.y : y;
          if (bar) bar.bottom = Math.max(bottom, bar.top + 12);
          rows.set(event.key, { y: bottom, height: 0 });
          continue;
        }
        case "create": {
          const next = list[index + 1];
          const relation =
            next?.kind === "message" ? diagram.relationsByKey.get(next.relation) : undefined;
          if (relation && relation.to === event.participant && relation.from !== relation.to) {
            created.set(event.participant, -1); // drawn by the next message
          } else {
            const top = y + 4;
            heads.set(
              event.participant,
              headBoxAt(diagram.elementsById.get(event.participant)!, top),
            );
            created.set(event.participant, top);
            lifelines.get(event.participant)!.top = top + headHeight;
            y = top + headHeight + rowGap;
          }
          rows.set(event.key, { y: start, height: y - start });
          continue;
        }
        case "destroy": {
          const x = xs[column.get(event.participant)!]!;
          const at = y + 8;
          crosses.push({ key: event.key, x, y: at });
          lifelines.get(event.participant)!.bottom = at;
          for (const bar of stacks.get(event.participant) ?? [])
            bar.bottom = Math.max(at, bar.top + 12);
          stacks.set(event.participant, []);
          y = at + rowGap + 4;
          rows.set(event.key, { y: start, height: y - start });
          last = undefined;
          continue;
        }
        case "note": {
          const size = noteSize(event);
          const indices = event.participants.map((p) => column.get(p)!).sort((p, q) => p - q);
          const i = indices[0]!;
          const j = indices[indices.length - 1]!;
          const top = y + 4;
          let x: number;
          let width = size.width;
          if (event.position === "over") {
            const left = xs[i]! - (i === j ? 0 : 24);
            const right = xs[j]! + (i === j ? 0 : 24);
            width = Math.max(size.width, right - left);
            x = (left + right) / 2 - width / 2;
          } else if (event.position === "left") {
            x = xs[i]! - 10 - width;
          } else {
            x = xs[i]! + 10;
          }
          const box = { x, y: top, width, height: size.height };
          notes.push({ key: event.key, event, box });
          extend(box.x - 8, box.x + box.width + 8);
          y = top + size.height + rowGap;
          rows.set(event.key, { y: start, height: y - start });
          last = undefined;
          continue;
        }
        case "fragment": {
          const top = y + 4;
          const headerHeight = Math.round(22 * f);
          const frame = { minX: Infinity, maxX: -Infinity };
          open.push(frame);
          const separators: FrameGeo["separators"] = [];
          y = top + headerHeight + 6;
          for (const [b, branch] of event.branches.entries()) {
            if (b > 0) {
              const sep = y + 2;
              separators.push({ y: sep, condition: branch.condition });
              y = sep + Math.round(20 * f);
            }
            last = undefined;
            process(branch.events);
          }
          open.pop();
          const bottom = y + 4;
          const headerText = fragmentHeader(event, metrics, scale);
          if (!Number.isFinite(frame.minX)) {
            frame.minX = xs[0]! - 24;
            frame.maxX = xs[xs.length - 1]! + 24;
          }
          const minX = frame.minX - 16;
          const maxX = Math.max(frame.maxX + 16, minX + headerText + 24);
          const box = { x: minX, y: top, width: maxX - minX, height: bottom - top };
          frames.push({ key: event.key, event, box, headerHeight, separators });
          extend(box.x - 8, box.x + box.width + 8);
          y = bottom + rowGap;
          rows.set(event.key, { y: start, height: y - start });
          last = undefined;
          continue;
        }
        case "divider": {
          dividers.push({ key: event.key, y: y + 12, label: event.label });
          y += 24 + rowGap;
          rows.set(event.key, { y: start, height: y - start });
          last = undefined;
          continue;
        }
        case "delay": {
          delays.push({ key: event.key, y: y + 14, label: event.label });
          y += 28 + rowGap;
          rows.set(event.key, { y: start, height: y - start });
          last = undefined;
          continue;
        }
      }
    }
  };
  process(events);
  const end = y + 8;
  for (const bar of bars) if (bar.bottom === bar.top) bar.bottom = Math.max(end, bar.top + 12);
  for (const stack of stacks.values())
    for (const bar of stack) bar.bottom = Math.max(bar.bottom, end);
  for (const p of participants) {
    if (!heads.has(p.id)) heads.set(p.id, headBoxAt(p, groupTitle));
    const line = lifelines.get(p.id)!;
    if (line.bottom === null) line.bottom = end;
  }
  const groupBoxes = new Map<string, Box>();
  for (const group of groups) {
    const members = participants.filter((p) => p.groupPath.includes(group.id));
    const boxes = members.map((m) => heads.get(m.id)!);
    const union = unionBoxes(boxes);
    if (!union) continue;
    groupBoxes.set(group.id, {
      x: union.x - 12,
      y: 0,
      width: union.width + 24,
      height: end + 8,
    });
  }

  // ---------------------------------------------------------------- canvas
  // A diagram with no participant yet (a new one) has an empty width, not an unknown one.
  const leftmost = xs.length > 0 ? xs[0]! - widths[0]! / 2 - leftExtra : 0;
  const rightmost =
    xs.length > 0 ? xs[xs.length - 1]! + widths[widths.length - 1]! / 2 + rightExtra : 0;
  const left = Math.min(leftmost, ...frames.map((fr) => fr.box.x));
  const right = Math.max(
    rightmost,
    ...frames.map((fr) => fr.box.x + fr.box.width),
    ...notes.map((n) => n.box.x + n.box.width),
    ...messages.flatMap((m) => (m.label ? [m.label.box.x + m.label.box.width] : [])),
  );
  const everything: Box[] = [
    { x: left, y: 0, width: right - left, height: end + 8 },
    ...groupBoxes.values(),
    ...heads.values(),
  ];
  const bounds = unionBoxes(everything)!;
  const margin = theme.margin;
  const contentWidth = Math.ceil(bounds.width + 2 * margin);
  const contentHeight = Math.ceil(bounds.height + 2 * margin);
  const framed = theme.frame !== "none";
  const frameHeight = framed ? scale.frameHeight : 0;
  const title = scenario
    ? `${diagram.properties.title ? `${diagram.properties.title} · ` : ""}${scenario.label}`
    : diagram.properties.title;
  const naturalWidth = framed
    ? Math.max(contentWidth, frameMinWidth(theme, scale, title, metrics))
    : contentWidth;
  const canvas = canvasSize(
    diagram,
    naturalWidth,
    contentHeight + frameHeight,
    compilation.parse.lines,
    diagnostics,
  );
  const frameTop = theme.frame === "header" ? frameHeight : 0;
  const dx = margin - bounds.x + Math.floor((canvas.width - contentWidth) / 2);
  const dy =
    margin - bounds.y + frameTop + Math.floor((canvas.height - frameHeight - contentHeight) / 2);

  // ---------------------------------------------------------------- scene
  const emit = new SequenceEmitter(theme, scale, metrics, styles, dx, dy);
  const items: SceneItem[] = [];
  for (const group of groups) {
    const box = groupBoxes.get(group.id);
    if (box) items.push(emit.group(group, box));
  }
  for (const frame of frames) items.push(emit.frame(frame));
  const headers = frames.map((frame) => emit.frameHeader(frame));
  for (const p of participants) {
    items.push(
      emit.lifeline(
        p,
        lifelines.get(p.id)!,
        bars.filter((b) => b.participant === p.id),
        xs[column.get(p.id)!]!,
      ),
    );
  }
  items.push(...headers);
  for (const message of messages) items.push(emit.message(message, theme));
  for (const note of notes) items.push(emit.note(note));
  for (const divider of dividers) items.push(emit.divider(divider, left, right));
  for (const delay of delays) items.push(emit.delay(delay, left, right));
  for (const cross of crosses) items.push(emit.cross(cross));
  for (const p of participants) {
    const cell = heads.get(p.id)!;
    items.push(emit.head(p, cell, drawnHead(p, cell), boxHeight, figureHeight, labelLine));
  }
  const gradients: SceneGradient[] = [];
  if (framed) {
    const stripTop = theme.frame === "header" ? 0 : canvas.height - frameHeight;
    items.push(brandFrame(theme, scale, metrics, canvas.width, stripTop, title));
    if (theme.mark === "meltemi") gradients.push(markGradient(theme.accent, theme.accentEnd));
  }

  const boxes = new Map<string, Box>();
  // Box kinds are drawn as rounded boxes and databases as cylinders; figures have no outline.
  const shapes = new Map<string, BoxShape>();
  const radii = new Map<string, number>();
  for (const p of participants) {
    boxes.set(p.id, drawnHead(p, heads.get(p.id)!));
    if (!BOX_KINDS.has(p.kind)) continue;
    if (p.kind === "database") {
      shapes.set(p.id, "cylinder");
    } else {
      shapes.set(p.id, "rounded");
      radii.set(p.id, theme.radius);
    }
  }
  for (const [id, box] of groupBoxes) boxes.set(id, box);
  for (const note of notes) boxes.set(note.key, note.box);
  for (const frame of frames) boxes.set(frame.key, frame.box);
  const connectors = new Map<string, ConnectorGeometry>();
  const labels = new Map<string, Box>();
  for (const message of messages) {
    const first = message.points[0]!;
    const lastPoint = message.points[message.points.length - 1]!;
    const toRight = message.self || lastPoint.x >= first.x;
    connectors.set(message.key, {
      points: message.points,
      line: message.points,
      fromSide: toRight ? "east" : "west",
      toSide: message.self ? "east" : toRight ? "west" : "east",
      via: [],
    });
    if (message.label) labels.set(message.key, message.label.box);
  }
  return {
    scene: {
      width: canvas.width,
      height: canvas.height,
      background: theme.background,
      title,
      description: diagram.properties.description,
      fonts: { body: theme.font, mono: theme.mono },
      gradients: [...gradients, ...emit.gradients],
      patterns: [],
      items,
    },
    diagnostics,
    boxes,
    offset: { x: dx, y: dy },
    labels,
    connectors,
    origins: new Map(),
    theme,
    events: rows,
    shapes,
    radii,
  };
}

/** Width of a fragment's header: the operator tab and the first condition. */
function fragmentHeader(event: FragmentEvent, metrics: TextMetrics, scale: TypeScale): number {
  const tab = metrics.width(event.operator, "body", 600, scale.relationLabel) + 18;
  const condition = event.branches[0]?.condition;
  return (
    tab + (condition ? metrics.width(`[${condition}]`, "body", 400, scale.relationLabel) + 12 : 0)
  );
}

class SequenceEmitter {
  readonly gradients: SceneGradient[] = [];

  constructor(
    private readonly theme: Theme,
    private readonly scale: TypeScale,
    private readonly metrics: TextMetrics,
    private readonly styles: StyleResolver,
    private readonly dx: number,
    private readonly dy: number,
  ) {}

  /** A box in scene coordinates with its corner radius, for motion effects. */
  private bounds(box: Box, radius: number): SceneBounds {
    return { ...this.box(box), radius };
  }

  private p(point: Point): Point {
    return { x: round2(point.x + this.dx), y: round2(point.y + this.dy) };
  }

  private box(box: Box): Box {
    return {
      x: round2(box.x + this.dx),
      y: round2(box.y + this.dy),
      width: round2(box.width),
      height: round2(box.height),
    };
  }

  private text(
    x: number,
    y: number,
    text: string,
    size: number,
    weight: number,
    fill: string,
    anchor: TextItem["anchor"] = "middle",
  ): TextItem {
    return textItem(this.metrics, x + this.dx, y + this.dy, text, size, weight, fill, anchor);
  }

  private rect(
    box: Box,
    radius: number,
    fill: string,
    stroke: string,
    width: number,
    dashed: StrokeDash = false,
  ): SceneItem {
    const b = this.box(box);
    return { kind: "rect", ...b, radius, fill, stroke, strokeWidth: width, dashed };
  }

  private path(
    d: string,
    fill: string,
    stroke: string,
    width: number,
    dashed: StrokeDash = false,
  ): SceneItem {
    return { kind: "path", d, fill, stroke, strokeWidth: width, dashed };
  }

  private line(
    points: readonly Point[],
    stroke: string,
    width: number,
    dashed: StrokeDash,
  ): SceneItem {
    return {
      kind: "polyline",
      points: points.map((q) => this.p(q)),
      stroke,
      strokeWidth: width,
      dashed,
    };
  }

  group(group: Element, box: Box): GroupItem {
    const { theme, scale } = this;
    const style = this.styles.element(group);
    const items: SceneItem[] = [
      this.rect(
        box,
        theme.groupRadius,
        style.fill ?? theme.band,
        style.stroke ?? theme.bandLine,
        style.width ?? theme.strokeWidth,
        strokeDash(style.line),
      ),
      this.text(
        box.x + 12,
        box.y + 14,
        group.label,
        scale.groupTitle,
        scale.labelWeight,
        style.color ?? theme.ink,
        "start",
      ),
    ];
    return {
      kind: "group",
      id: group.id,
      role: "element",
      items,
      bounds: this.bounds(box, theme.groupRadius),
      ...(group.url ? { href: group.url } : {}),
    };
  }

  lifeline(participant: Element, line: Lifeline, bars: readonly Bar[], x: number): GroupItem {
    const { theme } = this;
    const style = this.styles.element(participant);
    // Lifelines, bars, heads and notes take `muted`: the quiet `line` of boxes is too pale for the
    // long thin strokes a sequence diagram is made of (decision 0052). A lifeline is a guide, drawn
    // at half strength so the messages that cross it stay in front.
    const items: SceneItem[] = [
      {
        ...this.line(
          [
            { x, y: line.top },
            { x, y: line.bottom ?? line.top },
          ],
          style.stroke ?? theme.muted,
          theme.strokeWidth,
          true,
        ),
        opacity: LIFELINE_OPACITY,
      } as SceneItem,
    ];
    for (const bar of [...bars].sort((a, b) => a.depth - b.depth)) {
      items.push(
        this.rect(
          {
            x: x - BAR / 2 + bar.depth * BAR_STEP,
            y: bar.top,
            width: BAR,
            height: bar.bottom - bar.top,
          },
          0,
          style.fill ?? theme.surface,
          style.stroke ?? theme.muted,
          theme.strokeWidth,
        ),
      );
    }
    return { kind: "group", id: participant.id, role: "lifeline", items };
  }

  /**
   * A participant's head in its row's cell `head`; `drawn` is the box it is drawn in, which the
   * group carries as its bounds.
   */
  head(
    participant: Element,
    head: Box,
    drawn: Box,
    boxHeight: number,
    figureHeight: number,
    labelLine: number,
  ): GroupItem {
    const { theme, scale } = this;
    const style = this.styles.element(participant);
    const fill = style.fill ?? theme.surface;
    const stroke = style.stroke ?? theme.muted;
    const strokeWidth = style.width ?? theme.strokeWidth;
    const dashed = strokeDash(style.line);
    const color = style.color ?? theme.ink;
    const cx = head.x + head.width / 2;
    const items: SceneItem[] = [];
    const n = (v: number) => String(round2(v));
    if (BOX_KINDS.has(participant.kind)) {
      const box = {
        x: head.x,
        y: head.y + head.height - boxHeight,
        width: head.width,
        height: boxHeight,
      };
      if (participant.kind === "database") {
        const { body, top } = cylinderPaths(this.box(box));
        items.push(
          this.path(body, fill, stroke, strokeWidth, dashed),
          this.path(top, fill, stroke, strokeWidth, dashed),
        );
      } else if (participant.kind === "collections") {
        items.push(
          this.rect(
            { ...box, x: box.x + STACK, y: box.y - STACK },
            theme.radius,
            fill,
            stroke,
            strokeWidth,
            dashed,
          ),
        );
        items.push(this.rect(box, theme.radius, fill, stroke, strokeWidth, dashed));
      } else if (participant.kind === "queue") {
        const b = this.box(box);
        const rx = Math.min(QUEUE_CAP, b.width * 0.1);
        const ry = b.height / 2;
        const d = `M${n(b.x + rx)} ${n(b.y)} L${n(b.x + b.width - rx)} ${n(b.y)} A${n(rx)} ${n(ry)} 0 0 1 ${n(b.x + b.width - rx)} ${n(b.y + b.height)} L${n(b.x + rx)} ${n(b.y + b.height)} A${n(rx)} ${n(ry)} 0 0 1 ${n(b.x + rx)} ${n(b.y)} Z`;
        const cap = `M${n(b.x + b.width - rx)} ${n(b.y)} A${n(rx)} ${n(ry)} 0 0 0 ${n(b.x + b.width - rx)} ${n(b.y + b.height)}`;
        items.push(
          this.path(d, fill, stroke, strokeWidth, dashed),
          this.path(cap, "none", stroke, strokeWidth, dashed),
        );
      } else {
        items.push(this.rect(box, theme.radius, fill, stroke, strokeWidth, dashed));
      }
      // A queue's label is centred on the body, left of its right cap.
      const capRoom = participant.kind === "queue" ? Math.min(QUEUE_CAP, box.width * 0.1) : 0;
      items.push(
        this.text(
          cx - capRoom,
          box.y + box.height / 2,
          participant.label,
          scale.label,
          scale.labelWeight,
          color,
        ),
      );
    } else {
      const top = head.y + head.height - figureHeight - 6 - labelLine;
      // Figures are line drawings: they take the ink, as text does.
      const figure = style.stroke ?? theme.ink;
      const c = this.p({ x: cx, y: top + figureHeight / 2 });
      const s = figureHeight / 34;
      const r = 9 * s;
      switch (participant.kind) {
        case "actor": {
          const h = this.p({ x: cx, y: top });
          const d = `M${n(h.x)} ${n(h.y + 2 * 6 * s + 2)} m-${n(6 * s)} 0 a${n(6 * s)} ${n(6 * s)} 0 1 0 ${n(12 * s)} 0 a${n(6 * s)} ${n(6 * s)} 0 1 0 -${n(12 * s)} 0 M${n(h.x)} ${n(h.y + 20 * s)} L${n(h.x)} ${n(h.y + 26 * s)} M${n(h.x - 10 * s)} ${n(h.y + 21 * s)} L${n(h.x + 10 * s)} ${n(h.y + 21 * s)} M${n(h.x)} ${n(h.y + 26 * s)} L${n(h.x - 8 * s)} ${n(h.y + 34 * s)} M${n(h.x)} ${n(h.y + 26 * s)} L${n(h.x + 8 * s)} ${n(h.y + 34 * s)}`;
          items.push({
            ...this.path(d, "none", figure, Math.max(strokeWidth, 1.5)),
            rounded: true,
          } as SceneItem);
          break;
        }
        case "boundary": {
          const d = `M${n(c.x - r - 8 * s)} ${n(c.y - r)} L${n(c.x - r - 8 * s)} ${n(c.y + r)} M${n(c.x - r - 8 * s)} ${n(c.y)} L${n(c.x - r)} ${n(c.y)} M${n(c.x - r)} ${n(c.y)} a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a${n(r)} ${n(r)} 0 1 0 -${n(2 * r)} 0`;
          items.push(this.path(d, fill, figure, Math.max(strokeWidth, 1.5)));
          break;
        }
        case "control": {
          const d = `M${n(c.x - r)} ${n(c.y)} a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a${n(r)} ${n(r)} 0 1 0 -${n(2 * r)} 0 M${n(c.x + 3 * s)} ${n(c.y - r - 4 * s)} L${n(c.x - 2 * s)} ${n(c.y - r)} L${n(c.x + 3 * s)} ${n(c.y - r + 4 * s)}`;
          items.push(this.path(d, fill, figure, Math.max(strokeWidth, 1.5)));
          break;
        }
        default: {
          // entity
          const d = `M${n(c.x - r)} ${n(c.y)} a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a${n(r)} ${n(r)} 0 1 0 -${n(2 * r)} 0 M${n(c.x - r)} ${n(c.y + r + 2 * s)} L${n(c.x + r)} ${n(c.y + r + 2 * s)}`;
          items.push(this.path(d, fill, figure, Math.max(strokeWidth, 1.5)));
        }
      }
      items.push(
        this.text(
          cx,
          head.y + head.height - labelLine / 2,
          participant.label,
          scale.label,
          scale.labelWeight,
          color,
        ),
      );
    }
    return {
      kind: "group",
      id: participant.id,
      role: "element",
      items,
      bounds: this.bounds(drawn, theme.radius),
      ...(participant.url ? { href: participant.url } : {}),
    };
  }

  message(message: MessageGeo, theme: Theme): GroupItem {
    const { scale } = this;
    const relation = message.relation;
    const style: ResolvedStyle = this.styles.relation(relation);
    const stroke = style.stroke ?? theme.connector;
    const strokeWidth = style.width ?? theme.connectorWidth;
    const dashed = strokeDash(style.line ?? relation.line);
    // Calls take a filled head, replies and async calls an open one; two-way messages take it at
    // both ends; styles replace either.
    const endKind =
      style.arrowhead ?? (relation.line === "dashed" || relation.async ? "open" : "triangle");
    const startKind = style.arrowtail ?? (relation.twoWay ? endKind : "none");
    const arrow = relationEnds(
      message.points,
      startKind,
      endKind,
      theme.arrowSize,
      (theme.arrowSize * 7) / 8,
    );
    const items: SceneItem[] = [this.line(arrow.line, stroke, strokeWidth, dashed)];
    const local = (parts: readonly MarkerPart[]) => shiftMarker(parts, (q) => this.p(q));
    items.push(
      ...markerItems(local(arrow.start), stroke, strokeWidth),
      ...markerItems(local(arrow.end), stroke, strokeWidth),
    );
    if (message.number !== null) {
      const start = message.points[0]!;
      items.push(
        this.rect(
          { x: start.x - 8, y: start.y - 8, width: 16, height: 16 },
          8,
          style.stroke ?? theme.ink,
          "none",
          0,
        ),
      );
      items.push(
        this.text(
          start.x,
          start.y,
          String(message.number),
          Math.round(scale.relationLabel * 0.85),
          700,
          theme.surface,
        ),
      );
    }
    if (message.label && message.label.text !== "") {
      const box = message.label.box;
      items.push({
        kind: "group",
        id: message.key,
        role: "label",
        items: [
          this.text(
            box.x + box.width / 2,
            box.y + box.height / 2,
            message.label.text,
            scale.relationLabel,
            400,
            style.color ?? theme.ink,
          ),
        ],
      });
    }
    return {
      kind: "group",
      id: message.key,
      role: "relation",
      items,
      track: arrow.line.map((q) => this.p(q)),
    };
  }

  note(note: { key: string; event: NoteEvent; box: Box }): GroupItem {
    const { theme, scale } = this;
    const style = note.event.id
      ? this.styles.event(note.event.id, "note")
      : this.styles.event(note.key, "note");
    const b = note.box;
    const fold = 8;
    const s = this.box(b);
    const n = (v: number) => String(round2(v));
    const d = `M${n(s.x)} ${n(s.y)} L${n(s.x + s.width - fold)} ${n(s.y)} L${n(s.x + s.width)} ${n(s.y + fold)} L${n(s.x + s.width)} ${n(s.y + s.height)} L${n(s.x)} ${n(s.y + s.height)} Z`;
    const items: SceneItem[] = [
      this.path(
        d,
        style.fill ?? theme.surface,
        style.stroke ?? theme.muted,
        style.width ?? theme.strokeWidth,
        strokeDash(style.line),
      ),
    ];
    splitLines(note.event.text).forEach((line, i) => {
      items.push(
        this.text(
          b.x + 8,
          b.y + 6 + scale.noteLine / 2 + i * scale.noteLine,
          line,
          scale.note,
          400,
          style.color ?? theme.ink,
          "start",
        ),
      );
    });
    return { kind: "group", id: note.key, role: "event", items, bounds: this.bounds(b, 0) };
  }

  /** The outline and branch separators of a fragment, drawn behind lifelines. */
  frame(frame: FrameGeo): GroupItem {
    const { theme } = this;
    const event = frame.event;
    const style = this.styles.event(event.id ?? frame.key, "fragment");
    const b = frame.box;
    const region = event.operator === "region";
    const stroke = style.stroke ?? theme.muted;
    const items: SceneItem[] = [
      this.rect(
        b,
        2,
        style.fill ?? (region ? theme.band : "none"),
        stroke,
        style.width ?? theme.strokeWidth,
        strokeDash(style.line),
      ),
    ];
    for (const separator of frame.separators) {
      items.push(
        this.line(
          [
            { x: b.x, y: separator.y },
            { x: b.x + b.width, y: separator.y },
          ],
          stroke,
          theme.strokeWidth,
          true,
        ),
      );
    }
    return { kind: "group", id: frame.key, role: "event", items, bounds: this.bounds(b, 2) };
  }

  /** The operator tab and the conditions of a fragment, drawn above lifelines. */
  frameHeader(frame: FrameGeo): GroupItem {
    const { theme, scale, metrics } = this;
    const event = frame.event;
    const style = this.styles.event(event.id ?? frame.key, "fragment");
    const b = frame.box;
    const stroke = style.stroke ?? theme.muted;
    const size = scale.relationLabel;
    const color = style.color ?? theme.ink;
    const muted = style.color ?? theme.muted;
    const first = event.branches[0]?.condition ?? null;
    const h = frame.headerHeight;
    const items: SceneItem[] = [];
    const label = (x: number, y: number, text: string, weight: number, fill: string) => {
      const width = metrics.width(text, "body", weight, size) + 6;
      items.push(
        this.rect(
          { x: x - 3, y: y - h / 2 + 4, width, height: h - 8 },
          2,
          theme.background,
          "none",
          0,
        ),
      );
      items.push(this.text(x, y, text, size, weight, fill, "start"));
    };
    if (event.operator === "region") {
      if (first) label(b.x + 8, b.y + h / 2, first, 600, color);
    } else {
      const tabWidth = metrics.width(event.operator, "body", 600, size) + 18;
      const s = this.box(b);
      const n = (v: number) => String(round2(v));
      const tab = `M${n(s.x)} ${n(s.y)} L${n(s.x + tabWidth)} ${n(s.y)} L${n(s.x + tabWidth)} ${n(s.y + h - 6)} L${n(s.x + tabWidth - 6)} ${n(s.y + h)} L${n(s.x)} ${n(s.y + h)} Z`;
      items.push(this.path(tab, theme.surface, stroke, style.width ?? theme.strokeWidth));
      items.push(this.text(b.x + 8, b.y + h / 2, event.operator, size, 600, color, "start"));
      if (first) label(b.x + tabWidth + 8, b.y + h / 2, `[${first}]`, 400, muted);
    }
    for (const separator of frame.separators) {
      if (separator.condition)
        label(b.x + 8, separator.y + 10, `[${separator.condition}]`, 400, muted);
    }
    return { kind: "group", id: frame.key, role: "label", items };
  }

  divider(
    divider: { key: string; y: number; label: string },
    left: number,
    right: number,
  ): GroupItem {
    const { theme, scale, metrics } = this;
    const width = metrics.width(divider.label, "body", 600, scale.relationLabel) + 20;
    const cx = (left + right) / 2;
    const items: SceneItem[] = [
      this.line(
        [
          { x: left, y: divider.y - 2 },
          { x: right, y: divider.y - 2 },
        ],
        theme.line,
        1,
        false,
      ),
      this.line(
        [
          { x: left, y: divider.y + 2 },
          { x: right, y: divider.y + 2 },
        ],
        theme.line,
        1,
        false,
      ),
      this.rect(
        { x: cx - width / 2, y: divider.y - 10, width, height: 20 },
        4,
        theme.surface,
        theme.line,
        theme.strokeWidth,
      ),
      this.text(cx, divider.y, divider.label, scale.relationLabel, 600, theme.ink),
    ];
    return { kind: "group", id: divider.key, role: "event", items };
  }

  delay(
    delay: { key: string; y: number; label: string | null },
    left: number,
    right: number,
  ): GroupItem {
    const { theme, scale } = this;
    const items: SceneItem[] = [
      this.text(
        (left + right) / 2,
        delay.y,
        delay.label ?? "⋯",
        scale.relationLabel,
        400,
        theme.muted,
      ),
    ];
    return { kind: "group", id: delay.key, role: "event", items };
  }

  cross(at: { key: string; x: number; y: number }): GroupItem {
    const { theme } = this;
    const c = this.p(at);
    const n = (v: number) => String(round2(v));
    const d = `M${n(c.x - 7)} ${n(c.y - 7)} L${n(c.x + 7)} ${n(c.y + 7)} M${n(c.x + 7)} ${n(c.y - 7)} L${n(c.x - 7)} ${n(c.y + 7)}`;
    return {
      kind: "group",
      id: at.key,
      role: "event",
      items: [this.path(d, "none", theme.ink, 2)],
    };
  }
}
