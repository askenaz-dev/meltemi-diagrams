import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  TextMetrics,
  THEMES,
  estimateMeasurer,
  layoutDiagram,
  type GroupItem,
  type LayoutOptions,
  type LayoutResult,
  type Scene,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

function run(body: string, options: LayoutOptions = {}) {
  const compilation = compile(
    `theme plain {\n  extends "technical.light"\n  frame none\n}\n\ndiagram s: sequence {\n  theme "plain"\n${body}\n}\n`,
  );
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, options);
  expect(result.scene).not.toBeNull();
  return result;
}

function groups(scene: Scene, role: string): GroupItem[] {
  return scene.items.filter((i): i is GroupItem => i.kind === "group" && i.role === role);
}

function texts(items: readonly SceneItem[]): string[] {
  return items.flatMap((i) =>
    i.kind === "text" ? [i.text] : i.kind === "group" ? texts(i.items) : [],
  );
}

const LIGHT = THEMES["technical.light"]!;
const metrics = new TextMetrics(estimateMeasurer, LIGHT);
/** The width of a message label's line, as the layout measures it under technical.light. */
const labelWidth = (text: string) => metrics.width(text, "body", 400, LIGHT.relationLabelSize);

/** The text items of a message's label group, in drawing order. */
function labelItems(result: LayoutResult, key: string): TextItem[] {
  const message = groups(result.scene!, "relation").find((g) => g.id === key)!;
  const label = message.items.find((i): i is GroupItem => i.kind === "group" && i.role === "label");
  return (label?.items ?? []).filter((i): i is TextItem => i.kind === "text");
}

const labelLines = (result: LayoutResult, key: string) =>
  labelItems(result, key).map((t) => t.text);

/** The bars of a participant's lifeline: its groups of role `event`, each holding one rectangle. */
function barGroups(scene: Scene, participant: string): GroupItem[] {
  return groups(scene, "lifeline")
    .find((g) => g.id === participant)!
    .items.filter((i): i is GroupItem => i.kind === "group" && i.role === "event");
}

/** The rectangles of a participant's bars, in drawing order. */
const barRects = (scene: Scene, participant: string) =>
  barGroups(scene, participant).flatMap((g) => g.items.filter((i) => i.kind === "rect"));

describe("an empty diagram", () => {
  it("lays out with a finite size, as a new diagram has no participant yet", () => {
    const result = run("");
    expect(Number.isFinite(result.scene!.width)).toBe(true);
    expect(Number.isFinite(result.scene!.height)).toBe(true);
    expect(JSON.stringify(result.scene)).not.toContain("NaN");
    // With the frame, the title still sets the width.
    const framed = layoutDiagram(
      compile('diagram s: sequence {\n  title "checkout"\n}\n'),
      compile('diagram s: sequence {\n  title "checkout"\n}\n').document.diagrams[0]!,
    );
    expect(JSON.stringify(framed.scene)).not.toContain("NaN");
  });
});

