import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, formatDate } from "@meltemi/diagrams-model";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  TextMetrics,
  THEMES,
  layoutDiagram,
  type GroupItem,
  type LayoutOptions,
  type Scene,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

const ROADMAP = readFileSync(join(CORPUS_ROOT, "valid", "gantt", "roadmap.meltemi"), "utf8");
const TODAY = "2026-10-29";
const fonts = createNodeFontLibrary();
const LIGHT = THEMES["technical.light"]!;

/** A chart without the brand frame, so that only the chart is measured. */
const chart = (body: string) =>
  `language "0.2"\ntheme plain {\n  extends "technical.light"\n  frame none\n}\n\ndiagram plan: gantt {\n  theme "plain"\n${body}\n}\n`;

function lay(source: string, options: LayoutOptions = { today: TODAY }, strict = true) {
  const compilation = compile(source);
  if (strict) expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = compilation.document.diagrams[0]!;
  const result = layoutDiagram(compilation, diagram, options);
  expect(result.scene).not.toBeNull();
  return { compilation, diagram, result, scene: result.scene! };
}

const flatten = (items: readonly SceneItem[]): SceneItem[] =>
  items.flatMap((item) => (item.kind === "group" ? [item, ...flatten(item.items)] : [item]));
const groupOf = (scene: Scene, id: string) =>
  flatten(scene.items).find((i): i is GroupItem => i.kind === "group" && i.id === id)!;
const textsOf = (group: GroupItem) =>
  flatten(group.items).filter((i): i is TextItem => i.kind === "text");
