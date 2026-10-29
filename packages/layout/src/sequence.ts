import type { Diagnostic } from "@meltemi/diagrams-language";
import {
  resolveScenario,
  type Compilation,
  type Element,
  type FlowDiagram,
  type FragmentEvent,
  type GapEntry,
  type LabelEntry,
  type NoteEvent,
  type Point,
  type Relation,
  type SequenceEvent,
  type TagUse,
} from "@meltemi/diagrams-model";
import { brandFrame, round2, textItem } from "./frame.js";
import { cylinderPaths, unionBoxes, type Box } from "./geometry.js";
import { markerItems, relationEnds, shiftMarker, type MarkerPart } from "./markers.js";
import {
  canvasSize,
  frameMinWidth,
  tagPill,
  tagPillWidth,
  type BarGeometry,
  type ConnectorGeometry,
  type LayoutOptions,
  type LayoutResult,
  type MessageText,
  type TypeScale,
} from "./layout.js";
import type { TextMetrics } from "./measure.js";
import { markGradient } from "./mark.js";
import { messages as words } from "./messages/index.js";
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
import { splitLines, wrapLines } from "./text.js";
import type { ArrowheadKind, Theme } from "./theme.js";

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
/** The least room between two heads, whatever a negative `gap` asks. */
const HEAD_CLEARANCE = 8;
/** How far two distances of the columns may differ by rounding alone. */
const ROUNDING = 1e-6;
const SELF_WIDTH = 34;
const SELF_HEIGHT = 22;
/** The room between two pills of a row of tags. */
const TAG_GAP = 4;
/** How far a message's row of tags stands from the arrow's start, or from its number's disc. */
const TAG_START = 6;
const TAG_START_NUMBERED = 12;
/** How far a figure's badges stand above it. */
const BADGE_LIFT = 4;

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
  /**
   * The label's block: its box (one line high per line, the lines `line` apart) and the lines as
   * drawn, wrapped at the room between the lifelines or, on a self-call, broken at `\n` only.
   */
  readonly label: { box: Box; lines: readonly string[]; line: number } | undefined;
  readonly number: number | null;
  /** The pills of the message's tags, in source order. */
  readonly tags: readonly Box[];
}

interface FrameGeo {
  readonly key: string;
  readonly event: FragmentEvent;
  readonly box: Box;
  readonly headerHeight: number;
  readonly separators: { y: number; condition: string | null }[];
}