describe("columns", () => {
  it("orders participants as declared and keeps a long word of a label between them", () => {
    const word = "Authorization_with_a_long_identifier";
    const result = run(`  participant a "A"\n  participant b "B"\n  a -> b: "${word}" as m`);
    const a = result.boxes!.get("a")!;
    const b = result.boxes!.get("b")!;
    expect(a.x).toBeLessThan(b.x);
    const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
    expect(centre(b) - centre(a)).toBeGreaterThan(labelWidth(word) + 24 - 1e-9);
    // The word is drawn whole, on one line.
    expect(labelLines(result, "m")).toEqual([word]);
  });

  it("adds a gap before a participant", () => {
    const plain = run("  a -> b").boxes!.get("b")!.x;
    const gapped = run("  a -> b\n  placement { gap b 40 }").boxes!.get("b")!.x;
    expect(gapped - plain).toBe(40);
  });

  const centre = (result: ReturnType<typeof run>, id: string) => {
    const box = result.boxes!.get(id)!;
    return box.x + box.width / 2;
  };
  const apart = (result: ReturnType<typeof run>, a: string, b: string) =>
    centre(result, b) - centre(result, a);

  it("moves every pair by spacing, written in diagram units", () => {
    const body = "  a -> b\n  b -> c";
    const plain = run(body);
    const wide = run(`  spacing 56\n${body}`);
    expect(apart(wide, "a", "b") - apart(plain, "a", "b")).toBe(16);
    expect(apart(wide, "b", "c") - apart(plain, "b", "c")).toBe(16);
  });

  it("adds the two sides of a pair, and a gap after the last participant is room at the right", () => {
    const body = "  a -> b\n  b -> c";
    const plain = run(body);
    const both = run(`${body}\n  placement {\n    gap a 10 after\n    gap b 20\n  }`);
    expect(apart(both, "a", "b") - apart(plain, "a", "b")).toBe(30);
    const after = run(`${body}\n  placement { gap c 50 after }`);
    expect(after.scene!.width - plain.scene!.width).toBe(50);
    expect(apart(after, "a", "c")).toBe(apart(plain, "a", "c"));
  });

  it("draws a gap before the first participant as room at the left", () => {
    const plain = run("  a -> b");
    const before = run("  a -> b\n  placement { gap a 30 }");
    expect(before.scene!.width - plain.scene!.width).toBe(30);
    expect(apart(before, "a", "b")).toBe(apart(plain, "a", "b"));
  });

  it("brings two participants closer with a negative gap, without a warning while it fits", () => {
    const plain = run("  a -> b");
    const tight = run("  a -> b\n  placement { gap b -20 }");
    expect(apart(plain, "a", "b") - apart(tight, "a", "b")).toBe(20);
    expect(tight.diagnostics.filter((d) => d.code === "layout.gap-floor")).toEqual([]);
  });

  it("keeps the floor over a negative gap and says what it drew", () => {
    const result = run('  a -> b: "A rather long message label"\n  placement { gap b -200 }');
    const [floor, ...rest] = result.diagnostics.filter((d) => d.code === "layout.gap-floor");
    expect(rest).toEqual([]);
    expect(floor!.severity).toBe("warning");
    expect(floor!.message).toMatch(/^The gap before `b` is -?\d+ here, not -200: /);
    // The heads never touch: half of each head and the clearance at least.
    const a = result.boxes!.get("a")!;
    const b = result.boxes!.get("b")!;
    expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(8);
  });

  const LONG = "Esto es una prueba de un texto Largo";

  it("lets a negative gap bring a pair closer past a long label, which wraps between them", () => {
    const loose = run(`  a -> b: "${LONG}" as m`);
    const tight = run(`  a -> b: "${LONG}" as m\n  placement { gap b -20 }`);
    // Without the gap the label holds the pair apart on one line: its natural distance.
    expect(apart(loose, "a", "b")).toBeCloseTo(labelWidth(LONG) + 24, 6);
    expect(labelLines(loose, "m")).toEqual([LONG]);
    // The gap is taken from that distance, not from the heads'.
    expect(apart(loose, "a", "b") - apart(tight, "a", "b")).toBeCloseTo(20, 6);
    expect(labelLines(tight, "m").length).toBeGreaterThan(1);
    expect(tight.diagnostics).toEqual([]);
  });

  it("pulls a labelled pair closer with a spacing below the default, the label wrapping", () => {
    const loose = run(`  a -> b: "${LONG}" as m`);
    const small = run(`  spacing 20\n  a -> b: "${LONG}" as m`);
    expect(apart(loose, "a", "b") - apart(small, "a", "b")).toBeCloseTo(40 - 20, 6);
    expect(labelLines(loose, "m")).toEqual([LONG]);
    expect(labelLines(small, "m").length).toBeGreaterThan(1);
    expect(small.diagnostics).toEqual([]);
    // A pair that no label pushes ends at the heads and the spacing, as it always did.
    expect(apart(run("  spacing 20\n  a -> b"), "a", "b")).toBe(96 + 20);
  });

  it("tells editors which labels a pull caps, and which hold their pair on one line", () => {
    const result = run(
      `  a -> b: "${LONG}" as m\n  b -> c: "${LONG}" as n\n  a -> c: "Across" as across\n  c -> c: "${LONG}" as self\n  placement { gap b -20 }`,
    );
    const wraps = (key: string) => result.messageTexts!.get(key)!.wraps;
    // `a`-`b` is pulled: the label between them and the one across it wrap at their room.
    expect(wraps("m")).toBe(true);
    expect(wraps("across")).toBe(true);
    // `b`-`c` is at its natural distance, and a self-call never wraps.
    expect(wraps("n")).toBe(false);
    expect(wraps("self")).toBe(false);
    expect(labelLines(result, "n")).toEqual([LONG]);
    expect(labelLines(result, "across")).toEqual(["Across"]);
  });

  it("lets the floor win when even the longest word does not fit, and says what it drew", () => {
    const word = "Authorization_with_a_long_identifier";
    const result = run(`  a -> b: "${word}"\n  placement { gap b -60 }`);
    expect(apart(result, "a", "b")).toBeCloseTo(labelWidth(word) + 24, 6);
    const floor = result.diagnostics.filter((d) => d.code === "layout.gap-floor");
    expect(floor).toHaveLength(1);
    // The amount drawn is measured from the natural distance, where the word held the pair.
    const natural = apart(run(`  a -> b: "${word}"`), "a", "b");
    const applied = Math.round(apart(result, "a", "b") - natural);
    expect(applied).toBe(0);
    expect(floor[0]!.data).toMatchObject({ gap: { participant: "b", written: -60, applied } });
    expect(floor[0]!.message).toContain(`is ${applied} here, not -60`);
  });

  it("holds a pair apart by the row of a message's tags, with the arrowhead, and says so", () => {
    const result = run(
      '  a -> b: "Go" as go {\n    tag "idempotent"\n    tag "retry-safe"\n  }\n  placement { gap b -60 }',
    );
    const pills = result.tags!.get("go")!;
    const row = pills.at(-1)!.x + pills.at(-1)!.width - pills[0]!.x;
    expect(apart(result, "a", "b")).toBeGreaterThanOrEqual(row + 24 + LIGHT.arrowSize - 1e-9);
    const floor = result.diagnostics.filter((d) => d.code === "layout.gap-floor");
    expect(floor).toHaveLength(1);
    expect(floor[0]!.data).toMatchObject({ gap: { participant: "b", written: -60 } });
    // The row stays between the two ends, clear of the arrowhead.
    const end = result.connectors!.get("go")!.points.at(-1)!.x;
    expect(pills.at(-1)!.x + pills.at(-1)!.width).toBeLessThanOrEqual(end - LIGHT.arrowSize);
  });

  it("keeps heads apart by their rows of badges when those are wider than the heads", () => {
    const body = (tags: string) =>
      `  spacing 0\n  participant a "A"${tags}\n  participant b "B"${tags}\n  a -> b\n  placement { gap b -200 }`;
    const result = run(body(' { tag "a-rather-long-badge" }'));
    const [left, right] = [result.tags!.get("a")![0]!, result.tags!.get("b")![0]!];
    expect(left.width).toBeGreaterThan(result.boxes!.get("a")!.width);
    // Half of each row and the clearance, as half of each head and the clearance without them.
    expect(right.x - (left.x + left.width)).toBeCloseTo(8, 6);
    const plain = run(body(""));
    expect(plain.boxes!.get("b")!.x - (plain.boxes!.get("a")!.x + 96)).toBe(8);
  });

  it("brings the owner's participant where its gap puts it, across a lifeline, the label wrapped", () => {
    // An actor sends a long label to a participant two columns away; the gap tightens the pair on
    // its right. The label no longer holds the participant: only its longest word could.
    const body = `  actor customer "Customer"\n  actor clerk "Clerk"\n  participant participant1 "Participant 1"\n  customer -> participant1: "${LONG}" as test`;
    const plain = run(body);
    const tight = run(`${body}\n  placement { gap participant1 -24 }`);
    expect(labelLines(plain, "test")).toEqual([LONG]);
    expect(apart(plain, "clerk", "participant1") - apart(tight, "clerk", "participant1")).toBe(24);
    expect(apart(tight, "customer", "clerk")).toBe(apart(plain, "customer", "clerk"));
    expect(tight.diagnostics).toEqual([]);
    const lines = labelItems(tight, "test");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const arrow = tight.connectors!.get("test")!.points[0]!.y + tight.offset!.y;
    for (const line of lines) expect(line.baseline).toBeLessThan(arrow);
  });
});