const axisTexts = (scene: Scene) => textsOf(groupOf(scene, "axis")).map((t) => t.text);
const barOf = (scene: Scene, id: string) =>
  groupOf(scene, id).items.find((i) => i.kind === "rect" || i.kind === "path") as unknown as {
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
const labelOf = (scene: Scene, id: string) =>
  groupOf(scene, id).items.find((i): i is TextItem => i.kind === "text");

describe("Gantt charts are laid out without an engine", () => {
  it("draws the same picture twice", () => {
    const first = lay(ROADMAP).scene;
    const second = lay(ROADMAP).scene;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.items.some((i) => i.kind === "group" && i.role === "axis")).toBe(true);
  });

  it("draws what is dated and nothing of a loop", () => {
    const { result, scene } = lay(
      chart("task a after b for 1d\ntask b after a for 1d\ntask c from 2026-06-01 for 1d"),
      { today: TODAY },
      false,
    );
    const ids = flatten(scene.items)
      .filter((i): i is GroupItem => i.kind === "group" && i.role === "element")
      .map((g) => g.id);
    expect(ids).toEqual(["c"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("draws four empty weeks for an empty chart", () => {
    const { result } = lay(chart(""));
    const { timeline } = result.gantt!;
    expect(formatDate(timeline.start, false)).toBe("2026-10-26");
    expect(formatDate(timeline.end, false)).toBe("2026-11-23");
    expect(result.gantt!.rows.size).toBe(0);
  });
});

describe("Time scale and ticks", () => {
  it("draws weekly ticks, in Spanish, over the owner's chart", () => {
    const { result, scene } = lay(ROADMAP, { today: TODAY, locale: "es", measurer: fonts });
    const { timeline } = result.gantt!;
    expect(formatDate(timeline.start, false)).toBe("2026-06-01");
    expect(formatDate(timeline.end, false)).toBe("2026-08-31");
    const labels = axisTexts(scene);
    expect(labels).toHaveLength(14);
    expect(labels[0]).toBe("01 jun");
    expect(labels[1]).toBe("08 jun");
    expect(labels.at(-1)).toBe("31 ago");
    expect(result.diagnostics.map((d) => d.code)).not.toContain("layout.too-large");
  });

  it("draws the same chart in English", () => {
    const { scene } = lay(ROADMAP, { today: TODAY, locale: "en", measurer: fonts });
    const labels = axisTexts(scene);
    expect(labels[0]).toBe("01 Jun");
    expect(labels.at(-1)).toBe("31 Aug");
  });

  it("keeps the ticks a month apart when the format names months only", () => {
    const { scene } = lay(
      chart('axisFormat "%b"\ntask a from 2026-01-05 for 100d\ntask b after a for 200d'),
      { today: "2020-01-01" },
    );
    const labels = axisTexts(scene);
    expect(labels.slice(0, 3)).toEqual(["Jan", "Feb", "Mar"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels a day in hours with the time", () => {
    const { scene } = lay(
      chart(
        'task a "A" from 2026-06-01T09:00 to 2026-06-01T17:00\ntask b "B" from 2026-06-01T10:00 to 2026-06-01T12:00',
      ),
    );
    const labels = axisTexts(scene);
    expect(labels.length).toBeGreaterThan(2);
    for (const label of labels) expect(label).toMatch(/^\d\d:\d\d$/);
    expect(labels[0]).toBe("09:00");
  });

  it("labels every n-th tick of a written interval that is too crowded", () => {
    const source = chart("ticks 1d\ntask a from 2026-01-01 for 100d\ntask b after a for 265d");
    const { result, scene } = lay(source);
    const crowded = result.diagnostics.filter((d) => d.code === "layout.ticks-crowded");
    expect(crowded).toHaveLength(1);
    expect(crowded[0]!.message).toMatch(/every \d+ ticks/);
    const every = Number(/every (\d+) ticks/.exec(crowded[0]!.message)![1]);
    expect(every).toBeGreaterThan(1);
    const labels = axisTexts(scene);
    expect(labels.length).toBeLessThan(365 / every + 2);
    // The warning is on the `ticks` statement.
    const line = source.split("\n").findIndex((l) => l.startsWith("ticks")) + 1;
    expect(crowded[0]!.range.start.line).toBe(line);
  });

  it("keeps a written interval that fits", () => {
    const { scene, result } = lay(chart("ticks 2w\ntask a from 2026-06-01 for 12w"));
    expect(result.diagnostics).toEqual([]);
    expect(axisTexts(scene)).toHaveLength(7);
  });

  it("widens the timeline with dayWidth", () => {
    const { result } = lay(chart("dayWidth 10\ntask a from 2026-06-01 for 2w"));
    expect(result.gantt!.timeline.dayWidth).toBeCloseTo(10, 5);
    expect(result.gantt!.timeline.width).toBeCloseTo(10 * 14, 5);
  });

  it("formats the axis as written", () => {
    const { scene } = lay(chart('axisFormat "%a %-d/%m"\ntask a from 2026-06-01 for 1w'));
    expect(axisTexts(scene)[0]).toBe("Mon 1/06");
  });

  it("draws the axis at the top, or at both ends", () => {
    const top = lay(chart("axis top\ntask a from 2026-06-01 for 2w"));
    const both = lay(chart("axis both\ntask a from 2026-06-01 for 2w"));
    const bottom = lay(chart("task a from 2026-06-01 for 2w"));
    const count = (r: { scene: Scene }) => axisTexts(r.scene).length;
    expect(count(top)).toBe(count(bottom));
    expect(count(both)).toBe(2 * count(bottom));
    const y = (r: { scene: Scene }) => textsOf(groupOf(r.scene, "axis"))[0]!.y;
    expect(y(top)).toBeLessThan(barOf(top.scene, "a").y);
    expect(y(bottom)).toBeGreaterThan(barOf(bottom.scene, "a").y);
  });
});

describe("Sections and rows", () => {
  it("draws ten rows in three bands", () => {
    const { result, scene } = lay(ROADMAP);
    expect(result.gantt!.rows.size).toBe(10);
    const rows = [...result.gantt!.rows.values()];
    for (const row of rows) expect(row.height).toBe(32);
    for (const id of ["tec0", "flu2", "sdlc1"]) expect(barOf(scene, id).height).toBe(24);
    const band = (id: string) =>
      groupOf(scene, id).items.find((i) => i.kind === "rect") as unknown as { fill: string };
    expect(band("tecnologia").fill).toBe(LIGHT.band);
    expect(groupOf(scene, "nuevo_flujo_genai_hub").items.some((i) => i.kind === "rect")).toBe(
      false,
    );
    expect(band("i_d").fill).toBe(LIGHT.band);
    expect(textsOf(groupOf(scene, "tecnologia")).some((t) => t.text === "Tecnología")).toBe(true);
    const titles = ["tecnologia", "nuevo_flujo_genai_hub", "i_d"].map(
      (id) => groupOf(scene, id).items.filter((i): i is TextItem => i.kind === "text")[0]!.text,
    );
    expect(titles).toEqual(["Tecnología", "Nuevo Flujo GenAI Hub", "I+D"]);
    // 8 above and below the rows of each section.
    const sections = ["tecnologia", "nuevo_flujo_genai_hub", "i_d"].map((id) =>
      result.boxes!.get(id)!,
    );
    expect(sections.map((s) => s.height)).toEqual([8 + 3 * 32, 8 + 4 * 32, 8 + 3 * 32]);
  });

  it("packs a compact section into the fewest rows", () => {
    const { result } = lay(
      chart(
        'display compact\nsection s "S" {\n  task a "a" from 2026-06-01 to 2026-06-05\n  task b "b" from 2026-06-08 to 2026-06-12\n  task c "c" from 2026-06-03 to 2026-06-10\n}',
      ),
    );
    const y = (id: string) => result.gantt!.rows.get(id)!.y;
    expect(y("a")).toBe(y("b"));
    expect(y("c")).toBeGreaterThan(y("a"));
  });

  it("gives a marker no row", () => {
    const { result } = lay(
      chart('task a from 2026-06-01 for 2d\ntask b for 2d\nmarker m "Freeze" at 2026-06-03'),
    );
    expect(result.gantt!.rows.size).toBe(2);
    expect(result.gantt!.rows.has("m")).toBe(false);
  });

  it("puts tasks outside any section first, without a title", () => {
    const { result, scene } = lay(
      chart(
        'section s "Build" { task a from 2026-06-01 for 2d }\ntask first from 2026-06-05 for 1d',
      ),
    );
    const rows = result.gantt!.rows;
    expect(rows.get("first")!.y).toBeLessThan(rows.get("a")!.y);
    expect(rows.get("first")!.section).toBeNull();
    expect(rows.get("a")!.section).toBe("s");
    expect(groupOf(scene, "first").bounds).toBeDefined();
  });

  it("holds an empty section's title", () => {
    const { scene } = lay(
      chart('section s "Waiting" { task a after b for 1d }\ntask b after a'),
      { today: TODAY },
      false,
    );
    expect(textsOf(groupOf(scene, "s")).map((t) => t.text)).toEqual(["Waiting"]);
  });
});

describe("The width of the timeline and of the section column", () => {
  it("fills the canvas of the preset, a written canvas, and a board's fixed width", () => {
    const margin = LIGHT.margin;
    const slide = lay(chart("preset slide\ntask a from 2026-06-01 for 2w"));
    expect(slide.result.gantt!.timeline.width).toBe(1920 - 2 * margin);
    expect(slide.scene.width).toBe(1920);
    const sized = lay(chart("canvas (1600, 900)\ntask a from 2026-06-01 for 2w"));
    expect(sized.result.gantt!.timeline.width).toBe(1600 - 2 * margin);
    const board = lay(chart("preset board\ntask a from 2026-06-01 for 2w"));
    expect(board.result.gantt!.timeline.width).toBe(960);
    const plain = lay(chart("task a from 2026-06-01 for 2w"));
    expect(plain.result.gantt!.timeline.width).toBe(1200 - 2 * margin);
  });

  it("takes the width of the section column from its widest title, at least 120", () => {
    const short = lay(chart('section s "A" { task a from 2026-06-01 for 2w }'));
    expect(short.result.gantt!.timeline.x).toBe(120);
    const metrics = new TextMetrics(fonts, LIGHT);
    const title = "Nuevo Flujo GenAI Hub";
    const long = lay(chart(`section s "${title}" { task a from 2026-06-01 for 2w }`), {
      today: TODAY,
      measurer: fonts,
    });
    const width = metrics.width(title, "body", LIGHT.labelWeight, LIGHT.groupTitleSize);
    expect(long.result.gantt!.timeline.x).toBe(Math.max(120, Math.ceil(width + 2 * LIGHT.padding)));
    expect(long.result.gantt!.timeline.x).toBeGreaterThan(120);
    // The chart without sections has no column at all.
    expect(lay(chart("task a from 2026-06-01 for 2w")).result.gantt!.timeline.x).toBe(0);
  });

  it("wraps a long section title at 280 units", () => {
    const title =
      "A section whose title is much too long to stay on one line of the column and more";
    const { scene } = lay(chart(`section s "${title}" { task a from 2026-06-01 for 2w }`), {
      today: TODAY,
      measurer: fonts,
    });
    const lines = groupOf(scene, "s").items.filter((i): i is TextItem => i.kind === "text");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((l) => l.text).join(" ")).toBe(title);
    const metrics = new TextMetrics(fonts, LIGHT);
    for (const line of lines) {
      expect(
        metrics.width(line.text, "body", LIGHT.labelWeight, LIGHT.groupTitleSize),
      ).toBeLessThanOrEqual(280.5);
    }
  });
});

describe("Bars and labels", () => {
  it("draws the label inside a long bar, before one at the right edge, and after the others", () => {
    const { result, scene } = lay(ROADMAP, { today: TODAY, measurer: fonts });
    void result;
    const inside = labelOf(scene, "sdlc0")!;
    expect(inside.fill).toBe(LIGHT.tagText);
    expect(inside.anchor).toBe("middle");
    const before = labelOf(scene, "sdlc2")!;
    expect(before.anchor).toBe("end");
    expect(before.fill).toBe(LIGHT.ink);
    expect(before.x).toBeLessThan(barOf(scene, "sdlc2").x);
    for (const id of ["tec0", "tec1", "tec2", "flu0", "flu1", "flu3", "sdlc1"]) {
      const label = labelOf(scene, id)!;
      expect(label.anchor, id).toBe("start");
      expect(label.fill, id).toBe(LIGHT.ink);
      expect(label.x, id).toBeGreaterThan(barOf(scene, id).x + barOf(scene, id).width);
    }
  });

  it("colours bars by status", () => {
    const { scene } = lay(
      chart(
        [
          "task planned from 2026-06-01 for 2d",
          "task going active for 2d",
          "task over done for 2d",
          "task urgent critical for 2d",
          "task finished done critical for 2d",
        ].join("\n"),
      ),
    );
    expect(barOf(scene, "planned").fill).toBe(LIGHT.accent);
    expect(barOf(scene, "going").fill).toBe(LIGHT.info);
    expect(barOf(scene, "over").fill).toBe(LIGHT.muted);
    expect(barOf(scene, "urgent")).toMatchObject({
      fill: LIGHT.danger,
      stroke: LIGHT.danger,
      strokeWidth: 2,
    });
    expect(barOf(scene, "finished")).toMatchObject({
      fill: LIGHT.muted,
      stroke: LIGHT.danger,
      strokeWidth: 2,
    });
  });

  it("lets styles override the bar", () => {
    const { scene } = lay(
      chart(
        "rule task { radius 2 }\nstyle a { fill warning; stroke ink; width 3; line dashed; color ink }\ntask a from 2026-06-01 for 20d",
      ),
    );
    expect(barOf(scene, "a")).toMatchObject({
      fill: LIGHT.warning,
      stroke: LIGHT.ink,
      strokeWidth: 3,
    });
    const rect = barOf(scene, "a") as unknown as { radius: number; dashed: boolean };
    expect(rect.radius).toBe(2);
    expect(rect.dashed).toBe(true);
    expect(labelOf(scene, "a")!.fill).toBe(LIGHT.ink);
  });

  it("keeps the corners of a bar under a quarter of its height", () => {
    const { scene } = lay(chart("rule task { radius 30 }\ntask a from 2026-06-01 for 20d"));
    expect((barOf(scene, "a") as unknown as { radius: number }).radius).toBe(6);
  });

  it("lists the labels in a column, with no text on the bars", () => {
    const { scene, result } = lay(`${ROADMAP.replace("today\n", "today\n  labels column\n")}`);
    const column = result.boxes!.get("tecnologia")!;
    void column;
    for (const id of ["tec0", "sdlc2"]) {
      const group = groupOf(scene, id);
      const text = group.items.find((i): i is TextItem => i.kind === "text")!;
      expect(text.anchor).toBe("start");
      expect(text.x).toBeLessThan(barOf(scene, id).x);
    }
    const titles = textsOf(groupOf(scene, "tecnologia")).map((t) => t.text);
    expect(titles[0]).toBe("Tecnología");
  });
});

describe("A pattern on a bar", () => {
  it("overlays the bar and the diamond with the tiling, declared once for a kind and colour", () => {
    const { scene } = lay(
      chart(
        'task a "A" from 2026-06-01 for 5d\nmilestone m "M" after a\nstyle a { pattern hatch }\nstyle m { pattern hatch }',
      ),
    );
    expect(scene.patterns).toHaveLength(1);
    const reference = `url(#${scene.patterns[0]!.id})`;
    for (const id of ["a", "m"]) {
      const overlays = groupOf(scene, id).items.filter(
        (item) => (item.kind === "rect" || item.kind === "path") && item.fill === reference,
      );
      expect(overlays, id).toHaveLength(1);
    }
    // Without a pattern nothing is declared.
    expect(lay(chart('task a "A" from 2026-06-01 for 5d')).scene.patterns).toEqual([]);
  });
});

describe("Milestones, markers, today and excluded days", () => {
  it("centres a milestone on its instant", () => {
    const { result, scene } = lay(
      chart(
        'dayWidth 10\ntask build "Build" from 2026-06-01 to 2026-06-18\nmilestone beta "Beta" after build\ntask later "Later" from 2026-08-01 for 1d',
      ),
    );
    const box = result.boxes!.get("beta")!;
    const center = box.x + box.width / 2;
    expect(center - result.gantt!.timeline.x).toBeCloseTo(180, 5);
    expect(box.width).toBeCloseTo(0.8 * 24, 5);
    expect(box.height).toBeCloseTo(0.8 * 24, 5);
    const shape = groupOf(scene, "beta").items[0]!;
    expect(shape.kind).toBe("path");
    expect(labelOf(scene, "beta")!.anchor).toBe("start");
  });

  it("draws a marker as a dashed line and a pill", () => {
    const { scene, result } = lay(
      chart('task a from 2026-06-01 for 2w\nmarker freeze "Freeze" at 2026-06-08'),
    );
    const group = groupOf(scene, "freeze");
    const line = group.items.find((i) => i.kind === "polyline") as unknown as {
      dashed: boolean;
      strokeWidth: number;
      stroke: string;
      dash: { array: number[] };
      points: { x: number; y: number }[];
    };
    expect(line).toMatchObject({ dashed: true, strokeWidth: 1.5, stroke: LIGHT.ink });
    expect(line.dash.array).toEqual([4, 4]);
    expect(line.points[0]!.x).toBe(line.points[1]!.x);
    expect(textsOf(group).map((t) => t.text)).toEqual(["Freeze"]);
    const pill = result.labels!.get("freeze")!;
    expect(pill.y + pill.height).toBeLessThanOrEqual(result.gantt!.rows.get("a")!.y + 4);
  });

  it("staggers the pills of markers that would touch", () => {
    const { result } = lay(
      chart(
        'task a from 2026-06-01 for 2w\nmarker one "A long marker label" at 2026-06-08\nmarker two "Another long one" at 2026-06-09',
      ),
    );
    const one = result.labels!.get("one")!;
    const two = result.labels!.get("two")!;
    expect(one.y).not.toBe(two.y);
  });

  it("draws the today line inside the span, with its word", () => {
    const { scene } = lay(chart("today\ntask a from 2026-06-01 for 2w"), { today: "2026-06-05" });
    const axis = groupOf(scene, "axis");
    const todayLine = axis.items.find(
      (i) => i.kind === "polyline" && i.stroke === LIGHT.danger,
    ) as unknown as { strokeWidth: number };
    expect(todayLine.strokeWidth).toBe(2);
    expect(textsOf(axis).map((t) => t.text)).toContain("Today");
  });

  it("writes the word in the content language", () => {
    const { scene } = lay(chart("today\ntask a from 2026-06-01 for 2w"), {
      today: "2026-06-05",
      locale: "es",
    });
    expect(axisTexts(scene)).toContain("Hoy");
  });

  it("pins the day with today <date>", () => {
    const { scene } = lay(chart("today 2026-06-10\ntask a from 2026-06-01 for 2w"), {
      today: "2026-12-01",
    });
    expect(axisTexts(scene)).toContain("Today");
  });

  it("leaves out the line when the day is outside the span, and does not widen it", () => {
    const { scene, result } = lay(ROADMAP, { today: TODAY });
    expect(axisTexts(scene)).not.toContain("Today");
    expect(formatDate(result.gantt!.timeline.end, false)).toBe("2026-08-31");
    const none = lay(chart("task a from 2026-06-01 for 2w"), { today: "2026-06-05" });
    expect(axisTexts(none.scene)).not.toContain("Today");
  });

  it("shades excluded days", () => {
    const { scene } = lay(chart("exclude weekends\ntask a from 2026-06-01 for 3w"));
    const shaded = groupOf(scene, "axis").items.filter(
      (i) => i.kind === "rect" && i.opacity === 0.6,
    );
    // The weekends within the span, one column each.
    expect(shaded.length).toBeGreaterThanOrEqual(2);
  });

  it("does not shade weekends too thin to see", () => {
    const { scene } = lay(chart("exclude weekends\ntask a from 2026-01-01 for 1000d"));
    const shaded = groupOf(scene, "axis").items.filter(
      (i) => i.kind === "rect" && i.opacity === 0.6,
    );
    expect(shaded).toHaveLength(0);
  });
});

describe("Dependency arrows", () => {
  it("draws six arrows, each ending at its successor's start", () => {
    const { scene, result } = lay(ROADMAP);
    const keys = [
      "tec0->tec1#1",
      "tec1->tec2#1",
      "flu0->flu1#1",
      "flu1->flu2#1",
      "flu2->flu3#1",
      "sdlc1->sdlc2#1",
    ];
    for (const key of keys) {
      const relation = groupOf(scene, key);
      expect(relation.role).toBe("relation");
      expect(relation.track!.length).toBeGreaterThan(1);
      const to = key.split("->")[1]!.split("#")[0]!;
      const box = result.boxes!.get(to)!;
      const geometry = result.connectors!.get(key)!;
      const end = geometry.points.at(-1)!;
      expect(end.x).toBeCloseTo(box.x, 5);
      expect(end.y).toBeCloseTo(box.y + box.height / 2, 5);
    }
    expect(result.connectors!.size).toBe(6);
  });

  it("goes down between the rows when the successor starts close", () => {
    const { result } = lay(
      chart(
        'dayWidth 24\ntask a "A" from 2026-06-01T00:00 to 2026-06-01T09:59\ntask b "B" from 2026-06-01T18:00 for 4h after a',
      ),
    );
    const points = result.connectors!.get("a->b#1")!.points;
    expect(points).toHaveLength(6);
    const a = result.boxes!.get("a")!;
    const b = result.boxes!.get("b")!;
    const gap = points[2]!.y;
    expect(gap).toBeGreaterThan(a.y + a.height);
    expect(gap).toBeLessThan(b.y);
    // Back to 8 units before the successor's start, and in.
    expect(points[3]!.x).toBeCloseTo(b.x - 8, 5);
    expect(points[5]!.x).toBeCloseTo(b.x, 5);
  });

  it("draws none when they are hidden, and the model still holds them", () => {
    const { diagram, result, scene } = lay(
      chart("dependencies hidden\ntask a from 2026-06-01 for 2d\ntask b after a for 1d"),
    );
    expect(flatten(scene.items).some((i) => i.kind === "group" && i.role === "relation")).toBe(
      false,
    );
    expect(result.connectors!.size).toBe(0);
    expect(diagram.relations).toHaveLength(1);
  });

  it("styles the arrows with rule relation", () => {
    const { scene } = lay(
      chart(
        "rule relation { stroke danger; width 3 }\ntask a from 2026-06-01 for 2d\ntask b after a for 1d",
      ),
    );
    const line = groupOf(scene, "a->b#1").items.find((i) => i.kind === "polyline") as unknown as {
      stroke: string;
      strokeWidth: number;
    };
    expect(line).toMatchObject({ stroke: LIGHT.danger, strokeWidth: 3 });
  });

  it("rounds the corners of an arrow when the theme says so", () => {
    const sharp = lay(chart("task a from 2026-06-01 for 2d\ntask b after a for 1d"));
    const rounded = lay(
      chart(
        "rule relation { corners rounded }\ntask a from 2026-06-01 for 2d\ntask b after a for 1d",
      ),
    );
    expect(groupOf(rounded.scene, "a->b#1").track!.length).toBeGreaterThan(
      groupOf(sharp.scene, "a->b#1").track!.length,
    );
  });
});

describe("Scene groups and the layout result", () => {
  it("lets editors find a bar, its row and its arrow", () => {
    const { result, scene } = lay(ROADMAP);
    const bar = barOf(scene, "tec1");
    const box = result.boxes!.get("tec1")!;
    expect(box.height).toBe(24);
    expect(box.x).toBeCloseTo(bar.x - result.offset!.x, 1);
    expect(result.gantt!.rows.get("tec1")!.section).toBe("tecnologia");
    expect(groupOf(scene, "tec0->tec1#1").track).toBeDefined();
    expect(groupOf(scene, "tec1").bounds!.label).toBeDefined();
    expect(result.labels!.has("tec1")).toBe(true);
  });

  it("keeps the section groups' bounds as the bands, holding the tasks' groups", () => {
    const { scene } = lay(ROADMAP);
    const section = groupOf(scene, "tecnologia");
    const children = section.items.filter((i): i is GroupItem => i.kind === "group");
    expect(children.map((g) => g.id)).toEqual(["tec0", "tec1", "tec2"]);
    expect(section.bounds!.width).toBeGreaterThan(1000);
  });

  it("links a task to its url", () => {
    const { scene } = lay(chart('task a from 2026-06-01 for 2d { url "https://example.com/a" }'));
    expect(groupOf(scene, "a").href).toBe("https://example.com/a");
  });

  it("draws a sketched chart under sketch.light", () => {
    const { scene } = lay(
      ROADMAP.replace(
        "diagram hoja_de_ruta_genai: gantt {",
        'diagram hoja_de_ruta_genai: gantt {\n  theme "sketch.light"',
      ),
    );
    expect(scene.sketch).toBe("light");
    expect(scene.items.some((i) => i.kind === "group" && i.role === "axis")).toBe(true);
  });

  it("reports no label cut or overlap for the owner's chart", () => {
    for (const measurer of [undefined, fonts]) {
      const { result } = lay(ROADMAP, { today: TODAY, ...(measurer ? { measurer } : {}) });
      const codes = result.diagnostics.map((d) => d.code);
      expect(codes).not.toContain("layout.label-cut");
      expect(codes).not.toContain("layout.label-overlap");
      expect(codes).not.toContain("layout.too-large");
    }
  });

  it("keeps a chart with every construct free of label findings", () => {
    const source = chart(
      [
        "today 2026-06-10",
        "exclude weekends",
        'section one "One" {',
        '  task a "Design the thing" from 2026-06-01 for 5d done',
        '  task b "Build" after a for 10d critical',
        '  milestone m "Beta" after b',
        "}",
        'section two "Two" {',
        '  task c "Test and release with a very long label" after b for 2d active',
        "}",
        'marker freeze "Freeze" at 2026-06-12',
      ].join("\n"),
    );
    const { result } = lay(source, { today: TODAY, measurer: fonts });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).not.toContain("layout.label-cut");
    expect(codes).not.toContain("layout.label-overlap");
  });

  it("falls back on a one-day week for a chart with a marker alone", () => {
    const { result } = lay(chart('marker m "Freeze" at 2026-06-10'));
    expect(result.gantt!.rows.size).toBe(0);
    expect(result.boxes!.has("m")).toBe(true);
  });

  it("draws a frame and a title when the theme has one", () => {
    const { scene } = lay(
      'language "0.2"\ndiagram plan: gantt {\n  title "The plan"\n  task a from 2026-06-01 for 2d\n}\n',
    );
    expect(scene.title).toBe("The plan");
    expect(groupOf(scene, "frame")).toBeDefined();
  });

  it("never throws on odd charts", () => {
    for (const body of [
      "task a from 2026-06-01 for 1s",
      "task a from 2026-06-01 to 2026-06-01T00:00:01",
      "dayWidth 1\ntask a from 2026-06-01 for 36000d",
      "dayWidth 100000\ntask a from 2026-06-01 for 1d",
      "ticks 1s\ntask a from 2026-06-01 for 2000d",
      'section s { }\nsection t { }\nmarker m "M" at 2026-06-01',
    ]) {
      const compilation = compile(chart(body));
      const diagram = compilation.document.diagrams[0]!;
      expect(() => layoutDiagram(compilation, diagram, { today: TODAY })).not.toThrow();
    }
  });
});