interface Bar {
  /** The key of the `activate` that opens the bar, or of the call whose block draws it. */
  readonly key: string;
  readonly participant: string;
  readonly depth: number;
  readonly top: number;
  bottom: number;
  /** The key of the `deactivate` that closes the bar, once it is read. */
  to: string | null;
  /** Whether a call's block draws the bar. */
  readonly block: boolean;
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
  // A message label is in the body font at weight 400 and the relation label size, broken at `\n`.
  // Between two lifelines it holds its columns apart on one line, and wraps at the room they leave
  // it when a pull brings them closer; a self-call's stays beside its loop. Its lines are 1.25
  // times the size apart, as a sticky's are.
  const measureLabel = (line: string) => metrics.width(line, "body", 400, scale.relationLabel);
  const labelStep = scale.relationLabel * 1.25;
  /** The widest word of a label, words split at spaces and line breaks: the least room it needs. */
  const longestWord = (relation: Relation) =>
    relation.label === null ? 0 : Math.max(0, ...relation.label.split(/[ \n]+/).map(measureLabel));
  /** The widest line of a label broken at `\n` only: the room it takes unwrapped. */
  const lineWidth = (relation: Relation) =>
    relation.label === null ? 0 : Math.max(0, ...splitLines(relation.label).map(measureLabel));
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
  // Tags are the flow tag's pills, `tagHeight` high, in rows 4 apart: a message's on its arrow
  // next to its source end, a participant's over its head as badges.
  const tagHeight = scale.tagHeight;
  const pillWidths = (tags: readonly TagUse[]) =>
    tags.map((tag) => tagPillWidth(metrics, scale, tag.text));
  /** The width of a row of pills, nothing when there are no tags. */
  const rowWidth = (tags: readonly TagUse[]) => {
    const pills = pillWidths(tags);
    return pills.length === 0
      ? 0
      : pills.reduce((sum, w) => sum + w, 0) + (pills.length - 1) * TAG_GAP;
  };
  /** Boxes of a row of pills from `x`, centred on `y`. */
  const pillRow = (tags: readonly TagUse[], x: number, y: number): Box[] => {
    let left = x;
    return pillWidths(tags).map((width) => {
      const box = { x: left, y: y - tagHeight / 2, width, height: tagHeight };
      left += width + TAG_GAP;
      return box;
    });
  };
  /** The length of the head a message draws at its source end: two-way messages draw one. */
  const startHeadRoom = (relation: Relation) =>
    messageHeads(relation, styles.relation(relation)).start !== "none" ? theme.arrowSize : 0;
  // A message's row starts 6 from its arrow's start, 12 beside its number's disc, and past the
  // head a two-way message draws there.
  const tagStart = (relation: Relation) =>
    (numbered ? TAG_START_NUMBERED : TAG_START) + startHeadRoom(relation);
  /** The loop of a self-call: wide enough for its row of tags on its top segment. */
  const loopWidth = (relation: Relation) =>
    relation.tags.length === 0
      ? SELF_WIDTH
      : Math.max(SELF_WIDTH, tagStart(relation) + rowWidth(relation.tags) + TAG_START);
  // A head counts as the wider of itself and its badges where heads may not touch.
  const extents = participants.map((p, i) => Math.max(widths[i]!, rowWidth(p.tags)));
  // The badges stand over the heads: the row of heads starts lower by the room they need above
  // it, a box kind's with their middle on its box's top edge, a figure's 4 above the figure.
  const boxTop = headHeight - boxHeight;
  const figureTop = headHeight - figureHeight - 6 - labelLine;
  /** The room a head's badges need above its cell: none without tags. */
  const badgeNeed = (p: Element) =>
    p.tags.length === 0
      ? 0
      : Math.max(
          0,
          BOX_KINDS.has(p.kind) ? tagHeight / 2 - boxTop : tagHeight + BADGE_LIFT - figureTop,
        );
  const badgeRoom = Math.max(0, ...participants.map(badgeNeed));
  // `space` above (before) or below (after) an event; `gap` left (before) or right (after) of a
  // participant, both sides of a pair adding up.
  const spaces = new Map<string, number>();
  const spacesAfter = new Map<string, number>();
  const gapsBefore = new Map<string, GapEntry>();
  const gapsAfter = new Map<string, GapEntry>();
  const labelEntries = new Map<string, LabelEntry>();
  for (const entry of diagram.placement) {
    if (entry.statement === "space") {
      (entry.side === "after" ? spacesAfter : spaces).set(entry.target, entry.amount);
    } else if (entry.statement === "gap") {
      (entry.side === "after" ? gapsAfter : gapsBefore).set(entry.target, entry);
    } else if (entry.statement === "label") labelEntries.set(entry.target, entry);
  }
  const gapBefore = (id: string) => gapsBefore.get(id)?.amount ?? 0;
  const gapAfter = (id: string) => gapsAfter.get(id)?.amount ?? 0;
  const baseKey = (key: string) => key.replace(/@\d+$/, "").replace(/@\d+$/, "");