describe("message labels wrap", () => {
  const LONG = "Esto es una prueba de un texto Largo";
  // Heads as close as they may be, so that the label is wider than the room between `customer`
  // and `api` and wraps across the lifeline of `web`.
  const FIRST = `  spacing 8\n  actor customer\n  participant web\n  participant api\n  customer -> api: "${LONG}" as test`;
  const centre = (result: ReturnType<typeof run>, id: string) => {
    const box = result.boxes!.get(id)!;
    return box.x + box.width / 2;
  };
  const roomOf = (result: ReturnType<typeof run>, discRoom = 0) =>
    Math.abs(centre(result, "api") - centre(result, "customer")) - 24 - discRoom;
  const STEP = LIGHT.relationLabelSize * 1.25;

  it("wraps a long label at the room between its lifelines, the arrow under its last line", () => {
    const result = run(FIRST);
    const room = roomOf(result);
    const lines = labelItems(result, "test");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(labelWidth(line.text)).toBeLessThanOrEqual(room);
      expect(line.anchor).toBe("middle");
    }
    expect(lines.map((l) => l.text).join(" ")).toBe(LONG);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]!.baseline - lines[i - 1]!.baseline).toBeCloseTo(13.75, 6);
    }
    const arrow = result.connectors!.get("test")!.points[0]!.y + result.offset!.y;
    expect(lines.at(-1)!.baseline).toBeLessThan(arrow);
    // The row is a step taller for each line after the first.
    const one = run(FIRST.replace(LONG, "Short"));
    expect(result.events!.get("test")!.height - one.events!.get("test")!.height).toBeCloseTo(
      (lines.length - 1) * STEP,
      6,
    );
    // The first line is drawn where a one-line label is.
    expect(lines[0]!.baseline).toBe(labelItems(one, "test")[0]!.baseline);
  });

  it("keeps a label on one line where nothing pulls its participants closer", () => {
    const result = run(FIRST.replace("  spacing 8\n", ""));
    expect(labelItems(result, "test").map((t) => t.text)).toEqual([LONG]);
    expect(Math.abs(centre(result, "api") - centre(result, "customer"))).toBeGreaterThanOrEqual(
      labelWidth(LONG) + 24 - 1e-9,
    );
    expect(result.messageTexts!.get("test")).toMatchObject({ lines: [LONG], wraps: false });
  });

  it("gives editors the room, the lines, the size and the step of every message", () => {
    const result = run(FIRST);
    const text = result.messageTexts!.get("test")!;
    const block = result.labels!.get("test")!;
    expect(text.lines).toEqual(labelLines(result, "test"));
    expect(text).toMatchObject({ size: LIGHT.relationLabelSize, line: STEP, wraps: true });
    expect(text.area.width).toBeCloseTo(roomOf(result), 6);
    expect(text.area.x + text.area.width / 2).toBeCloseTo(block.x + block.width / 2, 6);
    expect([text.area.y, text.area.height]).toEqual([block.y, block.height]);
    // One label line high, and a step more for each line after the first.
    const lineHeight = Math.round((LIGHT.relationLabelSize * 18) / 11);
    expect(block.height).toBeCloseTo(lineHeight + (text.lines.length - 1) * STEP, 6);
    // The block is as wide as its widest line plus 8.
    expect(block.width).toBeCloseTo(Math.max(...text.lines.map(labelWidth)) + 8, 6);
    // A message without a label has its room and no lines.
    const bare = run(`${FIRST}\n  api --> customer as back`).messageTexts!.get("back")!;
    expect(bare).toMatchObject({ lines: [], wraps: true });
  });

  it("breaks a label at a written line break, though it would fit on one line", () => {
    const result = run('  a -> b: "One\\nTwo" as m');
    expect(labelLines(result, "m")).toEqual(["One", "Two"]);
    expect(result.messageTexts!.get("m")!.lines).toEqual(["One", "Two"]);
  });

  it("leaves the disc's room out of a numbered message's room", () => {
    const plain = run(FIRST).messageTexts!.get("test")!;
    const numbered = run(`  autonumber\n${FIRST}`);
    const text = numbered.messageTexts!.get("test")!;
    expect(text.area.width).toBeCloseTo(roomOf(numbered, 22), 6);
    expect(roomOf(numbered, 0) - text.area.width).toBe(22);
    expect(plain.area.width).toBeCloseTo(roomOf(run(FIRST)), 6);
    for (const line of text.lines) expect(labelWidth(line)).toBeLessThanOrEqual(text.area.width);
  });

  it("keeps a self-call's label beside its loop on one line, broken at line breaks only", () => {
    const label = "Validate the whole incoming request";
    const result = run(`  a -> a: "${label}" as check`);
    expect(labelLines(result, "check")).toEqual([label]);
    expect(result.messageTexts!.get("check")).toMatchObject({ lines: [label], wraps: false });
    const loop = result.connectors!.get("check")!.points;
    expect(result.labels!.get("check")!.x).toBeGreaterThan(loop[1]!.x);
    // Two lines centred on the loop's middle; the row grows when they are taller than the loop.
    const one = run('  a -> a: "Validate" as check\n  a -> a as next');
    const two = run('  a -> a: "Validate\\nthe request" as check\n  a -> a as next');
    expect(labelLines(two, "check")).toEqual(["Validate", "the request"]);
    const block = two.labels!.get("check")!;
    const middle = (points: readonly { y: number }[]) => (points[0]!.y + points[3]!.y) / 2;
    expect(block.y + block.height / 2).toBeCloseTo(middle(two.connectors!.get("check")!.points), 6);
    const y = (result: ReturnType<typeof run>) => result.connectors!.get("next")!.points[0]!.y;
    expect(y(two)).toBeGreaterThan(y(one));
    // The label never rises above the row it starts.
    expect(block.y).toBeGreaterThanOrEqual(two.events!.get("check")!.y);
  });

  it("moves the whole block with label … at … offset, its lines and room kept", () => {
    const plain = run(FIRST);
    const moved = run(`${FIRST}\n  placement { label test at 25% offset (0, -10) }`);
    expect(labelLines(moved, "test")).toEqual(labelLines(plain, "test"));
    const points = moved.connectors!.get("test")!.points;
    const block = moved.labels!.get("test")!;
    const quarter = points[0]!.x + (points[1]!.x - points[0]!.x) * 0.25;
    expect(block.x + block.width / 2).toBeCloseTo(quarter, 6);
    expect(plain.labels!.get("test")!.y - block.y).toBeCloseTo(10, 6);
    expect(moved.messageTexts!.get("test")!.area.width).toBe(
      plain.messageTexts!.get("test")!.area.width,
    );
  });

  it("moves the rows below down by the extra lines", () => {
    const body = (label: string) => `${FIRST.replace(LONG, label)}\n  api --> customer: "OK" as ok`;
    const wrapped = run(body(LONG));
    const one = run(body("Short"));
    const extra = labelLines(wrapped, "test").length - 1;
    expect(extra).toBeGreaterThan(0);
    const y = (result: ReturnType<typeof run>) => result.connectors!.get("ok")!.points[0]!.y;
    expect(y(wrapped) - y(one)).toBeCloseTo(extra * STEP, 6);
  });

  it("draws the head a creating message makes lower by the extra lines", () => {
    const body = (label: string) =>
      `  spacing 8\n  actor customer\n  participant web\n  customer -> web\n  create api\n  customer -> api: "${label}" as make`;
    const wrapped = run(body(LONG));
    const one = run(body("Short"));
    const extra = labelLines(wrapped, "make").length - 1;
    expect(extra).toBeGreaterThan(0);
    expect(wrapped.boxes!.get("api")!.y - one.boxes!.get("api")!.y).toBeCloseTo(extra * STEP, 6);
    // The label keeps its top, above the arrow that ends on the new head.
    expect(wrapped.labels!.get("make")!.y).toBeCloseTo(one.labels!.get("make")!.y, 6);
  });

  it("gives a creating message's label the room of its arrow, which ends on the new head", () => {
    const body = (pull: string) =>
      `${pull}  participant a "A"\n  participant b "B"\n  create b\n  a -> b: "${LONG}" as make`;
    for (const pull of ["", "  spacing 8\n"]) {
      const result = run(body(pull));
      const [start, end] = result.connectors!.get("make")!.points;
      expect(end!.x).toBe(result.boxes!.get("b")!.x);
      // The room is the arrow's length less 12 on each side, and the label stays inside it.
      const text = result.messageTexts!.get("make")!;
      expect(text.area.width, pull).toBeCloseTo(end!.x - start!.x - 24, 6);
      const label = result.labels!.get("make")!;
      expect(label.x, pull).toBeGreaterThanOrEqual(start!.x);
      expect(label.x + label.width, pull).toBeLessThanOrEqual(end!.x);
      expect(text.wraps, pull).toBe(pull !== "");
      expect(text.lines.length > 1, pull).toBe(pull !== "");
      for (const line of text.lines) expect(labelWidth(line)).toBeLessThanOrEqual(text.area.width);
    }
  });
});

