import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { DEFAULT_PEN_WIDTH as LAYOUT_PEN_WIDTH } from "@meltemi/diagrams-layout";
import { compile, type PlaceEntry, type Point } from "@meltemi/diagrams-model";
import { CORPUS_ROOT, REPO_ROOT } from "../../../test-support/corpus.js";
import {
  DEFAULT_PEN_STROKE,
  DEFAULT_PEN_WIDTH,
  HIGHLIGHTER,
  KEY_BINDINGS,
  PEN_WIDTHS,
  PRESENCE_PEN_LIMITS,
  STICKY_COLOURS,
  commandFor,
  isCanvasMessage,
  isPresencePen,
  penStyleFor,
  scalePenPoints,
  type ElementInfo,
  type PreviewedAction,
} from "../src/canvas/index.js";
import {
  analyzeDocument,
  CanvasSession,
  copyFragment,
  pasteOperations,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";

afterEach(() => setLocale("en"));

/** A session on a text that applies each plan and analyses the result, as a host does. */
function open(text: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let shown: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
  const act = (action: CanvasAction) => session.receive({ type: "action", revision: rev, action });
  const apply = (action: CanvasAction): string => {
    const result = act(action);
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    current = applyTextEdits(current, result.plan.edits);
    rev++;
    shown = session.update(analyzeDocument({ text: current, revision: rev }));
    return current;
  };
  const preview = (action: PreviewedAction, token = 1) => act({ kind: "preview", token, action });
  const render = () =>
    shown.find((m): m is HostMessage & { type: "render" } => m.type === "render")!;
  const element = (id: string): ElementInfo => render().elements.find((e) => e.id === id)!;
  return {
    session,
    act,
    apply,
    preview,
    render,
    element,
    /** The messages of the last analysis: the render, the selection that opens an editor… */
    shown: () => shown,
    text: () => current,
  };
}

const places = (text: string) =>
  new Map(
    compile(text)
      .document.diagrams[0]!.placement.filter((p): p is PlaceEntry => p.statement === "place")
      .map((p) => [p.target, { x: p.x, y: p.y }]),
  );

/** The declarations of a block, in source order, as `kind id` words. */
const declared = (text: string, id: string) => {
  const diagram = compile(text).document.diagrams[0]!;
  return diagram.elements
    .filter((e) => e.groupPath[e.groupPath.length - 1] === (id === "" ? undefined : id))
    .sort((a, b) => a.node!.start - b.node!.start)
    .map((e) => `${e.kind} ${e.id}`);
};

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

const grouped = `${PLAIN}diagram s: free {
  theme "plain"
  group g "G" {
    box a "A"
    box b "B"
  }
  box c "C"
  placement {
    place g at (300, 200)
    size g (400, 240)
    place a at (80, 30)
    place b at (260, 30)
    place c at (700, 200)
  }
}
`;

/** The interior origin of `g` in `grouped`: `a` is placed at (80, 30) in it. */
function interior(canvas: ReturnType<typeof open>) {
  const a = canvas.element("a");
  return { x: a.box.x + a.box.width / 2 - 80, y: a.box.y + a.box.height / 2 - 30 };
}

const strokes = `${PLAIN}diagram s: free {
  theme "plain"
  pen p [(10, 10), (50, 20), (90, 10)] // the underline
  box a "A"
  box b "B"
  group g "G" {
    box inner "Inner"
    pen q [(20, 40), (60, 40)]
  }
  placement {
    place a at (300, 100)
    place b at (500, 200)
    place g at (300, 400)
    size g (400, 200)
    place inner at (80, 30)
  }
}
`;

describe("pen strokes on the canvas", () => {
  it("draws a stroke inside a group in its interior, as drawn, and selects nothing", () => {
    const canvas = open(grouped);
    canvas.session.receive({ type: "select", ids: ["c"] });
    const origin = interior(canvas);
    const text = canvas.apply({
      kind: "createPen",
      points: [
        { x: origin.x + 40, y: origin.y + 60 },
        { x: origin.x + 90.46, y: origin.y + 58.04 },
        { x: origin.x + 140, y: origin.y + 70 },
      ],
      parent: "g",
      style: { width: 4 },
    });
    expect(text).toContain('    box b "B"\n    pen pen1 [(40, 60), (90.5, 58), (140, 70)]\n  }\n');
    expect(text).toContain("style pen1 { width 4 }");
    // The selection stays as it was, and no editor opens on the stroke.
    expect(canvas.session.selected).toEqual(["c"]);
    expect(canvas.shown().some((m) => m.type === "select")).toBe(false);
  });

  it("writes no style for a stroke with the defaults, and the highlighter's three", () => {
    const plain = open(grouped).apply({
      kind: "createPen",
      points: [{ x: 600, y: 400 }],
      style: penStyleFor("pen", DEFAULT_PEN_WIDTH, DEFAULT_PEN_STROKE),
    });
    expect(plain).toContain("  pen pen1 [(600, 400)]\n");
    expect(plain).not.toContain("style pen1");
    const highlighted = open(grouped).apply({
      kind: "createPen",
      points: [
        { x: 600, y: 400 },
        { x: 700, y: 400 },
      ],
      style: penStyleFor("highlighter", PEN_WIDTHS.thick, HIGHLIGHTER.stroke),
    });
    expect(highlighted).toContain("style pen1 { stroke highlight; width 20; opacity 0.35 }");
  });

  it("gives the canvas a stroke's drawn points, bounds and width", () => {
    const canvas = open(strokes);
    const p = canvas.element("p");
    expect(p.kind).toBe("pen");
    expect(p.pen!.points).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 20 },
      { x: 90, y: 10 },
    ]);
    expect(p.pen!.width).toBe(3);
    expect(p.pen!.bounds).toEqual({ x: 8.5, y: 8.5, width: 83, height: 13 });
    expect(p.box).toEqual(p.pen!.bounds);
    // In a group, drawn where the group's interior puts it.
    const q = canvas.element("q");
    const inner = canvas.element("inner");
    const origin = {
      x: inner.box.x + inner.box.width / 2 - 80,
      y: inner.box.y + inner.box.height / 2 - 30,
    };
    expect(q.parent).toBe("g");
    expect(q.pen!.points).toEqual([
      { x: origin.x + 20, y: origin.y + 40 },
      { x: origin.x + 60, y: origin.y + 40 },
    ]);
  });

  it("moves a stroke's points as the canvas gives them, in its group's interior", () => {
    const canvas = open(strokes);
    const q = canvas.element("q");
    const text = canvas.apply({
      kind: "setPenPoints",
      element: "q",
      points: q.pen!.points.map((p) => ({ x: p.x + 14, y: p.y + 0.25 })),
    });
    expect(text).toContain("pen q [(34, 40.3), (74, 40.3)]");
    // The comment after a stroke stays when its numbers change.
    const top = open(strokes).apply({
      kind: "setPenPoints",
      element: "p",
      points: [
        { x: 20, y: 10 },
        { x: 60, y: 20 },
        { x: 100, y: 10 },
      ],
    });
    expect(top).toContain("pen p [(20, 10), (60, 20), (100, 10)] // the underline");
  });

  it("refuses the points of a stroke for a box", () => {
    const result = open(strokes).act({
      kind: "setPenPoints",
      element: "a",
      points: [{ x: 0, y: 0 }],
    });
    expect(result.plan).toBeUndefined();
    expect(result.messages[0]).toMatchObject({ type: "rejected", code: "edit.unsafe-target" });
  });

  it("moves a stroke by its points, unsnapped, with a box beside it", () => {
    const moved = open(strokes).apply({ kind: "move", ids: ["p"], delta: { x: 30, y: 0 } });
    expect(moved).toContain("pen p [(40, 10), (80, 20), (120, 10)] // the underline");
    // A nudge moves it by one.
    const nudged = open(strokes).apply({ kind: "move", ids: ["p"], delta: { x: 1, y: 0 } });
    expect(nudged).toContain("pen p [(11, 10), (51, 20), (91, 10)]");
    const both = open(strokes).apply({ kind: "move", ids: ["p", "a"], delta: { x: 28, y: 14 } });
    expect(both).toContain("pen p [(38, 24), (78, 34), (118, 24)]");
    expect(places(both).get("a")).toEqual({ x: 328, y: 114 });
  });

  it("keeps a stroke in its group when it is dropped into another", () => {
    const text = open(strokes).apply({
      kind: "move",
      ids: ["q"],
      delta: { x: 14, y: 0 },
      parent: null,
    });
    expect(text).toContain("    pen q [(34, 40), (74, 40)]\n  }\n");
  });

  it("previews a stroke moved by the canvas", () => {
    const canvas = open(strokes);
    const answer = canvas.preview({ kind: "move", ids: ["p"], delta: { x: 30, y: 0 } });
    expect((answer.messages[0] as { svg: string | null }).svg).toContain("<svg");
  });

  it("scales a stroke's points about the corner its handle leaves, its width kept", () => {
    const canvas = open(strokes);
    const bounds = canvas.element("p").pen!.bounds;
    // The south-east handle: the box of the points, 80 × 10, becomes 160 × 20.
    const box = { x: bounds.x, y: bounds.y, width: 163, height: 23 };
    expect(canvas.preview({ kind: "resize", id: "p", box }).messages[0]).toMatchObject({
      type: "preview",
      svg: expect.stringContaining("<svg") as string,
    });
    const text = canvas.apply({ kind: "resize", id: "p", box });
    expect(text).toContain("pen p [(10, 10), (90, 30), (170, 10)] // the underline");
    expect(text).not.toMatch(/size p|place p/);
    expect(canvas.element("p").pen!.bounds).toEqual(box);
    // In a group, in its interior.
    const grouped = open(strokes);
    const q = grouped.element("q").pen!;
    const scaled = grouped.apply({
      kind: "resize",
      id: "q",
      box: { ...q.bounds, width: q.bounds.width + 40 },
    });
    expect(scaled).toContain("pen q [(20, 40), (100, 40)]");
  });

  it("maps points from a stroke's bounds to a box, the middle of an axis without extent", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 50, y: 20 },
      { x: 90, y: 10 },
    ];
    const bounds = { x: 8.5, y: 8.5, width: 83, height: 13 };
    expect(scalePenPoints(points, bounds, { x: 108.5, y: 8.5, width: 43, height: 13 }, 3)).toEqual([
      { x: 110, y: 10 },
      { x: 130, y: 20 },
      { x: 150, y: 10 },
    ]);
    // A dot sits in the middle of the box.
    expect(
      scalePenPoints(
        [{ x: 5, y: 5 }],
        { x: 3, y: 3, width: 4, height: 4 },
        {
          x: 0,
          y: 0,
          width: 24,
          height: 14,
        },
        4,
      ),
    ).toEqual([{ x: 12, y: 7 }]);
  });

  it("duplicates a stroke shifted by two grid steps", () => {
    const canvas = open(strokes);
    const text = canvas.apply({ kind: "duplicate", ids: ["p"] });
    expect(text).toContain("pen p_2 [(38, 38), (78, 48), (118, 38)]");
    expect(canvas.session.selected).toEqual(["p_2"]);
  });

  it("copies a stroke out of its group with the points it is drawn through, and pastes it", () => {
    const analysis = analyzeDocument({ text: strokes });
    const fragment = copyFragment(analysis, "s", ["q"])!;
    const canvas = open(strokes);
    const drawn = canvas.element("q").pen!.points;
    expect(fragment).toContain(`pen q [${drawn.map((p) => `(${p.x}, ${p.y})`).join(", ")}]`);
    expect(fragment).not.toContain("place q");
    const top = copyFragment(analysis, "s", ["p"])!;
    expect(top).toContain("pen p [(10, 10), (50, 20), (90, 10)]");
    const pasted = pasteOperations(analysis, "s", top, { at: { x: 150, y: 115 } });
    if (!pasted.ok) throw new Error(pasted.reason);
    const inserted = (pasted.operations[0] as { fragment: string }).fragment;
    // The stroke's middle lands on the point.
    expect(inserted).toContain("pen p_2 [(110, 110), (150, 120), (190, 110)]");
  });

  it("leaves strokes out of alignment and distribution", () => {
    const canvas = open(strokes);
    const aligned = canvas.apply({ kind: "align", ids: ["a", "b", "p"], edge: "left" });
    expect(aligned).toContain("pen p [(10, 10), (50, 20), (90, 10)]");
    expect(places(aligned).get("b")!.x).not.toBe(500);
  });
});