  // ---------------------------------------------------------------- columns
  // Two passes (decision 0065, D1-D2). The natural columns come first: half of each head, the
  // `spacing` (40 scaled with the theme's labels when none is written, and never less there) and
  // the two `gap`s of a pair when their sum is positive, pushed apart by every message label on
  // one line, the rows of tags, self-calls and side notes. A pull then brings a pair closer than
  // its natural distance by its amount: a negative sum of its two `gap`s, and a `spacing` below
  // the default by the difference. It stops at the pair's floor: the two half heads (or their rows
  // of badges, when wider) and HEAD_CLEARANCE, so heads never touch, and the longest word of every
  // label between them, which wraps at the room it is left.
  const defaultSpacing = Math.round(40 * f);
  const spacing = diagram.properties.spacing ?? defaultSpacing;
  const base = Math.max(spacing, defaultSpacing);
  const spacingPull = Math.min(0, spacing - defaultSpacing);
  const halves = (i: number) => widths[i - 1]! / 2 + widths[i]! / 2;
  const floor = (i: number) => extents[i - 1]! / 2 + extents[i]! / 2 + HEAD_CLEARANCE;
  const gapSum = (i: number) => gapAfter(participants[i - 1]!.id) + gapBefore(participants[i]!.id);
  /** A pair's written distance before the labels push it: positive gaps only. */
  const written = (i: number) => halves(i) + base + Math.max(0, gapSum(i));
  /** How much closer than its natural distance a pair is asked to be: 0 or less. */
  const pull = (i: number) => Math.min(0, gapSum(i)) + spacingPull;
  // Room left of the first participant, and right of the last, never less than nothing.
  const outerBefore = participants.length > 0 ? Math.max(0, gapBefore(participants[0]!.id)) : 0;
  const outerAfter =
    participants.length > 0 ? Math.max(0, gapAfter(participants[participants.length - 1]!.id)) : 0;
  type Constraint = { a: number; b: number; length: number };
  // What holds the natural columns apart (each label on one line), and what holds the pulled ones
  // (each label's longest word); self-calls, notes and rows of tags hold both.
  const natural: Constraint[] = [];
  const floors: Constraint[] = [];
  const both = (constraint: Constraint) => {
    natural.push(constraint);
    floors.push(constraint);
  };
  let leftExtra = 0;
  let rightExtra = 0;
  /**
   * What a creating message (the message right after the `create` of its receiver) leaves out of
   * the distance between the columns: its arrow ends on the near edge of the head it draws, half
   * that head short of the receiver's column. Nothing for any other message.
   */
  const madeHead = (relation: Relation, before: SequenceEvent | undefined) =>
    before?.kind === "create" && before.participant === relation.to && relation.from !== relation.to
      ? widths[column.get(relation.to)!]! / 2
      : 0;
  const walk = (list: readonly SequenceEvent[]) => {
    for (const [index, event] of list.entries()) {
      if (event.kind === "message") {
        const relation = diagram.relationsByKey.get(event.relation);
        if (!relation) continue;
        const a = column.get(relation.from)!;
        const b = column.get(relation.to)!;
        if (a === b) {
          const length = loopWidth(relation) + lineWidth(relation) + discRoom + 16;
          if (a < participants.length - 1) {
            both({ a, b: a + 1, length: length + widths[a + 1]! / 2 });
          } else rightExtra = Math.max(rightExtra, length);
        } else {
          // The label on one line holds the natural pair apart, its longest word a pulled one;
          // the row of its tags holds both, with the disc and the arrowhead beside it. Each counts
          // along the arrow, which a creating message ends on the head it draws.
          const made = madeHead(relation, list[index - 1]);
          const row = rowWidth(relation.tags);
          const tagged =
            row > 0 ? row + 24 + discRoom + theme.arrowSize + startHeadRoom(relation) + made : 0;
          const pair = { a: Math.min(a, b), b: Math.max(a, b) };
          natural.push({
            ...pair,
            length: Math.max(lineWidth(relation) + discRoom + 24 + made, tagged),
          });
          floors.push({
            ...pair,
            length: Math.max(longestWord(relation) + 24 + discRoom + made, tagged),
          });
        }
        walk(event.events);
      } else if (event.kind === "note") {
        const size = noteSize(event);
        const indices = event.participants.map((p) => column.get(p)!).sort((x, y) => x - y);
        const i = indices[0]!;
        const j = indices[indices.length - 1]!;
        if (event.position === "over" && i === j) {
          if (i > 0) both({ a: i - 1, b: i, length: size.width / 2 + widths[i - 1]! / 2 + 10 });
          else leftExtra = Math.max(leftExtra, size.width / 2 - widths[i]! / 2);
          if (i < participants.length - 1) {
            both({ a: i, b: i + 1, length: size.width / 2 + widths[i + 1]! / 2 + 10 });
          } else rightExtra = Math.max(rightExtra, size.width / 2 - widths[i]! / 2);
        } else if (event.position === "over") {
          both({ a: i, b: j, length: size.width - 48 });
        } else if (event.position === "left") {
          if (i > 0) both({ a: i - 1, b: i, length: size.width + 20 + widths[i - 1]! / 2 });
          else leftExtra = Math.max(leftExtra, size.width + 20 - widths[i]! / 2);
        } else if (i < participants.length - 1) {
          both({ a: i, b: i + 1, length: size.width + 20 + widths[i + 1]! / 2 });
        } else rightExtra = Math.max(rightExtra, size.width + 20 - widths[i]! / 2);
      } else if (event.kind === "fragment") {
        for (const branch of event.branches) walk(branch.events);
      }
    }
  };
  walk(events);
  /**
   * Pushes the right column of every constraint, and everything after it, as far as it needs
   * beyond `slack`.
   */
  const push = (xs: number[], constraints: Constraint[], slack: number) => {
    constraints.sort((p, q) => p.b - q.b || p.a - q.a);
    for (const { a, b, length } of constraints) {
      const deficit = length - (xs[b]! - xs[a]!);
      if (deficit > slack) for (let k = b; k < xs.length; k++) xs[k] = xs[k]! + deficit;
    }
  };
  const naturalXs: number[] = [];
  participants.forEach((_p, i) => {
    naturalXs[i] =
      i === 0 ? widths[0]! / 2 + outerBefore : naturalXs[i - 1]! + Math.max(written(i), floor(i));
  });
  push(naturalXs, natural, 0);
  /** The natural distance of the pair left of column `i`. */
  const naturalDistance = (i: number) => naturalXs[i]! - naturalXs[i - 1]!;
  // The pulled columns: each pair closer by its pull, down to its heads' floor, then pushed by
  // the longest words, the rows of tags, self-calls and notes. A pair without a pull keeps its
  // natural distance exactly.
  const xs: number[] = [];
  let shift = 0;
  participants.forEach((_p, i) => {
    if (i > 0 && pull(i) < 0) shift += Math.max(pull(i), floor(i) - naturalDistance(i));
    xs[i] = naturalXs[i]! + shift;
  });
  // The natural columns already hold every floor: rounding is no deficit.
  push(xs, floors, ROUNDING);
  /** Whether a pull brings any pair between columns `a` and `b` closer: their labels wrap. */
  const pulled = (a: number, b: number) => {
    for (let i = Math.min(a, b) + 1; i <= Math.max(a, b); i++) if (pull(i) < 0) return true;
    return false;
  };
  // A negative gap that the floor kept from being drawn, measured from the natural distance, is
  // said on the statement (the `before` one when both sides are written).
  for (let i = 1; i < participants.length; i++) {
    const after = gapsAfter.get(participants[i - 1]!.id);
    const before = gapsBefore.get(participants[i]!.id);
    const sum = (after?.amount ?? 0) + (before?.amount ?? 0);
    const distance = xs[i]! - xs[i - 1]!;
    if (sum >= 0 || distance <= naturalDistance(i) + pull(i) + ROUNDING) continue;
    const entry = before ?? after!;
    const other = entry === before ? (after?.amount ?? 0) : (before?.amount ?? 0);
    // `+ 0` writes a drawn 0 as 0, never -0.
    const applied = Math.round(distance - naturalDistance(i) - other - spacingPull) + 0;
    diagnostics.push({
      code: "layout.gap-floor",
      severity: "warning",
      message: words().diagnostics.gapFloor(
        entry.target,
        entry.side,
        entry.amount,
        applied,
        participants[i - 1]!.id,
        participants[i]!.id,
      ),
      range: entry.range,
      data: {
        gap: { participant: entry.target, side: entry.side, written: entry.amount, applied },
      },
    });
  }