describe("tags are drawn", () => {
  const TAG_HEIGHT = Math.round((LIGHT.tagSize * 18) / 10.5);
  /** The tag groups of an owner, in drawing order, wherever they are drawn. */
  const tagGroups = (scene: Scene, owner: string): GroupItem[] => {
    const found: GroupItem[] = [];
    const walk = (items: readonly SceneItem[]) => {
      for (const item of items) {
        if (item.kind !== "group") continue;
        if (item.role === "tag" && item.id === owner) found.push(item);
        else walk(item.items);
      }
    };
    walk(scene.items);
    return found;
  };
  /** A box in scene coordinates. */
  const inScene = (
    result: LayoutResult,
    box: { x: number; y: number; width: number; height: number },
  ) => ({
    x: box.x + result.offset!.x,
    y: box.y + result.offset!.y,
    width: box.width,
    height: box.height,
  });
  const MESSAGE = '  api -> bank: "Authorize" as authorize {\n    tag "PKCE"\n    tag "v2"\n  }';

  it("draws a message's pills on its arrow next to its source end, in source order", () => {
    const result = run(MESSAGE);
    const scene = result.scene!;
    const start = result.connectors!.get("authorize")!.points[0]!;
    const [pkce, v2] = result.tags!.get("authorize")!;
    for (const pill of [pkce!, v2!]) {
      expect(pill.height).toBe(TAG_HEIGHT);
      expect(pill.y + pill.height / 2).toBe(start.y);
    }
    expect(TAG_HEIGHT).toBe(18);
    expect(pkce!.x - start.x).toBe(6);
    expect(v2!.x - (pkce!.x + pkce!.width)).toBe(4);
    // Each pill is a group of role `tag` with the message's key and its index, after the label
    // group inside the message's group, so that it covers the arrow.
    const message = groups(scene, "relation").find((g) => g.id === "authorize")!;
    const roles = message.items.flatMap((i) => (i.kind === "group" ? [[i.role, i.tag]] : []));
    expect(roles).toEqual([
      ["label", undefined],
      ["tag", 0],
      ["tag", 1],
    ]);
    const groupsOf = tagGroups(scene, "authorize");
    expect(groupsOf.map((g) => g.tag)).toEqual([0, 1]);
    const [rect, text] = groupsOf[0]!.items;
    expect(rect).toMatchObject({
      kind: "rect",
      ...inScene(result, pkce!),
      radius: TAG_HEIGHT / 2,
      fill: LIGHT.tag,
      stroke: LIGHT.tag,
    });
    expect(text).toMatchObject({
      kind: "text",
      text: "PKCE",
      font: "mono",
      size: 10.5,
      weight: 500,
      fill: LIGHT.tagText,
      anchor: "middle",
      x: inScene(result, pkce!).x + pkce!.width / 2,
    });
    // The pill is the flow tag's: its mono text and the theme's padding.
    expect(pkce!.width).toBe(
      Math.ceil(metrics.width("PKCE", "mono", 500, LIGHT.tagSize) + TAG_HEIGHT),
    );
  });

  it("lifts a tagged message's label by half a pill and 2, its row that much taller", () => {
    const tagged = run(`${MESSAGE}\n  bank --> api as ok`);
    const plain = run('  api -> bank: "Authorize" as authorize\n  bank --> api as ok');
    const above = (result: LayoutResult) =>
      result.connectors!.get("authorize")!.points[0]!.y - result.labels!.get("authorize")!.y;
    expect(above(tagged) - above(plain)).toBe(11);
    // The label keeps its top; the arrow and the rows below move down.
    expect(tagged.labels!.get("authorize")!.y).toBe(plain.labels!.get("authorize")!.y);
    const ok = (result: LayoutResult) => result.connectors!.get("ok")!.points[0]!.y;
    expect(ok(tagged) - ok(plain)).toBe(11);
    // A wrapped label never meets the pills.
    const long = run(
      '  spacing 8\n  participant api\n  participant web\n  participant bank\n  api -> bank: "Authorize the payment of the whole basket now" as authorize { tag "PKCE" }',
    );
    const block = long.labels!.get("authorize")!;
    const [pill] = long.tags!.get("authorize")!;
    expect(labelLines(long, "authorize").length).toBeGreaterThan(1);
    expect(block.y + block.height).toBeLessThan(pill!.y);
  });

  it("starts the row at the source end of a message from right to left", () => {
    const result = run(
      '  participant api\n  participant bank\n  bank --> api: "OK" as ok { tag "cached" }',
    );
    const start = result.connectors!.get("ok")!.points[0]!;
    const [pill] = result.tags!.get("ok")!;
    expect(start.x - (pill!.x + pill!.width)).toBe(6);
    expect(result.connectors!.get("ok")!.points[1]!.x).toBeLessThan(start.x);
  });

  it("starts the row past the number's disc, and past the head a two-way message draws there", () => {
    const numbered = run(`  autonumber\n${MESSAGE}`);
    const start = numbered.connectors!.get("authorize")!.points[0]!;
    expect(numbered.tags!.get("authorize")![0]!.x - start.x).toBe(12);
    const both = run('  a <-> b: "Sync" as sync { tag "stream" }');
    const from = both.connectors!.get("sync")!.points[0]!;
    expect(both.tags!.get("sync")![0]!.x - from.x).toBe(6 + LIGHT.arrowSize);
  });

  it("puts a self-call's row on the loop's top segment and its label after it", () => {
    const result = run('  a -> a: "Check" as check { tag "idempotent" }');
    const loop = result.connectors!.get("check")!.points;
    const [pill] = result.tags!.get("check")!;
    expect(pill!.x - loop[0]!.x).toBe(6);
    expect(pill!.y + pill!.height / 2).toBe(loop[0]!.y);
    // The loop holds the row on its top segment, and the label starts after both.
    expect(loop[1]!.x).toBeGreaterThanOrEqual(pill!.x + pill!.width);
    expect(result.labels!.get("check")!.x).toBeGreaterThan(
      Math.max(loop[1]!.x, pill!.x + pill!.width),
    );
    // An untagged self-call keeps its loop.
    const plain = run('  a -> a: "Check" as check').connectors!.get("check")!.points;
    expect(plain[1]!.x - plain[0]!.x).toBe(34);
  });

  it("centres a participant's badges on the top edge of its box, every head lower by their room", () => {
    const body = (tags: string) =>
      `  participant api "API"\n  participant bank "Bank"${tags}\n  api -> bank: "Pay" as pay`;
    const tagged = run(body(' { tag "external" }'));
    const plain = run(body(""));
    const bank = tagged.boxes!.get("bank")!;
    const [pill] = tagged.tags!.get("bank")!;
    expect(pill!.x + pill!.width / 2).toBeCloseTo(bank.x + bank.width / 2, 6);
    expect(pill!.y + pill!.height / 2).toBe(bank.y);
    for (const id of ["api", "bank"]) {
      expect(tagged.boxes!.get(id)!.y - plain.boxes!.get(id)!.y).toBe(9);
    }
    // The badge is drawn in the head's group, which effects and stories address.
    const head = groups(tagged.scene!, "element").find((g) => g.id === "bank")!;
    expect(head.items.at(-1)).toMatchObject({ kind: "group", role: "tag", id: "bank", tag: 0 });
    // A diagram without tags keeps its heads where they were.
    expect(run(body("")).boxes!.get("api")).toEqual(plain.boxes!.get("api"));
  });

  it("stands an actor's badge 4 above the figure", () => {
    const result = run(
      '  actor customer "Customer" { tag "VIP" }\n  participant api\n  customer -> api',
    );
    const figure = result.boxes!.get("customer")!;
    const [pill] = result.tags!.get("customer")!;
    expect(pill!.x + pill!.width / 2).toBeCloseTo(figure.x + figure.width / 2, 6);
    // The figure fills the head's row: its top is the cell's.
    expect(figure.y - (pill!.y + pill!.height)).toBe(4);
  });

  it("gives a created head the room of its own badges", () => {
    const body = (tags: string) =>
      `  participant a\n  participant b\n  participant c "C"${tags}\n  a -> b as first\n  create c\n  b -> c: "new" as make`;
    const tagged = run(body(' { tag "new" }'));
    const plain = run(body(""));
    const c = tagged.boxes!.get("c")!;
    const [pill] = tagged.tags!.get("c")!;
    expect(pill!.y + pill!.height / 2).toBe(c.y);
    // Its row starts below the previous one, and the head is lower by the badge's room.
    expect(pill!.y).toBeGreaterThan(
      tagged.events!.get("first")!.y + tagged.events!.get("first")!.height - 1e-9,
    );
    expect(c.y - tagged.events!.get("make")!.y).toBe(
      plain.boxes!.get("c")!.y - plain.events!.get("make")!.y + 9,
    );
  });

  it("keeps a creating message's pills off the head it makes, clear of the arrowhead", () => {
    // The arrow ends on the new head's near edge: half a head short of its column.
    const body = (tags: string) =>
      `  participant a "A"\n  participant b "B"\n  create b\n  a -> b: "new" as make { ${tags} }`;
    for (const tags of [
      'tag "LONG-TAG-ONE"; tag "LONG-TAG-TWO"; tag "THREE"',
      'tag "ONE-TAG"; tag "TWO-TAG"',
    ]) {
      const result = run(body(tags));
      const head = result.boxes!.get("b")!;
      const end = result.connectors!.get("make")!.points.at(-1)!.x;
      expect(end).toBe(head.x);
      const last = result.tags!.get("make")!.at(-1)!;
      expect(last.x + last.width, tags).toBeLessThanOrEqual(end - LIGHT.arrowSize + 1e-9);
    }
    // From right to left too, a pull asking for less than the row being refused.
    const back = run(
      `  participant a "A"\n  participant b "B"\n  create a\n  b -> a: "new" as make { tag "LONG-TAG-ONE"; tag "LONG-TAG-TWO" }\n  placement { gap b -200 }`,
    );
    const head = back.boxes!.get("a")!;
    const end = back.connectors!.get("make")!.points.at(-1)!.x;
    expect(end).toBe(head.x + head.width);
    // The row runs leftwards from the source end: its first pill is the one nearest the head.
    expect(back.tags!.get("make")![0]!.x).toBeGreaterThanOrEqual(end + LIGHT.arrowSize - 1e-9);
  });

  it("refuses a tag in a group block before the layout", () => {
    const compilation = compile(
      'diagram s: sequence {\n  group edge "Edge" {\n    tag "core"\n    participant a\n  }\n  a -> a\n}\n',
    );
    expect(compilation.diagnostics.map((d) => d.code)).toContain("prop.unknown");
    expect(compilation.document.diagrams[0]!.hasErrors).toBe(true);
  });
});