const board = `${PLAIN}diagram s: free {
  theme "plain"
  group todo "To do" {
    layout column
    sticky a "A"
    pen mark [(0, 0), (10, 10)]
    sticky b "B"
    line rule from (0, 0) to (20, 0)
  }
  group done "Done" {
    layout column
    sticky d "D"
  }
  sticky c "C"
  box x "X"
  placement {
    place todo at (200, 300)
    place done at (500, 300)
    place c at (800, 300)
    place x at (700, 100)
  }
}
`;

describe("stickies on the canvas", () => {
  it("creates a sticky with its text and opens its editor", () => {
    const canvas = open(grouped);
    const text = canvas.apply({ kind: "create", elementKind: "sticky", at: { x: 420, y: 266 } });
    expect(text).toContain('  sticky sticky1 "Sticky"\n');
    expect(text).toContain("place sticky1 at (420, 266)");
    expect(text).not.toContain("style sticky1");
    // The editor opens on the card, as on a new text.
    expect(canvas.shown()).toContainEqual({ type: "select", ids: ["sticky1"] });
    expect(canvas.session.selected).toEqual(["sticky1"]);
  });

  it("writes the colour chosen in the menu in the same edit", () => {
    const text = open(grouped).apply({
      kind: "create",
      elementKind: "sticky",
      at: { x: 420, y: 266 },
      fill: "#f8bbd0",
    });
    expect(text).toContain('  sticky sticky1 "Sticky"\n  style sticky1 { fill "#f8bbd0" }\n');
    expect(text).toContain("place sticky1 at (420, 266)");
  });

  it("writes the text in the interface language", () => {
    setLocale("es");
    const canvas = open(grouped);
    const text = canvas.apply({ kind: "create", elementKind: "sticky", at: { x: 420, y: 266 } });
    expect(text).toContain('  sticky sticky1 "Nota"\n');
    expect(canvas.shown()).toContainEqual({ type: "select", ids: ["sticky1"] });
  });
});