  // ---------------------------------------------------------------- rows
  const groupTitle = groups.length > 0 ? labelLine + 12 : 0;
  const rowGap = Math.round(14 * f);
  const labelHeight = scale.relationLabelHeight;
  // The heads' row, below the groups' titles and the room of the badges over the heads.
  const headTop = groupTitle + badgeRoom;
  let y = headTop + headHeight + Math.round(24 * f);
  const lifelines = new Map<string, Lifeline>();
  for (const p of participants) {
    lifelines.set(p.id, {
      participant: p.id,
      x: xs[column.get(p.id)!]!,
      top: headTop + headHeight,
      bottom: null,
    });
  }
  const created = new Map<string, number>();
  const heads = new Map<string, Box>();
  const messages: MessageGeo[] = [];
  const messageTexts = new Map<string, MessageText>();
  const tags = new Map<string, readonly Box[]>();
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
      // `space … after` is room below the event's row, which the row itself does not hold.
      try {
        switch (event.kind) {
          case "message": {
            const relation = diagram.relationsByKey.get(event.relation);
            if (!relation) break;
            const a = relation.from;
            const b = relation.to;
            number += numbered ? 1 : 0;
            const text = relation.label ?? "";
            const self = a === b;
            // The room of a label between two lifelines: the length of its arrow (the distance
            // between them, less half the head a creating message ends on), less 12 on each side
            // and the disc. At the natural distance it holds the label on one line; a pull may
            // leave it less, down to the longest word, and the label wraps there.
            const made = self ? 0 : madeHead(relation, list[index - 1]);
            const room = self
              ? 0
              : Math.max(
                  1,
                  Math.abs(xs[column.get(b)!]! - xs[column.get(a)!]!) - made - 24 - discRoom,
                );
            const wraps = !self && pulled(column.get(a)!, column.get(b)!);
            const lines =
              text === ""
                ? []
                : self || lineWidth(relation) <= room + ROUNDING
                  ? splitLines(text)
                  : wrapLines(text, room, measureLabel);
            // The block of lines: one label line high, and a step more for each line after it.
            const block = labelHeight + Math.max(0, lines.length - 1) * labelStep;
            // A message's tags sit on its arrow: its label stands higher by half a pill and 2, and
            // its row is that much taller, so that a wrapped label never meets them.
            const lift = relation.tags.length > 0 && !self ? tagHeight / 2 + 2 : 0;
            const loop = self ? loopWidth(relation) : SELF_WIDTH;
            let points: Point[];
            let arrowY: number;
            if (self) {
              // The lines are centred on the loop's middle: the row grows when they are taller.
              const over = Math.max(0, (block - SELF_HEIGHT) / 2);
              const top = y + Math.max(labelHeight, over + 3);
              const x0 = edge(a, 1);
              points = [
                { x: x0, y: top },
                { x: x0 + loop, y: top },
                { x: x0 + loop, y: top + SELF_HEIGHT },
                { x: x0, y: top + SELF_HEIGHT },
              ];
              arrowY = top;
              y = top + SELF_HEIGHT + over + rowGap;
            } else {
              const createdHead = created.get(b);
              const dir: -1 | 1 = xs[column.get(b)!]! > xs[column.get(a)!]! ? 1 : -1;
              if (createdHead !== undefined && createdHead < 0) {
                // The creating message ends on the new head, drawn at this row, lower by the
                // label's lines after the first, the lift of its tags and the room of the head's
                // own badges.
                const element = diagram.elementsById.get(b)!;
                const top = y + 4 + (block - labelHeight) + lift + badgeNeed(element);
                const head = headBoxAt(element, top);
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
                // The arrow under the label's last line: the label keeps its top.
                arrowY = y + block + 4 + lift;
                points = [
                  { x: edge(a, dir), y: arrowY },
                  { x: edge(b, dir === 1 ? -1 : 1), y: arrowY },
                ];
                y = arrowY + rowGap;
              }
            }
            // The block sits as a one-line label does: its bottom just above the arrow, centred at
            // `at` along it, or beside a self-call's loop. `label … offset` moves the block, not
            // the room it wraps in.
            const entry = relation.id ? labelEntries.get(relation.id) : undefined;
            const first = points[0]!;
            const lastPoint = points[points.length - 1]!;
            const at = entry ? entry.at / 100 : 0.5;
            const offset = entry?.offset ?? { x: 0, y: 0 };
            const width = Math.max(Math.max(0, ...lines.map(measureLabel)) + 8, 8);
            const anchor = self
              ? { x: first.x + loop + 8 + width / 2, y: first.y + SELF_HEIGHT / 2 }
              : { x: first.x + (lastPoint.x - first.x) * at, y: arrowY - block / 2 - 1 - lift };
            const box: Box = {
              x: anchor.x - width / 2 + offset.x,
              y: anchor.y - block / 2 + offset.y,
              width,
              height: block,
            };
            const label: MessageGeo["label"] =
              text !== "" || numbered ? { box, lines, line: labelStep } : undefined;
            messageTexts.set(event.key, {
              area: self
                ? box
                : { x: box.x + box.width / 2 - room / 2, y: box.y, width: room, height: block },
              lines,
              size: scale.relationLabel,
              line: labelStep,
              wraps,
            });
            // The row of tags on the arrow, its end nearest the source `tagStart` from the
            // arrow's start: rightwards from it, or leftwards on a message from right to left.
            const row = rowWidth(relation.tags);
            const toRight = self || lastPoint.x >= first.x;
            const pills = pillRow(
              relation.tags,
              toRight ? first.x + tagStart(relation) : first.x - tagStart(relation) - row,
              first.y,
            );
            if (pills.length > 0) tags.set(event.key, pills);
            messages.push({
              key: event.key,
              relation,
              points,
              self,
              label,
              number: numbered ? number : null,
              tags: pills,
            });
            const xsOf = [...points.map((p) => p.x), ...pills.flatMap((b) => [b.x, b.x + b.width])];
            extend(
              Math.min(...xsOf) - 8,
              Math.max(...xsOf, label ? label.box.x + label.box.width : -Infinity) + 8,
            );
            last = { participants: new Set([a, b]), y: a === b ? points[3]!.y : arrowY };
            rows.set(event.key, { y: start, height: y - start });
            if (event.events.length > 0) {
              // The receiver is active for the call's block: a bar from the arrow to the block's
              // last event, which moves the ends of the nested messages to its edge.
              const stack = stacks.get(b) ?? [];
              const top = last.y;
              const bar: Bar = {
                key: event.key,
                participant: b,
                depth: stack.length,
                top,
                bottom: top,
                to: null,
                block: true,
              };
              stack.push(bar);
              stacks.set(b, stack);
              bars.push(bar);
              process(event.events);
              (stacks.get(b) ?? []).pop();
              const bottom = last && last.participants.has(b) ? last.y : y;
              bar.bottom = Math.max(bottom, bar.top + 12);
            }
            continue;
          }
          case "activate": {
            const top = last && last.participants.has(event.participant) ? last.y : y;
            const stack = stacks.get(event.participant) ?? [];
            const bar: Bar = {
              key: event.key,
              participant: event.participant,
              depth: stack.length,
              top,
              bottom: top,
              to: null,
              block: false,
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
            if (bar) {
              bar.bottom = Math.max(bottom, bar.top + 12);
              bar.to = event.key;
            }
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
              // A created head takes the room of its badges above it, as the heads' row does.
              const element = diagram.elementsById.get(event.participant)!;
              const top = y + 4 + badgeNeed(element);
              heads.set(event.participant, headBoxAt(element, top));
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
      } finally {
        y += spacesAfter.get(baseKey(event.key)) ?? 0;
      }
    }
  };
  process(events);
  const end = y + 8;
  for (const bar of bars) if (bar.bottom === bar.top) bar.bottom = Math.max(end, bar.top + 12);
  for (const stack of stacks.values())
    for (const bar of stack) bar.bottom = Math.max(bar.bottom, end);
  for (const p of participants) {
    if (!heads.has(p.id)) heads.set(p.id, headBoxAt(p, headTop));
    const line = lifelines.get(p.id)!;
    if (line.bottom === null) line.bottom = end;
  }
  // A participant's badges: a row centred on its head, a box kind's with their middle on the top
  // edge of its (front) box, a figure's 4 above the figure.
  const badges = new Map<string, readonly Box[]>();
  for (const p of participants) {
    if (p.tags.length === 0) continue;
    const cell = heads.get(p.id)!;
    const middle = BOX_KINDS.has(p.kind)
      ? cell.y + boxTop
      : cell.y + figureTop - BADGE_LIFT - tagHeight / 2;
    badges.set(p.id, pillRow(p.tags, cell.x + cell.width / 2 - rowWidth(p.tags) / 2, middle));
  }
  /** A bar's rectangle on its lifeline, nested bars stepping right. */
  const barBox = (bar: Bar): Box => ({
    x: xs[column.get(bar.participant)!]! - BAR / 2 + bar.depth * BAR_STEP,
    y: bar.top,
    width: BAR,
    height: bar.bottom - bar.top,
  });
  const groupBoxes = new Map<string, Box>();
  for (const group of groups) {
    const members = participants.filter((p) => p.groupPath.includes(group.id));
    // A group holds its members' heads and their badges.
    const boxes = members.flatMap((m) => [heads.get(m.id)!, ...(badges.get(m.id) ?? [])]);
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
  const leftmost = xs.length > 0 ? xs[0]! - widths[0]! / 2 - outerBefore - leftExtra : 0;
  const rightmost =
    xs.length > 0
      ? xs[xs.length - 1]! + widths[widths.length - 1]! / 2 + rightExtra + outerAfter
      : 0;
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
    ...[...badges.values()].flat(),
    ...[...tags.values()].flat(),
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
        bars
          .filter((b) => b.participant === p.id)
          .map((bar) => ({ key: bar.key, depth: bar.depth, box: barBox(bar) })),
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
    items.push(
      emit.head(
        p,
        cell,
        drawnHead(p, cell),
        boxHeight,
        figureHeight,
        labelLine,
        badges.get(p.id) ?? [],
      ),
    );
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
  // Every bar by the key of its `activate`, or of the call whose block draws it; a written bar is
  // also a box, which editors select and outline.
  const barGeometry = new Map<string, BarGeometry>();
  for (const bar of bars) {
    const box = barBox(bar);
    barGeometry.set(bar.key, {
      participant: bar.participant,
      box,
      depth: bar.depth,
      from: bar.key,
      to: bar.to,
      block: bar.block,
    });
    if (!bar.block) boxes.set(bar.key, box);
  }
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
      ...(theme.sketch !== "none" ? { sketch: theme.sketch } : {}),
    },
    diagnostics,
    boxes,
    offset: { x: dx, y: dy },
    labels,
    messageTexts,
    bars: barGeometry,
    // The participants' badges, then the messages' pills.
    tags: new Map([...badges, ...tags]),
    connectors,
    origins: new Map(),
    theme,
    events: rows,
    shapes,
    radii,
  };
}