describe("activation bars as objects", () => {
  const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");
  const lay = (text: string) => {
    const compilation = compile(text);
    return layoutDiagram(compilation, compilation.document.diagrams[0]!);
  };

  it("draws a written bar as a group of role `event` with its `activate` key and its box", () => {
    const result = lay(payment);
    const [bar] = barGroups(result.scene!, "api");
    expect(bar).toMatchObject({ id: "activate#1", role: "event" });
    const rect = bar!.items[0]!;
    expect(bar!.items).toHaveLength(1);
    expect(bar!.bounds).toEqual({
      x: rect.kind === "rect" && rect.x,
      y: rect.kind === "rect" && rect.y,
      width: rect.kind === "rect" && rect.width,
      height: rect.kind === "rect" && rect.height,
      radius: 0,
    });
    const box = result.boxes!.get("activate#1")!;
    expect({
      x: box.x + result.offset!.x,
      y: box.y + result.offset!.y,
      width: box.width,
      height: box.height,
    }).toEqual({
      x: bar!.bounds!.x,
      y: bar!.bounds!.y,
      width: bar!.bounds!.width,
      height: bar!.bounds!.height,
    });
    expect(result.bars!.get("activate#1")).toEqual({
      participant: "api",
      box,
      depth: 0,
      from: "activate#1",
      to: "deactivate#1",
      block: false,
    });
  });

  it("draws a call's bar under the call's key, absent from the boxes", () => {
    const result = lay(
      readFileSync(join(CORPUS_ROOT, "valid", "sequence", "calls.meltemi"), "utf8"),
    );
    expect(result.bars!.get("pay")).toMatchObject({
      participant: "api",
      from: "pay",
      to: null,
      block: true,
      depth: 0,
    });
    expect(result.boxes!.has("pay")).toBe(false);
    expect(barGroups(result.scene!, "api").map((g) => g.id)).toContain("pay");
    // A nested call's bar sits on its own receiver, its own depth.
    expect(result.bars!.get("authorize")).toMatchObject({ participant: "bank", block: true });
  });

  it("draws an open bar to the end of its lifeline, with no `deactivate`", () => {
    const result = run("  a -> b as ask\n  activate b\n  b -> c as next");
    const bar = result.bars!.get("activate#1")!;
    expect(bar.to).toBeNull();
    const line = groups(result.scene!, "lifeline").find((g) => g.id === "b")!.items[0]!;
    const bottom = line.kind === "polyline" ? line.points[1]!.y : NaN;
    expect(bar.box.y + bar.box.height + result.offset!.y).toBe(bottom);
  });

  it("refuses an unmatched deactivate before the layout", () => {
    const compilation = compile("diagram s: sequence {\n  a -> b\n  deactivate b\n}\n");
    expect(compilation.diagnostics.map((d) => d.code)).toContain("sequence.activation");
    expect(compilation.document.diagrams[0]!.hasErrors).toBe(true);
  });
});