describe("lists on the canvas", () => {
  it("gives the canvas a list's arrangement and the children it places", () => {
    const canvas = open(board);
    expect(canvas.element("todo").list).toEqual({
      layout: "column",
      spacing: expect.any(Number) as number,
      align: "start",
      children: ["a", "b"],
    });
    expect(canvas.element("x").list).toBeUndefined();
    // A card has no place, and resizes all the same.
    expect(canvas.element("a")).toMatchObject({ parent: "todo", placed: false });
  });

  it("creates a column and a row from the group menu", () => {
    const column = open(grouped).apply({
      kind: "create",
      elementKind: "group",
      layout: "column",
      at: { x: 420, y: 266 },
    });
    expect(column).toContain('  group group1 "Column" { layout column }\n');
    expect(column).toContain("place group1 at (420, 266)");
    expect(column).toContain("size group1 (280, 168)");
    const row = open(grouped).apply({
      kind: "create",
      elementKind: "group",
      layout: "row",
      at: { x: 420, y: 266 },
    });
    expect(row).toContain('  group group1 "Row" { layout row }\n');
    setLocale("es");
    const columna = open(grouped).apply({
      kind: "create",
      elementKind: "group",
      layout: "column",
      at: { x: 420, y: 266 },
    });
    expect(columna).toContain('group group1 "Columna" { layout column }');
  });

  it("moves a card into a list at the bar's index, counting the list's lines and pens", () => {
    const canvas = open(board);
    // Between `a` and `b`: before `b`, the third declaration of the block.
    const text = canvas.apply({ kind: "move", ids: ["c"], parent: "todo", index: 1 });
    expect(declared(text, "todo")).toEqual([
      "sticky a",
      "pen mark",
      "sticky c",
      "sticky b",
      "line rule",
    ]);
    expect(places(text).has("c")).toBe(false);
    expect(text).not.toContain("size todo");
    expect(canvas.element("todo").list!.children).toEqual(["a", "c", "b"]);
  });

  it("puts several cards one after another at the index, and appends at the count", () => {
    const text = open(board).apply({
      kind: "move",
      ids: ["d", "c"],
      parent: "todo",
      index: 1,
    });
    expect(declared(text, "todo")).toEqual([
      "sticky a",
      "pen mark",
      "sticky d",
      "sticky c",
      "sticky b",
      "line rule",
    ]);
    // At the count: after the last card, the strokes and lines after it staying above it.
    const appended = open(board).apply({ kind: "move", ids: ["c"], parent: "todo", index: 2 });
    expect(declared(appended, "todo")).toEqual([
      "sticky a",
      "pen mark",
      "sticky b",
      "sticky c",
      "line rule",
    ]);
  });

  it("reorders a card within its list and writes no place", () => {
    const canvas = open(board);
    const text = canvas.apply({ kind: "move", ids: ["b"], parent: "todo", index: 0 });
    expect(declared(text, "todo")).toEqual(["sticky b", "sticky a", "pen mark", "line rule"]);
    expect(places(text).has("b")).toBe(false);
    // Alt+Down on `a`: after its neighbour.
    const down = open(board).apply({ kind: "move", ids: ["a"], parent: "todo", index: 1 });
    expect(declared(down, "todo")).toEqual(["pen mark", "sticky b", "sticky a", "line rule"]);
    expect(places(down).has("a")).toBe(false);
    // A card dropped where it is changes nothing, the stroke between the cards included.
    for (const [id, index] of [
      ["b", 1],
      ["a", 0],
    ] as const) {
      expect(open(board).act({ kind: "move", ids: [id], parent: "todo", index })).toEqual({
        messages: [],
      });
    }
  });

  it("previews a card dropped into a list making room", () => {
    const canvas = open(board);
    const answer = canvas.preview({ kind: "move", ids: ["c"], parent: "todo", index: 0 });
    expect((answer.messages[0] as { svg: string | null }).svg).toContain("<svg");
  });

  it("refuses a nudge of a card with the reason, and writes nothing", () => {
    const canvas = open(board);
    for (const action of [
      { kind: "move", ids: ["a"], delta: { x: 1, y: 0 } },
      { kind: "move", ids: ["a", "x"], delta: { x: 14, y: 0 } },
      // Released inside its own list without a position.
      { kind: "move", ids: ["a"], delta: { x: 0, y: 40 }, parent: "todo" },
    ] satisfies CanvasAction[]) {
      const result = canvas.act(action);
      expect(result.plan, JSON.stringify(action)).toBeUndefined();
      expect(result.messages).toEqual([
        {
          type: "rejected",
          code: "edit.invalid-value",
          reason: "`todo` places `a`: drag it between its neighbours, or press Alt+Up or Alt+Down.",
        },
      ]);
    }
    expect(
      (
        canvas.preview({ kind: "move", ids: ["a"], delta: { x: 1, y: 0 } }).messages[0] as {
          svg: string | null;
        }
      ).svg,
    ).toBeNull();
    // A pen in a list moves by its points, out of the list it would grow: to the top level,
    // drawn where it is dropped.
    const mark = canvas.element("mark").pen!.points;
    const moved = canvas.apply({ kind: "move", ids: ["mark"], delta: { x: 5, y: 0 } });
    expect(declared(moved, "todo")).toEqual(["sticky a", "sticky b", "line rule"]);
    expect(moved).toContain(`  pen mark [${mark.map((p) => `(${p.x + 5}, ${p.y})`).join(", ")}]\n`);
  });

  it("says so in Spanish", () => {
    setLocale("es");
    const result = open(board).act({ kind: "move", ids: ["a"], delta: { x: 1, y: 0 } });
    expect(result.messages[0]).toMatchObject({
      type: "rejected",
      reason: "`todo` coloca a `a`: arrástralo entre sus vecinos o pulsa Alt+Arriba o Alt+Abajo.",
    });
  });

  it("refuses a position in a group that is not a list", () => {
    const result = open(grouped).act({ kind: "move", ids: ["c"], parent: "g", index: 0 });
    expect(result.plan).toBeUndefined();
    expect(result.messages[0]).toMatchObject({
      type: "rejected",
      code: "edit.invalid-value",
      reason:
        "`g` is not a list: only a group with `layout column` or `layout row` takes a position.",
    });
  });

  it("takes a card out of its list with a place where it is dropped", () => {
    const canvas = open(board);
    const a = canvas.element("a");
    const text = canvas.apply({
      kind: "move",
      ids: ["a"],
      delta: { x: 400, y: 100 },
      parent: null,
    });
    expect(declared(text, "")).toContain("sticky a");
    expect(declared(text, "todo")).toEqual(["pen mark", "sticky b", "line rule"]);
    expect(places(text).get("a")).toEqual({
      x: Math.round(a.box.x + a.box.width / 2 + 400),
      y: Math.round(a.box.y + a.box.height / 2 + 100),
    });
    // The list keeps no size of the moment: it shrinks with its children.
    expect(text).not.toContain("size todo");
  });

  it("creates a card at the end of a list, or before a child, without a place", () => {
    const canvas = open(board);
    const text = canvas.apply({
      kind: "create",
      elementKind: "sticky",
      at: { x: 0, y: 0 },
      parent: "todo",
      index: 2,
    });
    expect(declared(text, "todo")).toEqual([
      "sticky a",
      "pen mark",
      "sticky b",
      "sticky sticky1",
      "line rule",
    ]);
    expect(places(text).has("sticky1")).toBe(false);
    expect(canvas.shown()).toContainEqual({ type: "select", ids: ["sticky1"] });
    const before = open(board).apply({
      kind: "create",
      elementKind: "sticky",
      at: { x: 0, y: 0 },
      parent: "todo",
      index: 1,
    });
    expect(declared(before, "todo")).toEqual([
      "sticky a",
      "pen mark",
      "sticky sticky1",
      "sticky b",
      "line rule",
    ]);
    // The + of a row: a column at its end.
    const row = board.replace(
      'group todo "To do" {\n    layout column',
      'group todo "To do" {\n    layout row',
    );
    const column = open(row).apply({
      kind: "create",
      elementKind: "group",
      layout: "column",
      at: { x: 0, y: 0 },
      parent: "todo",
      index: 2,
    });
    expect(column).toContain('    group group1 "Column" { layout column }\n');
    expect(declared(column, "todo")).toEqual([
      "sticky a",
      "pen mark",
      "sticky b",
      "group group1",
      "line rule",
    ]);
    expect(places(column).has("group1")).toBe(false);
    expect(column).toContain("size group1 (280, 168)");
  });

  it("resizes a card with its size alone", () => {
    const canvas = open(board);
    const a = canvas.element("a");
    const text = canvas.apply({
      kind: "resize",
      id: "a",
      box: { ...a.box, width: a.box.width + 40, height: a.box.height + 20 },
    });
    expect(text).toContain(
      `size a (${Math.round(a.box.width + 40)}, ${Math.round(a.box.height + 20)})`,
    );
    expect(places(text).has("a")).toBe(false);
    // A list writes its size, a least size, and its place.
    const todo = canvas.element("todo");
    expect(todo.sized).toBe(true);
    const resized = canvas.apply({
      kind: "resize",
      id: "todo",
      box: { ...todo.box, width: todo.box.width + 56 },
    });
    expect(resized).toContain(`size todo (${Math.round(todo.box.width + 56)}, `);
    expect(places(resized).has("todo")).toBe(true);
  });

  it("copies a list with its cards unplaced, and a card alone where it is drawn", () => {
    const analysis = analyzeDocument({ text: board });
    const list = copyFragment(analysis, "s", ["todo"])!;
    expect(list).toContain("place todo at (200, 300)");
    expect(list).not.toMatch(/place (a|b|mark|rule) /);
    const pasted = pasteOperations(analysis, "s", list, { shift: { x: 28, y: 28 } });
    if (!pasted.ok) throw new Error(pasted.reason);
    const inserted = (pasted.operations[0] as { fragment: string }).fragment;
    expect(inserted).toContain("place todo_2 at (228, 328)");
    // The pasted cards are placed by their list: the layout warns of no place.
    const codes = analyzeDocument({ text: inserted }).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("layout.place-ignored");
    expect(inserted).not.toMatch(/place (a|b|mark|rule)_2 /);
    const card = copyFragment(analysis, "s", ["a"])!;
    const a = open(board).element("a");
    expect(card).toContain(
      `place a at (${Math.round(a.box.x + a.box.width / 2)}, ${Math.round(a.box.y + a.box.height / 2)})`,
    );
  });

  it("leaves the children of a list out of alignment", () => {
    const canvas = open(board);
    const text = canvas.apply({ kind: "align", ids: ["a", "x", "c"], edge: "left" });
    expect(places(text).has("a")).toBe(false);
    expect(places(text).get("x")!.x).toBe(places(text).get("c")!.x);
  });

  it("writes an arrangement with no place for a list's children and no size for the list", () => {
    const auto = board.replace('  theme "plain"\n', '  theme "plain"\n  layout auto\n');
    const text = open(auto).apply({ kind: "move", ids: ["x"], delta: { x: 14, y: 0 } });
    expect(text).toContain("layout assisted");
    const written = places(text);
    for (const child of ["a", "b", "d", "mark", "rule"])
      expect(written.has(child), child).toBe(false);
    expect(written.has("todo")).toBe(true);
    expect(text).not.toMatch(/size (todo|done)/);
    // The strokes and the line keep their points.
    expect(text).toContain("pen mark [(0, 0), (10, 10)]");
  });
});