/**
 * The heads a message draws: calls a filled one, replies and async calls an open one, two-way
 * messages one at both ends; styles replace either.
 */
function messageHeads(
  relation: Relation,
  style: ResolvedStyle,
): { readonly start: ArrowheadKind; readonly end: ArrowheadKind } {
  const end =
    style.arrowhead ??
    (relation.heads === "none"
      ? "none"
      : relation.line === "dashed" || relation.async
        ? "open"
        : "triangle");
  return { start: style.arrowtail ?? (relation.heads === "both" ? end : "none"), end };
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

  /**
   * A participant's lifeline and its activation bars, each bar its own group of role `event` with
   * the key of its `activate` (or of the call whose block draws it) and its box as bounds.
   */
  lifeline(
    participant: Element,
    line: Lifeline,
    bars: readonly { key: string; depth: number; box: Box }[],
    x: number,
  ): GroupItem {
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
      items.push({
        kind: "group",
        id: bar.key,
        role: "event",
        items: [
          this.rect(
            bar.box,
            0,
            style.fill ?? theme.surface,
            style.stroke ?? theme.muted,
            theme.strokeWidth,
          ),
        ],
        bounds: this.bounds(bar.box, 0),
      });
    }
    return { kind: "group", id: participant.id, role: "lifeline", items };
  }

  /**
   * A participant's head in its row's cell `head`; `drawn` is the box it is drawn in, which the
   * group carries as its bounds. Its badges, the pills of its tags, are drawn over it.
   */
  head(
    participant: Element,
    head: Box,
    drawn: Box,
    boxHeight: number,
    figureHeight: number,
    labelLine: number,
    badges: readonly Box[],
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
    items.push(...this.tags(participant.id, participant.tags, badges));
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
    const heads = messageHeads(relation, style);
    const arrow = relationEnds(
      message.points,
      heads.start,
      heads.end,
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
    if (message.label && message.label.lines.length > 0) {
      // One text a line, centred, the first where a one-line label is drawn.
      const { box, lines, line } = message.label;
      items.push({
        kind: "group",
        id: message.key,
        role: "label",
        items: lines.map((text, i) =>
          this.text(
            box.x + box.width / 2,
            box.y + scale.relationLabelHeight / 2 + i * line,
            text,
            scale.relationLabel,
            400,
            style.color ?? theme.ink,
          ),
        ),
      });
    }
    // The pills of its tags, over the arrow and after the label, so that particles run under both.
    items.push(...this.tags(message.key, relation.tags, message.tags));
    return {
      kind: "group",
      id: message.key,
      role: "relation",
      items,
      track: arrow.line.map((q) => this.p(q)),
    };
  }

  /**
   * The pills of an owner's tags in their boxes, each a group of role `tag` with the owner's id or
   * key and its index: the flow tag's pill in the theme's `tag` and `tagText`.
   */
  private tags(owner: string, tags: readonly TagUse[], boxes: readonly Box[]): GroupItem[] {
    const { theme } = this;
    return boxes.map((box, index) => {
      const { outline, label } = tagPill(
        this.metrics,
        this.scale,
        this.box(box),
        tags[index]!.text,
        {
          fill: theme.tag,
          stroke: theme.tag,
          strokeWidth: theme.strokeWidth,
          dashed: false,
          color: theme.tagText,
        },
      );
      return { kind: "group", id: owner, role: "tag", tag: index, items: [outline, label] };
    });
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