describe("rows keep event order", () => {
  it("draws events top to bottom and adds space", () => {
    const body = "  a -> b as m1\n  b -> c as m2\n  c -> a as m3";
    const plain = run(body);
    const ys = ["m1", "m2", "m3"].map((k) => plain.connectors!.get(k)!.points[0]!.y);
    expect(ys[0]).toBeLessThan(ys[1]!);
    expect(ys[1]).toBeLessThan(ys[2]!);
    const spaced = run(`${body}\n  placement { space m2 40 }`);
    expect(spaced.connectors!.get("m2")!.points[0]!.y - ys[1]!).toBe(40);
    expect(spaced.events!.get("m2")!.y).toBeGreaterThan(plain.events!.get("m1")!.y);
  });

  it("adds space after an event below its row, and after the last event at the end", () => {
    const body = "  a -> b as m1\n  b -> c as m2\n  c -> a as m3";
    const plain = run(body);
    const y = (result: ReturnType<typeof run>, key: string) =>
      result.connectors!.get(key)!.points[0]!.y;
    const after = run(`${body}\n  placement { space m1 30 after }`);
    expect(y(after, "m1")).toBe(y(plain, "m1"));
    expect(y(after, "m2") - y(plain, "m2")).toBe(30);
    // The row of the event does not hold the room below it.
    expect(after.events!.get("m1")!.height).toBe(plain.events!.get("m1")!.height);
    const last = run(`${body}\n  placement { space m3 40 after }`);
    expect(last.scene!.height - plain.scene!.height).toBe(40);
  });

  it("loops self-calls to the right", () => {
    const result = run('  a -> a: "Validate" as v');
    const points = result.connectors!.get("v")!.points;
    expect(points).toHaveLength(4);
    expect(points[1]!.x).toBeGreaterThan(points[0]!.x);
    expect(points[3]!.y).toBeGreaterThan(points[0]!.y);
  });
});