const kanban = readFileSync(
  join(REPO_ROOT, "packages", "cli", "templates", "kanban", "diagrams", "board.meltemi"),
  "utf8",
);
const lists = readFileSync(join(CORPUS_ROOT, "valid", "free", "lists.meltemi"), "utf8");

/** A plain untitled group without `size`, which derives its size from what it holds. */
const loose = `${PLAIN}diagram s: free {
  theme "plain"
  group g "" {
    box a "A"
    box b "B"
    pen q [(20, 20), (60, 20)]
  }
  box c "C"
  placement {
    place g at (300, 200)
    place a at (60, 30)
    place b at (200, 90)
    place c at (700, 200)
    size a (80, 40)
    size b (80, 40)
  }
}
`;

/** A list in a plain group without `size`. */
const nested = `${PLAIN}diagram s: free {
  theme "plain"
  group outer "" {
    box n "N"
    group col "Col" {
      layout column
      sticky a "A"
      sticky b "B"
    }
  }
  placement {
    place outer at (400, 300)
    place n at (60, 30)
    place col at (300, 200)
    size n (80, 40)
  }
}
`;

type Canvas = ReturnType<typeof open>;

/** The points a stroke is drawn through are the ones given, to the twentieth of a unit. */
function expectPoints(drawn: readonly Point[], given: readonly Point[]) {
  expect(drawn).toHaveLength(given.length);
  drawn.forEach((p, i) => {
    expect(Math.abs(p.x - given[i]!.x), `x of point ${i}`).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.abs(p.y - given[i]!.y), `y of point ${i}`).toBeLessThanOrEqual(0.05 + 1e-9);
  });
}

/** The drawn boxes of `ids`, to compare the picture before and after an edit. */
const boxesOf = (canvas: Canvas, ids: readonly string[]) =>
  new Map(ids.map((id) => [id, canvas.element(id).box]));