describe("drawing", () => {
  const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");

  it("draws the payment sequence with its fragment, bar and replies", () => {
    const compilation = compile(payment);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const scene = result.scene!;
    const headers = groups(scene, "label").filter((g) => g.id === "result");
    expect(texts(headers)).toEqual(["alt", "[Aprobado]", "[Rechazado]"]);
    expect(barRects(scene, "api")).toHaveLength(1);
    const approved = groups(scene, "relation").find((g) => g.id === "approved")!;
    expect(approved.items[0]).toMatchObject({ kind: "polyline", dashed: true });
    expect(approved.items[1]).toMatchObject({ kind: "polyline", dashed: false });
  });

  it("starts an activation bar at the arrow that activates it", () => {
    const result = run(
      '  customer -> api: "Pagar" as pay\n  activate api\n  api -> bank as auth\n  deactivate api',
    );
    const scene = result.scene!;
    const bar = barRects(scene, "api")[0]!;
    const pay = result.connectors!.get("pay")!.points[0]!.y + result.offset!.y;
    const auth = result.connectors!.get("auth")!.points[0]!.y + result.offset!.y;
    expect(bar).toMatchObject({ y: pay });
    expect(bar.kind === "rect" && bar.y + bar.height).toBe(auth);
  });

  it("draws a call's block as the bar of its receiver, from the arrow to the block's last event", () => {
    const flat = run(
      '  customer -> api: "Pagar" as pay\n  activate api\n  api -> bank as auth\n  deactivate api',
    );
    const block = run('  customer -> api: "Pagar" as pay {\n    api -> bank as auth\n  }');
    const barOf = (result: ReturnType<typeof run>, id: string) => barRects(result.scene!, id);
    // The same picture as the written activation pair.
    expect(barOf(block, "api")).toEqual(barOf(flat, "api"));
    expect(block.connectors!.get("auth")!.points).toEqual(flat.connectors!.get("auth")!.points);
  });

  it("nests the bars of a call inside a call, and draws a return as a dashed reply", () => {
    const result = run(
      '  customer -> api: "Pay" as pay {\n    api -> bank: "Authorize" as authorize {\n      return "OK" as ok\n    }\n    return "Receipt" as receipt\n  }',
    );
    expect(barRects(result.scene!, "api")).toHaveLength(1);
    expect(barRects(result.scene!, "bank")).toHaveLength(1);
    const ys = ["pay", "authorize", "ok", "receipt"].map(
      (key) => result.connectors!.get(key)!.points[0]!.y,
    );
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    // The reply goes from the callee back to the caller.
    const ok = result.connectors!.get("ok")!.points;
    expect(ok[0]!.x).toBeGreaterThan(ok[ok.length - 1]!.x);
    expect(result.events!.get("ok")).toBeDefined();
  });

  it("draws created heads at their row and destroyed lifelines ending in a cross", () => {
    const result = run('  a -> b\n  create c\n  b -> c: "new" as make\n  destroy c');
    const head = result.boxes!.get("c")!;
    expect(head.y).toBeGreaterThan(result.boxes!.get("a")!.y);
    expect(groups(result.scene!, "event").some((g) => g.id === "destroy#1")).toBe(true);
  });

  it("numbers messages from the autonumber start", () => {
    const result = run("  autonumber 5\n  a -> b\n  b -> a");
    const numbers = groups(result.scene!, "relation").flatMap((g) =>
      g.items.flatMap((i) => (i.kind === "text" ? [i.text] : [])),
    );
    expect(numbers).toEqual(["5", "6"]);
  });

  it("draws notes, dividers and delays", () => {
    const result = run('  a -> b\n  note n over a, b "Both"\n  divider "Phase"\n  delay "Later"');
    expect(result.boxes!.has("n")).toBe(true);
    expect(texts(groups(result.scene!, "event"))).toEqual(["Both", "Phase", "Later"]);
  });
});