/** Every box of `before` is drawn where it was, within `tolerance`. */
function expectSameBoxes(
  canvas: Canvas,
  before: ReadonlyMap<string, ElementInfo["box"]>,
  tolerance = 1e-6,
) {
  for (const [id, box] of before) {
    const now = canvas.render().elements.find((e) => e.id === id)?.box;
    expect(now, id).toBeDefined();
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(now![key] - box[key]), `${id}.${key}`).toBeLessThanOrEqual(tolerance);
    }
  }
}

/** The canvas keeps drawing the edited text: a render and no `stale`, and no error in the text. */
function expectDrawing(canvas: Canvas) {
  const types = canvas.shown().map((m) => m.type);
  expect(types).toContain("render");
  expect(types).not.toContain("stale");
  const errors = analyzeDocument({ text: canvas.text() }).diagnostics.filter(
    (d) => d.severity === "error",
  );
  expect(errors.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
}

describe("strokes drawn over lists and groups", () => {
  it("writes a stroke across two columns outside the board, where it is drawn", () => {
    const canvas = open(kanban);
    const before = boxesOf(canvas, [
      "columns",
      "todo",
      "doing",
      "done",
      "search",
      "checkout",
      "cache",
      "signin",
    ]);
    const points = [
      { x: 152, y: 436 },
      { x: 268, y: 416 },
      { x: 384, y: 436 },
    ];
    // The canvas names the innermost group under the first point: the column.
    const text = canvas.apply({
      kind: "createPen",
      points,
      parent: "todo",
      style: { arrowhead: "triangle" },
    });
    expect(text).toContain("  pen pen1 [(152, 436), (268, 416), (384, 436)]\n");
    expect(declared(text, "")).toContain("pen pen1");
    for (const list of ["columns", "todo", "doing"]) {
      expect(declared(text, list)).not.toContain("pen pen1");
    }
    expectPoints(canvas.element("pen1").pen!.points, points);
    // No column moves or grows.
    expectSameBoxes(canvas, before);
    expectDrawing(canvas);
  });

  it("writes a stroke over a card outside its list, which does not grow", () => {
    const canvas = open(kanban);
    const before = boxesOf(canvas, ["columns", "todo", "doing", "invoices", "search", "reviews"]);
    const points = [
      { x: 100, y: 400 },
      { x: 150.5, y: 430.2 },
      { x: 200, y: 410 },
    ];
    const text = canvas.apply({ kind: "createPen", points, parent: "todo" });
    expect(text).toContain("  pen pen1 [(100, 400), (150.5, 430.2), (200, 410)]\n");
    expect(declared(text, "todo")).not.toContain("pen pen1");
    expectPoints(canvas.element("pen1").pen!.points, points);
    expectSameBoxes(canvas, before);
    expectDrawing(canvas);
  });

  it("keeps a group without size as drawn when a stroke goes into it", () => {
    const canvas = open(loose);
    const g = canvas.element("g").box;
    const before = boxesOf(canvas, ["g", "a", "b", "q", "c"]);
    // Inside the group, into its padding at the right and the bottom, where its derived size
    // would grow about its centre.
    const points = [
      { x: g.x + 40, y: g.y + g.height - 6 },
      { x: g.x + g.width / 2 + 0.3, y: g.y + g.height - 10.4 },
      { x: g.x + g.width - 6, y: g.y + g.height - 6 },
    ];
    const text = canvas.apply({ kind: "createPen", points, parent: "g" });
    expect(declared(text, "g")).toContain("pen pen1");
    expect(text).toContain(`size g (${g.width}, ${g.height})`);
    expectPoints(canvas.element("pen1").pen!.points, points);
    expectSameBoxes(canvas, before);
    expectDrawing(canvas);
  });

  it("writes a stroke that leaves its group at the top level, and one drawn there as drawn", () => {
    const leaving = open(grouped);
    const text = leaving.apply({
      kind: "createPen",
      points: [
        { x: 450, y: 200 },
        { x: 650, y: 200 },
      ],
      parent: "g",
    });
    expect(declared(text, "")).toContain("pen pen1");
    expect(text).toContain("  pen pen1 [(450, 200), (650, 200)]\n");
    const points = [
      { x: 600, y: 400.5 },
      { x: 650.3, y: 420 },
    ];
    const top = open(grouped);
    const drawn = top.apply({ kind: "createPen", points });
    // The stroke is all the edit writes.
    expect(drawn.replace("  pen pen1 [(600, 400.5), (650.3, 420)]\n", "")).toBe(grouped);
    expectPoints(top.element("pen1").pen!.points, points);
    expectDrawing(top);
  });

  it("moves a stroke out of its list to where it is dropped, and scales it there", () => {
    const cards = ["board", "todo", "done", "brief", "name", "parts", "steps"];
    const canvas = open(lists);
    const check = canvas.element("check").pen!;
    const before = boxesOf(canvas, cards);
    const delta = { x: 30, y: 10 };
    expect(
      (canvas.preview({ kind: "move", ids: ["check"], delta }).messages[0] as { svg: unknown }).svg,
    ).toEqual(expect.stringContaining("<svg"));
    const text = canvas.apply({ kind: "move", ids: ["check"], delta });
    expect(declared(text, "done")).toEqual(["sticky name"]);
    expect(declared(text, "")).toContain("pen check");
    expectPoints(
      canvas.element("check").pen!.points,
      check.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
    );
    expectSameBoxes(canvas, before);
    expectDrawing(canvas);
    // Scaled from the canvas in its list, it leaves the list too.
    const scaled = open(lists);
    const bounds = scaled.element("check").pen!.bounds;
    const box = {
      x: bounds.x - 10,
      y: bounds.y,
      width: bounds.width * 2,
      height: bounds.height * 2,
    };
    const resized = scaled.apply({ kind: "resize", id: "check", box });
    expect(declared(resized, "done")).toEqual(["sticky name"]);
    expectPoints(
      scaled.element("check").pen!.points,
      scalePenPoints(check.points, check.bounds, box, check.width),
    );
    expectSameBoxes(scaled, new Map([...before, ["check", box]]), 0.051);
    expectDrawing(scaled);
  });

  it("moves and scales a stroke in a group without size, which stays as drawn", () => {
    const canvas = open(loose);
    const q = canvas.element("q").pen!;
    const before = boxesOf(canvas, ["g", "a", "b", "c"]);
    // Past the farthest child: the derived size would grow.
    const delta = { x: 220, y: 70 };
    const text = canvas.apply({ kind: "move", ids: ["q"], delta });
    expect(declared(text, "g")).toContain("pen q");
    expectPoints(
      canvas.element("q").pen!.points,
      q.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
    );
    expectSameBoxes(canvas, before);
    expectDrawing(canvas);
    const scaled = open(loose);
    const box = { ...q.bounds, width: q.bounds.width + 200, height: q.bounds.height + 60 };
    scaled.apply({ kind: "resize", id: "q", box });
    expectPoints(scaled.element("q").pen!.points, scalePenPoints(q.points, q.bounds, box, q.width));
    expectSameBoxes(scaled, before);
    expectDrawing(scaled);
  });
});

describe("lists that stop placing their children", () => {
  it("places the children where they are drawn when a list's layout goes", () => {
    const canvas = open(board);
    const before = boxesOf(canvas, ["todo", "a", "b", "mark", "rule", "done", "c"]);
    const text = canvas.apply({ kind: "setField", ids: ["todo"], field: "layout", value: "none" });
    expect(text).not.toContain("layout column\n    sticky a");
    expect([...places(text).keys()]).toEqual(expect.arrayContaining(["a", "b"]));
    // Lines and pens keep their points.
    expect(text).toContain("pen mark [(0, 0), (10, 10)]");
    expect(text).toContain("line rule from (0, 0) to (20, 0)");
    expectSameBoxes(canvas, before, 1);
    expectDrawing(canvas);
  });

  it("writes the size a list stretched each child to", () => {
    const canvas = open(kanban);
    const ids = ["columns", "todo", "doing", "done", "invoices", "checkout", "signin"];
    const before = boxesOf(canvas, ids);
    const text = canvas.apply({
      kind: "setField",
      ids: ["columns"],
      field: "layout",
      value: "none",
    });
    for (const column of ["todo", "doing", "done"]) {
      expect(places(text).has(column), column).toBe(true);
      expect(text).toMatch(new RegExp(`size ${column} \\(`));
    }
    expectSameBoxes(canvas, before, 1);
    expectDrawing(canvas);
  });

  it("places a list's children where they are drawn when it is ungrouped", () => {
    const canvas = open(board);
    const before = boxesOf(canvas, ["a", "b", "mark", "rule", "done", "c"]);
    const text = canvas.apply({ kind: "ungroup", id: "todo" });
    expect(declared(text, "")).toEqual(
      expect.arrayContaining(["sticky a", "pen mark", "sticky b", "line rule"]),
    );
    expect([...places(text).keys()]).toEqual(expect.arrayContaining(["a", "b"]));
    expectSameBoxes(canvas, before, 1);
    expectDrawing(canvas);
  });

  it("places them in the group the list was in, which stays as drawn", () => {
    const canvas = open(nested);
    const before = boxesOf(canvas, ["outer", "n", "a", "b"]);
    const text = canvas.apply({ kind: "ungroup", id: "col" });
    expect(declared(text, "outer")).toEqual(["box n", "sticky a", "sticky b"]);
    expect([...places(text).keys()]).toEqual(expect.arrayContaining(["a", "b"]));
    expect(text).toMatch(/size outer \(/);
    expectSameBoxes(canvas, before, 1);
    expectDrawing(canvas);
  });

  it("gives the children of a list ungrouped into another list no place", () => {
    const canvas = open(kanban);
    const text = canvas.apply({ kind: "ungroup", id: "todo" });
    expect(declared(text, "columns")).toEqual([
      "sticky invoices",
      "sticky search",
      "sticky reviews",
      "group doing",
      "group done",
    ]);
    for (const card of ["invoices", "search", "reviews"]) {
      expect(places(text).has(card), card).toBe(false);
    }
    expectDrawing(canvas);
  });

  it("leaves the children to the engine of an automatic diagram", () => {
    const auto = board.replace('  theme "plain"\n', '  theme "plain"\n  layout auto\n');
    for (const action of [
      { kind: "ungroup", id: "todo" },
      { kind: "setField", ids: ["todo"], field: "layout", value: "none" },
    ] satisfies CanvasAction[]) {
      const canvas = open(auto);
      const text = canvas.apply(action);
      expect(text, action.kind).toContain("  layout auto\n");
      expect(places(text).has("a"), action.kind).toBe(false);
      expectDrawing(canvas);
    }
  });

  it("groups cards of a list into a list of the same layout where the first was", () => {
    const canvas = open(board);
    const text = canvas.apply({ kind: "group", ids: ["b", "a"] });
    expect(text).toContain(
      '    group group1 "Group" {\n      layout column\n      sticky a "A"\n      sticky b "B"\n    }\n',
    );
    expect(declared(text, "todo")).toEqual(["group group1", "pen mark", "line rule"]);
    expect(places(text).has("group1")).toBe(false);
    expect(canvas.session.selected).toEqual(["group1"]);
    expectDrawing(canvas);
    // In a row, a row.
    const row = open(kanban);
    const columns = row.apply({ kind: "group", ids: ["doing", "done"] });
    expect(columns).toMatch(/group group1 "Group" \{\n\s+layout row\n\s+group doing/);
    expectDrawing(row);
  });
});

describe("lists that grow and shrink from their corner", () => {
  const cards = ["invoices", "search", "reviews", "checkout", "cache", "signin"];
  /** The drawn top-left corners of `ids`, to compare before and after an edit. */
  const cornersOf = (canvas: Canvas, ids: readonly string[]) =>
    new Map(
      ids.map((id) => {
        const { x, y } = canvas.element(id).box;
        return [id, { x, y }];
      }),
    );
  function expectSameCorners(canvas: Canvas, before: ReadonlyMap<string, Point>) {
    for (const [id, corner] of before) {
      const box = canvas.element(id).box;
      expect(Math.abs(box.x - corner.x), `${id}.x`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.y - corner.y), `${id}.y`).toBeLessThanOrEqual(0.5);
    }
  }

  it("grows a column downward when its plus adds a card, the cards staying", () => {
    const canvas = open(kanban);
    const before = boxesOf(canvas, cards);
    const corners = cornersOf(canvas, ["columns", "todo", "doing", "done"]);
    const height = canvas.element("todo").box.height;
    const text = canvas.apply({
      kind: "create",
      elementKind: "sticky",
      at: { x: 0, y: 0 },
      parent: "todo",
      index: 3,
    });
    expect(declared(text, "todo")).toContain("sticky sticky1");
    // The row grew by a card and a gap: its place moved down by half that.
    expect(places(text).get("columns")).toEqual({ x: 384, y: 424 + (160 + 12) / 2 });
    expect(canvas.element("todo").box.height).toBe(height + 172);
    expectSameBoxes(canvas, before, 0.5);
    expectSameCorners(canvas, corners);
    expectDrawing(canvas);
  });

  it("keeps the columns' tops when cards move from To do to Doing", () => {
    const canvas = open(kanban);
    const before = boxesOf(canvas, ["invoices", "checkout", "cache", "signin"]);
    const corners = cornersOf(canvas, ["columns", "todo", "doing", "done"]);
    // The preview draws what the drop writes.
    const move = { kind: "move", ids: ["search", "reviews"], parent: "doing", index: 2 } as const;
    const preview = canvas.preview(move).messages[0] as { svg: string | null };
    const text = canvas.apply(move);
    expect(declared(text, "doing")).toEqual([
      "sticky checkout",
      "sticky cache",
      "sticky search",
      "sticky reviews",
    ]);
    expect(places(text).get("columns")!.y).toBe(424 + 172 / 2);
    expect(preview.svg).toBe(canvas.render().svg);
    expectSameBoxes(canvas, before, 0.5);
    expectSameCorners(canvas, corners);
    expectDrawing(canvas);
  });

  it("keeps a column's top when a card is removed or taken out", () => {
    for (const action of [
      { kind: "remove", ids: ["reviews"], cascade: true },
      { kind: "move", ids: ["reviews"], parent: null, delta: { x: 700, y: 0 } },
    ] satisfies CanvasAction[]) {
      const canvas = open(kanban);
      const before = boxesOf(canvas, ["invoices", "search", "checkout", "cache", "signin"]);
      const corners = cornersOf(canvas, ["columns", "todo", "doing", "done"]);
      const text = canvas.apply(action);
      expect(places(text).get("columns")!.y, action.kind).toBe(424 - 172 / 2);
      expectSameBoxes(canvas, before, 0.5);
      expectSameCorners(canvas, corners);
      expectDrawing(canvas);
    }
  });

  it("keeps a column's top when a card in it is resized", () => {
    const canvas = open(kanban);
    const before = boxesOf(canvas, ["invoices", "checkout", "cache", "signin"]);
    const corners = cornersOf(canvas, ["columns", "todo", "doing", "done", "search", "reviews"]);
    const invoices = canvas.element("invoices").box;
    const text = canvas.apply({
      kind: "resize",
      id: "invoices",
      box: { ...invoices, height: invoices.height + 100 },
    });
    expect(places(text).get("columns")!.y).toBe(424 + 50);
    before.set("invoices", { ...invoices, height: invoices.height + 100 });
    expectSameBoxes(canvas, before, 0.5);
    // The cards below moved down; the columns' tops stayed.
    expect(canvas.element("search").box.y).toBe(corners.get("search")!.y + 100);
    corners.delete("search");
    corners.delete("reviews");
    expectSameCorners(canvas, corners);
    expectDrawing(canvas);
  });

  it("keeps the corner of a list in a group without size, and of the group", () => {
    const canvas = open(nested);
    const before = boxesOf(canvas, ["n", "a", "b"]);
    const corners = cornersOf(canvas, ["outer", "col"]);
    const text = canvas.apply({
      kind: "create",
      elementKind: "sticky",
      at: { x: 0, y: 0 },
      parent: "col",
      index: 2,
    });
    expect(declared(text, "col")).toEqual(["sticky a", "sticky b", "sticky sticky1"]);
    expect(places(text).get("col")).not.toEqual({ x: 300, y: 200 });
    expect(places(text).get("outer")).not.toEqual({ x: 400, y: 300 });
    expectSameBoxes(canvas, before, 0.5);
    expectSameCorners(canvas, corners);
    expectDrawing(canvas);
  });

  it("writes no place in an automatic diagram", () => {
    const auto = `${PLAIN}diagram s: free {
  theme "plain"
  layout auto
  group todo "To do" {
    layout column
    sticky a "A"
    sticky b "B"
  }
  box x "X"
}
`;
    const removed = open(auto);
    const text = removed.apply({ kind: "remove", ids: ["a"], cascade: true });
    expect(text).toContain("  layout auto\n");
    expect(text).not.toContain("place");
    expectDrawing(removed);
    // A creation writes the arrangement as drawn first, as in any `auto` diagram: the list's place
    // is where its centre was drawn, not moved for its corner.
    const created = open(auto);
    const todo = created.element("todo").box;
    const written = created.apply({
      kind: "create",
      elementKind: "sticky",
      at: { x: 0, y: 0 },
      parent: "todo",
      index: 2,
    });
    const place = places(written).get("todo")!;
    expect(Math.abs(place.y - (todo.y + todo.height / 2))).toBeLessThanOrEqual(0.5);
    expectDrawing(created);
  });
});

describe("the whiteboard's actions and messages", () => {
  const action = (a: unknown) => isCanvasMessage({ type: "action", revision: 1, action: a });

  it("accepts a stroke with one point at least and a style within bounds", () => {
    const points = [{ x: 1, y: 2 }];
    expect(action({ kind: "createPen", points })).toBe(true);
    expect(action({ kind: "createPen", points, parent: "g", style: { stroke: "@danger" } })).toBe(
      true,
    );
    expect(action({ kind: "createPen", points, style: { stroke: "#e03131", width: 8 } })).toBe(
      true,
    );
    expect(action({ kind: "createPen", points: [] })).toBe(false);
    expect(action({ kind: "createPen", points, style: { width: 900 } })).toBe(false);
    expect(action({ kind: "createPen", points, style: { opacity: 2 } })).toBe(false);
    expect(action({ kind: "createPen", points, style: { stroke: "red; width 9" } })).toBe(false);
    expect(action({ kind: "setPenPoints", element: "p", points })).toBe(true);
    expect(action({ kind: "setPenPoints", element: "p", points: [{ x: 1 }] })).toBe(false);
  });

  it("accepts a move into a list at an index, with or without a delta", () => {
    expect(action({ kind: "move", ids: ["a"], parent: "todo", index: 0 })).toBe(true);
    expect(
      action({ kind: "move", ids: ["a"], parent: "todo", index: 2, delta: { x: 1, y: 0 } }),
    ).toBe(true);
    expect(action({ kind: "move", ids: ["a"], index: 0 })).toBe(false);
    expect(action({ kind: "move", ids: ["a"], parent: null, index: 0 })).toBe(false);
    expect(action({ kind: "move", ids: ["a"], parent: "todo" })).toBe(false);
    expect(action({ kind: "move", ids: ["a"], parent: "todo", index: -1 })).toBe(false);
    expect(action({ kind: "move", ids: ["a"], parent: "todo", index: 1.5 })).toBe(false);
  });

  it("accepts a sticky's fill, a list's layout and a position in a list", () => {
    const at = { x: 0, y: 0 };
    expect(action({ kind: "create", elementKind: "sticky", at, fill: "#f8bbd0" })).toBe(true);
    expect(action({ kind: "create", elementKind: "sticky", at, fill: "@sticky" })).toBe(true);
    expect(action({ kind: "create", elementKind: "sticky", at, fill: "pink" })).toBe(false);
    expect(action({ kind: "create", elementKind: "group", at, layout: "column" })).toBe(true);
    expect(action({ kind: "create", elementKind: "group", at, layout: "grid" })).toBe(false);
    expect(action({ kind: "create", elementKind: "box", at, layout: "row" })).toBe(false);
    expect(action({ kind: "create", elementKind: "sticky", at, parent: "todo", index: 3 })).toBe(
      true,
    );
    expect(action({ kind: "create", elementKind: "sticky", at, index: 3 })).toBe(false);
  });

  it("bounds the pen part of a laser batch", () => {
    const laser = (pen: unknown) =>
      isCanvasMessage({ type: "presenceLaser", points: [{ x: 1, y: 2, t: 0 }], pen });
    const good = { width: 4, colour: "#e03131", opacity: 1, stroke: 7 };
    expect(laser(good)).toBe(true);
    expect(laser(undefined)).toBe(true);
    expect(laser({ ...good, width: 900 })).toBe(false);
    expect(laser({ ...good, width: 4.5 })).toBe(false);
    expect(laser({ ...good, width: 0 })).toBe(false);
    expect(laser({ ...good, colour: "x".repeat(40) })).toBe(false);
    expect(laser({ ...good, opacity: 2 })).toBe(false);
    expect(laser({ ...good, opacity: Number.NaN })).toBe(false);
    expect(isPresencePen({ width: 20, colour: "#ffe600", opacity: 0.35, stroke: 0 })).toBe(true);
    expect(isPresencePen({ ...good, colour: "x".repeat(PRESENCE_PEN_LIMITS.colour) })).toBe(true);
    expect(isPresencePen(null)).toBe(false);
  });

  it("numbers the strokes of a laser batch, and marks the batch of a cancelled one", () => {
    const laser = (pen: unknown, points: unknown[] = [{ x: 1, y: 2, t: 0 }]) =>
      isCanvasMessage({ type: "presenceLaser", points, pen });
    const good = { width: 4, colour: "#e03131", opacity: 1, stroke: 7 };
    expect(PRESENCE_PEN_LIMITS.stroke).toEqual({ min: 0, max: 2_147_483_647 });
    for (const stroke of [0, 1, 2_147_483_647]) {
      expect(isPresencePen({ ...good, stroke }), String(stroke)).toBe(true);
    }
    // Escape: the batch that ends the stroke says so, and may hold no points.
    expect(laser({ ...good, cancel: true })).toBe(true);
    expect(laser({ ...good, cancel: true }, [])).toBe(true);
    for (const bad of [
      { width: 4, colour: "#e03131", opacity: 1 },
      { ...good, stroke: -1 },
      { ...good, stroke: 2_147_483_648 },
      { ...good, stroke: 1.5 },
      { ...good, stroke: "7" },
      { ...good, stroke: Number.NaN },
      { ...good, stroke: null },
      { ...good, cancel: false },
      { ...good, cancel: "true" },
      { ...good, cancel: 1 },
      { ...good, cancel: null },
    ]) {
      expect(isPresencePen(bad), JSON.stringify(bad)).toBe(false);
      expect(laser(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("the whiteboard's keys", () => {
  const key = (
    k: string,
    mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
  ) => ({
    key: k,
    code: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it("arms the pen, the highlighter and the eraser, and makes a sticky, on free diagrams", () => {
    expect(commandFor(key("p"), false, "free")).toBe("penTool");
    expect(commandFor(key("h"), false, "free")).toBe("highlighterTool");
    expect(commandFor(key("e"), false, "free")).toBe("eraserTool");
    expect(commandFor(key("s"), false, "free")).toBe("createSticky");
    expect(commandFor(key("P", { shiftKey: true }), false, "free")).toBeUndefined();
    // Ctrl+Alt+H stays the distribution.
    expect(commandFor(key("h", { ctrlKey: true, altKey: true }), false, "free")).toBe(
      "distributeHorizontal",
    );
  });

  it("adds after the selection and moves it in its list", () => {
    expect(commandFor(key("Enter", { ctrlKey: true }), false, "free")).toBe("addToList");
    expect(commandFor(key("Enter", { metaKey: true }), true, "free")).toBe("addToList");
    expect(commandFor(key("Enter"), false, "free")).toBe("editLabel");
    expect(commandFor(key("ArrowUp", { altKey: true }), false, "free")).toBe("moveInListBefore");
    expect(commandFor(key("ArrowDown", { altKey: true }), false, "free")).toBe("moveInListAfter");
  });

  it("does none of it on the other profiles", () => {
    const whiteboard = [
      "penTool",
      "highlighterTool",
      "eraserTool",
      "createSticky",
      "addToList",
      "moveInListBefore",
      "moveInListAfter",
    ];
    for (const profile of ["flow", "sequence", "c4"] as const) {
      for (const k of [
        key("p"),
        key("h"),
        key("e"),
        key("s"),
        key("Enter", { ctrlKey: true }),
        key("ArrowUp", { altKey: true }),
        key("ArrowDown", { altKey: true }),
      ]) {
        const command = commandFor(k, false, profile);
        expect(whiteboard, `${profile}: ${JSON.stringify(k)}`).not.toContain(command);
      }
    }
    expect(commandFor(key("s"))).toBe("createData");
    expect(commandFor(key("ArrowUp", { altKey: true }), false, "sequence")).toBe("moveEventUp");
    expect(commandFor(key("Enter", { ctrlKey: true }))).toBeUndefined();
  });

  it("describes the keys in the interface language", () => {
    const describe = (command: string) => KEY_BINDINGS.find((b) => b.command === command)!;
    expect(describe("penTool").description).toBe("Pen: draw strokes until Escape");
    setLocale("es");
    expect(describe("penTool").description).toBe("Lápiz: dibujar trazos hasta Escape");
    expect(describe("eraserTool").description).toBe("Borrador: eliminar los trazos que cruza");
    expect(describe("createSticky").description).toBe("Crear una nota adhesiva");
  });
});

describe("the whiteboard's palette", () => {
  it("has the six sticky colours in the menu's order", () => {
    expect(STICKY_COLOURS).toEqual([
      { name: "yellow", hex: "#fff59d" },
      { name: "pink", hex: "#f8bbd0" },
      { name: "green", hex: "#c8e6c9" },
      { name: "blue", hex: "#bbdefb" },
      { name: "orange", hex: "#ffe0b2" },
      { name: "purple", hex: "#e1bee7" },
    ]);
  });

  it("has three widths, the highlighter and the layout's default width", () => {
    expect(PEN_WIDTHS).toEqual({ thin: 2, medium: 4, thick: 8 });
    expect(HIGHLIGHTER).toEqual({ width: 20, opacity: 0.35, stroke: "@highlight" });
    expect(DEFAULT_PEN_STROKE).toBe("@ink");
    expect(DEFAULT_PEN_WIDTH).toBe(LAYOUT_PEN_WIDTH);
  });

  it("writes only what differs from a stroke's defaults", () => {
    expect(penStyleFor("pen", 3, "@ink")).toEqual({});
    expect(penStyleFor("pen", PEN_WIDTHS.thick, "@danger")).toEqual({
      stroke: "@danger",
      width: 8,
    });
    expect(penStyleFor("pen", PEN_WIDTHS.thin, "@ink")).toEqual({ width: 2 });
    expect(penStyleFor("pen", 3, "#e03131")).toEqual({ stroke: "#e03131" });
    // The highlighter writes its colour, its width and its opacity whatever the pen's width.
    expect(penStyleFor("highlighter", PEN_WIDTHS.medium, "@highlight")).toEqual({
      stroke: "@highlight",
      width: 20,
      opacity: 0.35,
    });
    expect(penStyleFor("highlighter", 3, "#ff8a65")).toEqual({
      stroke: "#ff8a65",
      width: 20,
      opacity: 0.35,
    });
  });
});