describe("heads measured as drawn", () => {
  const body =
    '  actor customer "Customer"\n  participant api "API"\n  database db "DB"\n  collections jobs "Jobs"\n  customer -> api: "Pay" as pay\n  activate api\n  api -> db as save\n  deactivate api';

  /** The head group of a participant and its first drawn rectangle or path, in the scene. */
  const head = (scene: Scene, id: string) => groups(scene, "element").find((g) => g.id === id)!;

  it("gives a box beside an actor the bottom 40 units of the head row", () => {
    const result = run(body);
    const offset = result.offset!;
    const customer = result.boxes!.get("customer")!;
    const api = result.boxes!.get("api")!;
    // The actor's figure and label fill the row; the box sits at its bottom.
    expect(customer.height).toBe(60);
    expect(api).toMatchObject({ y: customer.y + 20, height: 40 });
    const rect = head(result.scene!, "api").items.find((i) => i.kind === "rect")!;
    expect(rect).toMatchObject({
      x: api.x + offset.x,
      y: api.y + offset.y,
      width: api.width,
      height: api.height,
    });
    expect(head(result.scene!, "api").bounds).toMatchObject({
      x: api.x + offset.x,
      y: api.y + offset.y,
      width: api.width,
      height: 40,
      radius: 8,
    });
    // A figure keeps its cell.
    expect(head(result.scene!, "customer").bounds).toMatchObject({ height: 60 });
  });

  it("counts a collections head's second box", () => {
    const result = run(body);
    const jobs = result.boxes!.get("jobs")!;
    const api = result.boxes!.get("api")!;
    expect(jobs.y).toBe(api.y - 4);
    expect(jobs.height).toBe(44);
    const back = head(result.scene!, "jobs").items.find((i) => i.kind === "rect")!;
    expect(back).toMatchObject({ y: jobs.y + result.offset!.y });
  });

  it("reports the shapes and radii of heads", () => {
    const result = run(body);
    expect(result.shapes!.get("api")).toBe("rounded");
    expect(result.radii!.get("api")).toBe(8);
    expect(result.shapes!.get("db")).toBe("cylinder");
    expect(result.radii!.has("db")).toBe(false);
    expect(result.shapes!.get("jobs")).toBe("rounded");
    // A figure has no outline to report.
    expect(result.shapes!.has("customer")).toBe(false);
  });

  it("measures a created head as drawn at its row", () => {
    const result = run('  actor a\n  a -> b\n  create c\n  b -> c: "new" as make');
    const c = result.boxes!.get("c")!;
    const b = result.boxes!.get("b")!;
    expect(c.height).toBe(40);
    expect(c.y).toBeGreaterThan(b.y);
    // The creating message ends on the middle of the drawn box.
    const end = result.connectors!.get("make")!.points.at(-1)!;
    expect(end.y).toBe(c.y + c.height / 2);
  });

  it("keeps the box of a diagram without figures as the whole row", () => {
    const result = run("  participant a\n  participant b\n  a -> b");
    expect(result.boxes!.get("a")!.height).toBe(40);
  });
});

describe("tokens of the drawing", () => {
  const body =
    '  actor customer\n  participant api\n  customer -> api: "Pay" as pay\n  activate api\n  api -> api as check\n  deactivate api\n  note n over api "Checks"';

  const strokes = (theme: string) => {
    const compilation = compile(
      `theme plain {\n  extends "${theme}"\n  frame none\n}\n\ndiagram s: sequence {\n  theme "plain"\n${body}\n}\n`,
    );
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const scene = result.scene!;
    const lifeline = groups(scene, "lifeline").find((g) => g.id === "api")!;
    const line = lifeline.items[0];
    const bar = barRects(scene, "api")[0];
    const rect = groups(scene, "element")
      .find((g) => g.id === "api")!
      .items.find((i) => i.kind === "rect")!;
    const note = groups(scene, "event").find((g) => g.id === "n")!.items[0]!;
    const pay = groups(scene, "relation").find((g) => g.id === "pay")!.items[0]!;
    return { line, bar, rect, note, pay };
  };

  it("strokes heads, bars, notes and lifelines with muted under technical.light", () => {
    const { line, bar, rect, note, pay } = strokes("technical.light");
    expect(rect).toMatchObject({ stroke: "#526579", fill: "#FFFFFF" });
    expect(bar).toMatchObject({ kind: "rect", stroke: "#526579", fill: "#FFFFFF" });
    expect(note).toMatchObject({ stroke: "#526579" });
    // The lifeline is a dashed guide at half strength behind the messages.
    expect(line).toMatchObject({ kind: "polyline", stroke: "#526579", dashed: true, opacity: 0.5 });
    expect(pay).toMatchObject({ kind: "polyline", stroke: "#526579", strokeWidth: 1.3 });
  });

  it("takes the dark theme's muted under technical.dark", () => {
    const { line, rect } = strokes("technical.dark");
    expect(rect).toMatchObject({ stroke: THEMES["technical.dark"]!.muted });
    expect(line).toMatchObject({ stroke: THEMES["technical.dark"]!.muted });
  });

  it("lets a written stroke replace muted on the head and the lifeline", () => {
    const result = run(
      "  participant api\n  participant db\n  api -> db\n  style api { stroke danger }",
    );
    const scene = result.scene!;
    const danger = THEMES["technical.light"]!.danger;
    const rect = groups(scene, "element")
      .find((g) => g.id === "api")!
      .items.find((i) => i.kind === "rect")!;
    expect(rect).toMatchObject({ stroke: danger });
    expect(groups(scene, "lifeline").find((g) => g.id === "api")!.items[0]).toMatchObject({
      stroke: danger,
    });
  });
});

describe("a participant the diagram does not draw", () => {
  it("reports the unknown element of an activation and draws nothing", () => {
    // Messages declare their participants; an activation of one nothing names does not.
    const compilation = compile(
      "diagram s: sequence {\n  participant a\n  a -> b\n  activate billing\n}\n",
    );
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-element"]);
    expect(compilation.document.diagrams[0]!.hasErrors).toBe(true);
  });
});

describe("scenarios", () => {
  const body =
    '  a -> b as ask\n  alt check "Yes" {\n    b --> a as ok\n  } else "No" {\n    b --> a as no\n  }\n  loop again "Poll" {\n    a -> b as poll\n  }\n  scenario rejected "Rejected" {\n    choose check "No"\n    repeat again 2\n  }';

  it("lays out one path", () => {
    const result = run(body, { scenario: "rejected" });
    expect([...result.connectors!.keys()]).toEqual(["ask", "no", "poll", "poll@2"]);
    expect(result.scene!.title).toBe("Rejected");
    expect(texts(groups(result.scene!, "label"))).toEqual([
      "loop",
      "[Poll 1/2]",
      "loop",
      "[Poll 2/2]",
    ]);
  });

  it("draws every event without a scenario", () => {
    const result = run(body);
    expect([...result.connectors!.keys()]).toEqual(["ask", "ok", "no", "poll"]);
  });
});
