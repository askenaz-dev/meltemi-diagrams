import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile, type PlaceEntry } from "@meltemi/diagrams-model";
import {
  analyzeDocument,
  CanvasSession,
  codeActions,
  completions,
  copyFragment,
  definition,
  hover,
  inspect,
  pasteOperations,
  references,
  semanticTokens,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";

function at(source: string) {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  return { analysis: analyzeDocument({ text }), offset, text };
}

function open(text: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  const messages = session.update(analyzeDocument({ text: current, revision: rev }));
  const act = (action: CanvasAction) => session.receive({ type: "action", revision: rev, action });
  const apply = (action: CanvasAction): string => {
    const result = act(action);
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    current = applyTextEdits(current, result.plan.edits);
    rev++;
    session.update(analyzeDocument({ text: current, revision: rev }));
    return current;
  };
  return { session, messages, act, apply, text: () => current };
}

const render = (messages: readonly HostMessage[]) =>
  messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")!;

const places = (text: string, diagram = 0) =>
  new Map(
    compile(text)
      .document.diagrams[diagram]!.placement.filter((p): p is PlaceEntry => p.statement === "place")
      .map((p) => [p.target, { x: p.x, y: p.y }]),
  );

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

describe("free lines on the canvas", () => {
  const sheet = (theme = "technical.light", body = "  box a") =>
    `diagram s: free {\n  theme "${theme}"\n${body}\n  placement { place a at (600, 400) }\n}\n`;

  it("draws a line with the armed kind's styles and the theme's head, and selects it", () => {
    const canvas = open(sheet());
    const text = canvas.apply({
      kind: "createLine",
      from: { x: 98, y: 98 },
      to: { x: 294, y: 98 },
      line: "solid",
      heads: "end",
    });
    expect(text).toContain("  line line1 from (98, 98) to (294, 98)\n");
    expect(text).toContain("  style line1 { arrowhead triangle }\n");
    expect(canvas.session.selected).toEqual(["line1"]);
  });

  it("writes a dashed line without heads, a plain line with no style, two heads by the theme", () => {
    const dashed = open(sheet()).apply({
      kind: "createLine",
      from: { x: 0, y: 0 },
      to: { x: 98, y: 0 },
      line: "dashed",
      heads: "none",
    });
    expect(dashed).toContain("style line1 { line dashed }");
    const plain = open(sheet()).apply({
      kind: "createLine",
      from: { x: 0, y: 0 },
      to: { x: 98, y: 0 },
      line: "solid",
      heads: "none",
    });
    expect(plain).toContain("line line1 from (0, 0) to (98, 0)");
    expect(plain).not.toContain("style line1");
    const editorial = open(sheet("editorial.light")).apply({
      kind: "createLine",
      from: { x: 0, y: 0 },
      to: { x: 98, y: 0 },
      line: "solid",
      heads: "both",
    });
    expect(editorial).toContain("style line1 { arrowtail open; arrowhead open }");
  });

  it("declares a line drawn in a group inside it, in its interior coordinates", () => {
    const canvas = open(grouped);
    const a = render(canvas.messages).elements.find((e) => e.id === "a")!;
    // `a` is placed at (80, 30) in the interior: its centre gives the interior origin.
    const origin = { x: a.box.x + a.box.width / 2 - 80, y: a.box.y + a.box.height / 2 - 30 };
    const text = canvas.apply({
      kind: "createLine",
      from: { x: origin.x + 14, y: origin.y + 98 },
      to: { x: origin.x + 154, y: origin.y + 98 },
      parent: "g",
      line: "solid",
      heads: "none",
    });
    // Snapped on the canvas's grid, then written in the group's interior.
    const written =
      / {4}box b "B"\n {4}line line1 from \((-?\d+), (-?\d+)\) to \((-?\d+), (-?\d+)\)\n {2}\}/.exec(
        text,
      );
    expect(written).not.toBeNull();
    const [fx, fy, tx, ty] = written!.slice(1).map(Number);
    expect([tx! - fx!, ty! - fy!]).toEqual([140, 0]);
    expect(Math.abs(fx! - 14)).toBeLessThanOrEqual(7);
  });

  it("gives a line's points to the canvas, moves an end, adds a bend and takes it away", () => {
    const canvas = open(sheet("technical.light", "  box a\n  line l from (98, 98) to (294, 98)"));
    const info = render(canvas.messages).elements.find((e) => e.id === "l")!;
    expect(info.kind).toBe("line");
    expect(info.line!.points).toEqual([
      { x: 98, y: 98 },
      { x: 294, y: 98 },
    ]);
    let text = canvas.apply({
      kind: "setLinePoints",
      element: "l",
      from: { x: 98, y: 98 },
      to: { x: 350, y: 168 },
      via: [],
    });
    expect(text).toContain("line l from (98, 98) to (350, 168)\n");
    text = canvas.apply({
      kind: "setLinePoints",
      element: "l",
      from: { x: 98, y: 98 },
      to: { x: 350, y: 168 },
      via: [{ x: 224, y: 189 }],
    });
    expect(text).toContain("line l from (98, 98) to (350, 168) via [(224, 189)]\n");
    text = canvas.apply({
      kind: "setLinePoints",
      element: "l",
      from: { x: 126, y: 112 },
      to: { x: 378, y: 182 },
      via: [],
    });
    expect(text).toContain("line l from (126, 112) to (378, 182)\n");
  });

  it("writes a moved point of a line in a group in the group's interior", () => {
    const text = grouped.replace(
      '    box b "B"\n',
      '    box b "B"\n    line l from (20, 40) to (120, 40)\n',
    );
    const canvas = open(text);
    const l = render(canvas.messages).elements.find((e) => e.id === "l")!;
    const start = l.line!.points[0]!;
    const after = canvas.apply({
      kind: "setLinePoints",
      element: "l",
      from: { x: start.x + 14, y: start.y },
      to: l.line!.points[1]!,
      via: [],
    });
    expect(after).toContain("line l from (34, 40) to (120, 40)\n");
  });

  it("copies a line with its label statement and pastes it shifted", () => {
    const text = sheet(
      "technical.light",
      '  box a\n  line l "Step" from (98, 98) to (294, 98) via [(196, 140)]',
    ).replace(
      "  placement { place a at (600, 400) }",
      "  placement {\n    place a at (600, 400)\n    label l at 30%\n  }",
    );
    const analysis = analyzeDocument({ text });
    const fragment = copyFragment(analysis, "s", ["l"])!;
    expect(fragment).toContain('line l "Step" from (98, 98) to (294, 98) via [(196, 140)]');
    expect(fragment).toContain("label l at 30%");
    expect(fragment).not.toContain("place l");
    const pasted = pasteOperations(analysis, "s", fragment, { shift: { x: 28, y: 14 } });
    if (!pasted.ok) throw new Error(pasted.reason);
    const inserted = (pasted.operations[0] as { fragment: string }).fragment;
    expect(inserted).toContain('line l_2 "Step" from (126, 112) to (322, 112) via [(224, 154)]');
    expect(inserted).toContain("label l_2 at 30%");
  });

  it("moves a whole line, and a line with boxes, by its points", () => {
    const canvas = open(
      sheet("technical.light", "  box a\n  line l from (98, 98) to (294, 98) via [(196, 140)]"),
    );
    const text = canvas.apply({ kind: "move", ids: ["l", "a"], delta: { x: 28, y: 14 } });
    expect(text).toContain("line l from (126, 112) to (322, 112) via [(224, 154)]");
    expect(text).toContain("place a at (628, 414)");
  });

  it("leaves lines out of alignment", () => {
    const canvas = open(
      sheet("technical.light", "  box a\n  box b\n  line l from (0, 0) to (98, 0)").replace(
        "  placement { place a at (600, 400) }",
        "  placement {\n    place a at (600, 400)\n    place b at (300, 200)\n  }",
      ),
    );
    const text = canvas.apply({ kind: "align", ids: ["a", "b", "l"], edge: "left" });
    expect(text).toContain("line l from (0, 0) to (98, 0)");
  });

  it("edits a line's label in place on its pill", () => {
    const canvas = open(
      sheet("technical.light", '  box a\n  line l "Step" from (0, 0) to (300, 0)'),
    );
    const info = render(canvas.messages).elements.find((e) => e.id === "l")!;
    expect(info.text).toBeDefined();
    // The editor opens on the pill, at the middle of the line.
    expect(info.text!.anchor.x).toBeCloseTo(150, 0);
    const text = canvas.apply({ kind: "setLabel", id: "l", label: "Done" });
    expect(text).toContain('line l "Done" from (0, 0) to (300, 0)');
    const unlabelled = open(sheet("technical.light", "  box a\n  line l from (0, 0) to (300, 0)"));
    expect(unlabelled.apply({ kind: "setLabel", id: "l", label: "Go" })).toContain(
      'line l "Go" from (0, 0) to (300, 0)',
    );
  });

  it("moves a line's label pill, and shows a line with a relation's strip", () => {
    const canvas = open(
      sheet("technical.light", '  box a\n  line l "Step" from (0, 0) to (300, 0)'),
    );
    const text = canvas.apply({ kind: "moveLabel", relation: "l", delta: { x: 0, y: -16 } });
    expect(text).toContain("label l at 50% offset (0, -16)");
    canvas.session.receive({ type: "select", ids: ["l"] });
    const model = inspect(analyzeDocument({ text }), "s", ["l"])!;
    const names = model.fields.map((f) => f.name);
    for (const name of [
      "style.stroke",
      "style.line",
      "style.width",
      "style.arrowhead",
      "style.arrowtail",
      "style.routing",
      "style.corners",
    ]) {
      expect(names, name).toContain(name);
    }
    for (const name of [
      "style.shape",
      "style.radius",
      "style.rotation",
      "style.iconPosition",
      "x",
      "w",
      "ports",
      "inside",
    ]) {
      expect(names, name).not.toContain(name);
    }
    const field = (name: string) => model.fields.find((f) => f.name === name)!;
    expect(field("style.arrowhead")).toMatchObject({ value: null, placeholder: "none" });
    expect(field("style.routing")).toMatchObject({ value: null, placeholder: "polyline" });
    expect(names).toContain("effect.flow");
  });
});

describe("free diagrams on the canvas", () => {
  it("renders with the free profile and its layers", () => {
    const r = render(open(grouped).messages);
    expect(r.profile).toBe("free");
    expect(r.layers).toEqual(["main"]);
    expect(r.elements.find((e) => e.id === "g")).toMatchObject({ sized: true });
  });

  it("writes a moved child relative to its group", () => {
    // The interior of g starts at (116, 120); a is drawn centred at (196, 150).
    const { apply } = open(grouped);
    const after = apply({ kind: "move", ids: ["a"], delta: { x: 14, y: 0 } });
    expect(places(after, 0).get("a")).toEqual({ x: 94, y: 30 });
  });

  it("writes only the group when it moves with its children", () => {
    const { apply } = open(grouped);
    const after = apply({ kind: "move", ids: ["g", "a"], delta: { x: 28, y: 14 } });
    const written = places(after, 0);
    expect(written.get("g")).toEqual({ x: 328, y: 214 });
    expect(written.get("a")).toEqual({ x: 80, y: 30 });
    expect(written.get("b")).toEqual({ x: 260, y: 30 });
  });

  it("keeps children in place when a group is resized from its left edge", () => {
    const { apply } = open(grouped);
    // From 100..500 to 72..500: the interior moves 28 left.
    const after = apply({
      kind: "resize",
      id: "g",
      box: { x: 72, y: 80, width: 428, height: 240 },
    });
    const written = places(after, 0);
    expect(written.get("a")).toEqual({ x: 108, y: 30 });
    expect(written.get("b")).toEqual({ x: 288, y: 30 });
    expect(after).toContain("size g (428, 240)");
  });

  it("creates objects inside a group relative to its interior", () => {
    const { apply } = open(grouped);
    const after = apply({
      kind: "create",
      elementKind: "box",
      at: { x: 300, y: 250 },
      parent: "g",
    });
    // 300, 250 snaps to 294, 252; the interior starts at (116, 120). A new box is empty.
    expect(after).toContain('    box box1 ""\n');
    expect(places(after, 0).get("box1")).toEqual({ x: 178, y: 132 });
  });

  it("creates text at the snapped point", () => {
    const { apply } = open(grouped);
    const after = apply({ kind: "create", elementKind: "text", at: { x: 300, y: 100 } });
    expect(after).toContain('  text text1 "Text"\n');
    expect(places(after, 0).get("text1")).toEqual({ x: 294, y: 98 });
  });

  it("creates an icon object with the icon the canvas's picker chose, and asks for an image", () => {
    const { act, apply, session } = open(grouped);
    const after = apply({
      kind: "create",
      elementKind: "icon",
      at: { x: 600, y: 400 },
      source: "tabler:server",
    });
    expect(after).toContain('  icon icon1 "tabler:server"\n');
    // Without its icon the message is not one the session takes.
    expect(act({ kind: "create", elementKind: "icon", at: { x: 600, y: 400 } }).plan).toBe(
      undefined,
    );
    const image = act({ kind: "create", elementKind: "image", at: { x: 600, y: 400 } });
    expect(image.pick).toEqual({ kind: "image", at: { x: 600, y: 400 } });
    const created = session.createObject("image", "logo.png", { x: 600, y: 400 });
    expect(created.plan).toBeDefined();
  });

  it("aligns children in their own coordinates", () => {
    const { apply } = open(grouped);
    const after = apply({ kind: "align", ids: ["a", "c"], edge: "top" });
    const written = places(after, 0);
    // c is centred at y 200, a at y 150; both tops align on a's (122).
    expect(written.get("a")).toEqual({ x: 80, y: 30 });
    expect(written.get("c")).toEqual({ x: 700, y: 150 });
  });

  it("brings an object to the front", () => {
    const { apply } = open(grouped);
    const after = apply({ kind: "reorder", ids: ["a"], to: "front" });
    expect(after).toContain('    box b "B"\n    box a "A"\n');
  });

  it("shows the Layer field and writes layers", () => {
    const text = grouped.replace('  theme "plain"\n', '  theme "plain"\n  layers main, front\n');
    const { apply, session } = open(text);
    session.receive({ type: "select", ids: ["c"] });
    const analysis = analyzeDocument({ text, revision: 1 });
    const model = inspect(analysis, "s", ["c"])!;
    expect(model.fields.find((f) => f.name === "layer")).toMatchObject({
      options: ["main", "front"],
      placeholder: "main",
    });
    const after = apply({ kind: "setField", ids: ["c"], field: "layer", value: "front" });
    expect(after).toContain('box c "C" { layer front }');
    const diagram = inspect(analysis, "s", [])!;
    expect(diagram.fields.find((f) => f.name === "layers")).toMatchObject({ value: "main, front" });
  });

  it("shows written coordinates of children in the inspector", () => {
    const analysis = analyzeDocument({ text: grouped, revision: 1 });
    const model = inspect(analysis, "s", ["a"])!;
    expect(model.fields.find((f) => f.name === "x")).toMatchObject({
      value: 80,
      placeholder: "80",
    });
  });

  it("converts a flow diagram and shows the copy", () => {
    const flow = `${PLAIN}diagram f: flow {\n  theme "plain"\n  layout manual\n  a["A"]\n  b[("B")]\n  a -> b\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }\n}\n`;
    const { apply, session } = open(flow);
    const after = apply({ kind: "convert" });
    expect(after).toContain("diagram f_free: free {");
    expect(session.current).toBe("f_free");
  });
});

describe("containers and shapes on the canvas", () => {
  /** The declarations of a group's block, one per line, without indentation. */
  const blockOf = (text: string, group: string) => {
    const start = text.indexOf(`group ${group} `);
    const body = text.slice(text.indexOf("{", start) + 1, text.indexOf("\n  }", start));
    return body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
  };

  it("creates a hexagon box with its shape in one edit", () => {
    const { act } = open(grouped);
    const result = act({
      kind: "create",
      elementKind: "box",
      at: { x: 420, y: 260 },
      shape: "hexagon",
    });
    expect(result.plan).toBeDefined();
    const after = applyTextEdits(grouped, result.plan!.edits);
    expect(after).toContain('  box box1 ""\n  style box1 { shape hexagon }\n');
    expect(places(after, 0).get("box1")).toEqual({ x: 420, y: 266 });
  });

  it("writes no style for a rounded box", () => {
    const { apply } = open(grouped);
    const after = apply({
      kind: "create",
      elementKind: "box",
      at: { x: 420, y: 260 },
      shape: "rounded",
    });
    expect(after).toContain('  box box1 ""\n');
    expect(after).not.toContain("style box1");
  });

  it("creates a star node on a flow diagram", () => {
    const flow = `${PLAIN}diagram f: flow {\n  theme "plain"\n  layout manual\n  node api\n  placement {\n    place api at (100, 100)\n  }\n}\n`;
    const { apply } = open(flow);
    const after = apply({
      kind: "create",
      elementKind: "node",
      at: { x: 400, y: 100 },
      shape: "star",
    });
    expect(after).toContain('  node1[""]\n  style node1 { shape star }\n');
    expect(places(after, 0).get("node1")).toEqual({ x: 406, y: 98 });
  });

  it("creates an empty agent node, and texts, notes, tags and groups with their default text", () => {
    const flow = `${PLAIN}diagram f: flow {\n  theme "plain"\n  layout manual\n  node api\n  placement {\n    place api at (100, 100)\n  }\n}\n`;
    const { apply, session } = open(flow);
    let after = apply({
      kind: "create",
      elementKind: "node",
      at: { x: 400, y: 100 },
      shape: "agent",
    });
    expect(after).toContain('  node1[""]\n  style node1 { shape agent }\n');
    expect(session.selected).toEqual(["node1"]);
    after = apply({ kind: "create", elementKind: "decision", at: { x: 400, y: 300 } });
    expect(after).toContain('  decision decision1 ""\n');
    after = apply({ kind: "create", elementKind: "note", at: { x: 700, y: 100 } });
    expect(after).toContain('note note1 "Note"');
    after = apply({ kind: "create", elementKind: "tag", at: { x: 700, y: 300 } });
    expect(after).toContain('tag tag1 "Tag"');
    after = apply({ kind: "create", elementKind: "group", at: { x: 100, y: 500 } });
    expect(after).toContain('group group1 "Group" { }');
    // A library element keeps its label.
    after = apply({
      kind: "create",
      elementKind: "node",
      at: { x: 700, y: 500 },
      label: "Lambda",
      icon: "tabler:server",
    });
    expect(after).toMatch(/\["Lambda"\]/);
  });

  it("creates an empty box from the keys and a text with its default text on a free diagram", () => {
    const { apply } = open(grouped);
    let after = apply({ kind: "create", elementKind: "box", at: { x: 700, y: 400 } });
    expect(after).toContain('  box box1 ""\n');
    after = apply({ kind: "create", elementKind: "text", at: { x: 700, y: 500 } });
    expect(after).toContain('  text text1 "Text"\n');
  });

  it("nests a group created inside a group, placed in its interior", () => {
    const { apply } = open(grouped);
    const after = apply({
      kind: "create",
      elementKind: "group",
      at: { x: 300, y: 250 },
      parent: "g",
    });
    expect(blockOf(after, "g")).toEqual(['box a "A"', 'box b "B"', 'group group1 "Group" { }']);
    // 300, 250 snaps to 294, 252; the interior of g starts at (116, 120).
    expect(places(after, 0).get("group1")).toEqual({ x: 178, y: 132 });
  });

  it("drops a box into a group, placed in its interior, in one edit", () => {
    const { act } = open(grouped);
    // c is drawn centred at (700, 200); it lands at (200, 180), inside g.
    const result = act({ kind: "move", ids: ["c"], delta: { x: -500, y: -20 }, parent: "g" });
    expect(result.plan).toBeDefined();
    const after = applyTextEdits(grouped, result.plan!.edits);
    expect(blockOf(after, "g")).toEqual(['box a "A"', 'box b "B"', 'box c "C"']);
    expect(places(after, 0).get("c")).toEqual({ x: 84, y: 60 });
  });

  it("drops a child out of its group in diagram coordinates", () => {
    const { apply } = open(grouped);
    // a is drawn centred at (196, 150).
    const after = apply({ kind: "move", ids: ["a"], delta: { x: 504, y: 200 }, parent: null });
    expect(blockOf(after, "g")).toEqual(['box b "B"']);
    expect(after).toMatch(/\n {2}box a "A"\n/);
    expect(places(after, 0).get("a")).toEqual({ x: 700, y: 350 });
  });

  it("moves a group with its children into another group", () => {
    const text = grouped.replace('  box c "C"\n', '  group h "H" {\n  }\n');
    const placed = text.replace(
      "    place c at (700, 200)\n",
      "    place h at (800, 300)\n    size h (400, 300)\n",
    );
    const { apply } = open(placed);
    // g is drawn centred at (300, 200); h's interior starts at (616, 190).
    const after = apply({ kind: "move", ids: ["g", "a"], delta: { x: 500, y: 100 }, parent: "h" });
    expect(blockOf(after, "h")).toEqual(['group g "G" {', 'box a "A"', 'box b "B"', "}"]);
    const written = places(after, 0);
    expect(written.get("g")).toEqual({ x: 184, y: 110 });
    expect(written.get("a")).toEqual({ x: 80, y: 30 });
  });

  it("keeps the parent of a nudged child and of a drag without a target", () => {
    const { apply } = open(grouped);
    const nudged = apply({ kind: "move", ids: ["a"], delta: { x: 1, y: 0 } });
    expect(blockOf(nudged, "g")).toEqual(['box a "A"', 'box b "B"']);
    expect(places(nudged, 0).get("a")).toEqual({ x: 81, y: 30 });
    // The same parent as the target writes the place only.
    const kept = apply({ kind: "move", ids: ["a"], delta: { x: 14, y: 0 }, parent: "g" });
    expect(blockOf(kept, "g")).toEqual(['box a "A"', 'box b "B"']);
    expect(places(kept, 0).get("a")).toEqual({ x: 95, y: 30 });
  });

  it("refuses to drop a group into itself", () => {
    const { act } = open(grouped);
    const result = act({ kind: "move", ids: ["g"], delta: { x: 14, y: 0 }, parent: "g" });
    expect(result.plan).toBeUndefined();
    expect(result.messages[0]).toMatchObject({ type: "rejected", code: "edit.unsafe-target" });
  });

  it("measures a child of an untitled group from its padding", () => {
    const untitled = `${PLAIN}diagram s: free {
  theme "plain"
  group g "" {
  }
  placement {
    place g at (300, 200)
    size g (400, 240)
  }
}
`;
    const { apply, session } = open(untitled);
    session.grid = 10;
    // The interior of g starts at (116, 96): the padding, with no title band.
    const after = apply({
      kind: "create",
      elementKind: "box",
      at: { x: 200, y: 150 },
      parent: "g",
    });
    expect(places(after, 0).get("box1")).toEqual({ x: 84, y: 54 });
    // Its next child is measured from the layout's origin, the same point.
    const second = apply({
      kind: "create",
      elementKind: "box",
      at: { x: 400, y: 250 },
      parent: "g",
    });
    expect(places(second, 0).get("box2")).toEqual({ x: 284, y: 154 });
  });

  it("moves an element into a group from the Inside field, where it is drawn", () => {
    const { apply } = open(grouped);
    const after = apply({ kind: "setField", ids: ["c"], field: "inside", value: "g" });
    expect(blockOf(after, "g")).toEqual(['box a "A"', 'box b "B"', 'box c "C"']);
    // c stays at (700, 200): (584, 80) from the interior of g.
    expect(places(after, 0).get("c")).toEqual({ x: 584, y: 80 });
    const out = apply({ kind: "setField", ids: ["c"], field: "inside", value: null });
    expect(blockOf(out, "g")).toEqual(['box a "A"', 'box b "B"']);
    expect(places(out, 0).get("c")).toEqual({ x: 700, y: 200 });
  });

  describe("a placed group without size, drawn around its children", () => {
    // g is drawn at (114, 143), 372 × 114: its interior starts at (130, 183), a is drawn centred
    // at (210, 213) and b at (390, 213).
    const unsized = `${PLAIN}diagram s: free {
  theme "plain"
  group g "G" {
    box a "A"
    box b "B"
  }
  box c "C"
  placement {
    place g at (300, 200)
    place a at (80, 30)
    place b at (260, 30)
    place c at (700, 400)
  }
}
`;
    const centres = (session: CanvasSession) =>
      new Map(
        render(session.state()).elements.map((e) => [
          e.id,
          { x: e.box.x + e.box.width / 2, y: e.box.y + e.box.height / 2 },
        ]),
      );
    const boxOf = (session: CanvasSession, id: string) =>
      render(session.state()).elements.find((e) => e.id === id)!.box;

    it("keeps its interior where it is when a box is dropped into it", () => {
      const { apply, session } = open(unsized);
      expect(boxOf(session, "g")).toEqual({ x: 114, y: 143, width: 372, height: 114 });
      // c is drawn centred at (700, 400); it is dropped centred at (446, 237), inside g.
      const after = apply({ kind: "move", ids: ["c"], delta: { x: -254, y: -163 }, parent: "g" });
      expect(blockOf(after, "g")).toEqual(['box a "A"', 'box b "B"', 'box c "C"']);
      expect(places(after, 0).get("c")).toEqual({ x: 316, y: 54 });
      expect(after).toContain("size g (372, 114)");
      const drawn = centres(session);
      expect(drawn.get("c")).toEqual({ x: 446, y: 237 });
      expect(drawn.get("a")).toEqual({ x: 210, y: 213 });
      expect(drawn.get("b")).toEqual({ x: 390, y: 213 });
    });

    it("keeps its interior where it is when a child is dragged out or moved out from the Inside field", () => {
      const { apply, session } = open(unsized);
      const after = apply({ kind: "move", ids: ["b"], delta: { x: 300, y: 200 }, parent: null });
      expect(blockOf(after, "g")).toEqual(['box a "A"']);
      expect(after).toContain("size g (372, 114)");
      expect(centres(session).get("a")).toEqual({ x: 210, y: 213 });
      expect(centres(session).get("b")).toEqual({ x: 690, y: 413 });
      const inside = open(unsized);
      const moved = inside.apply({ kind: "setField", ids: ["c"], field: "inside", value: "g" });
      expect(moved).toContain("size g (372, 114)");
      expect(centres(inside.session).get("c")).toEqual({ x: 700, y: 400 });
      expect(centres(inside.session).get("a")).toEqual({ x: 210, y: 213 });
    });

    it("is written no size when its children only move within it", () => {
      const { apply } = open(unsized);
      const after = apply({ kind: "move", ids: ["a"], delta: { x: 14, y: 0 }, parent: "g" });
      expect(after).not.toContain("size g");
      expect(places(after, 0).get("a")).toEqual({ x: 94, y: 30 });
    });

    it("stays where it is drawn when its last child is dragged out", () => {
      const lone = unsized.replace('    box b "B"\n', "").replace("    place b at (260, 30)\n", "");
      const { apply, session } = open(lone);
      const before = boxOf(session, "g");
      const after = apply({ kind: "move", ids: ["a"], delta: { x: 400, y: 200 }, parent: null });
      expect(blockOf(after, "g")).toEqual([]);
      expect(after).toContain(`size g (${before.width}, ${before.height})`);
      expect(boxOf(session, "g")).toEqual(before);
    });
  });

  it("offers the groups an element may go into in the Inside field", () => {
    const text = grouped.replace(
      '    box b "B"\n',
      '    box b "B"\n    group inner "I" {\n    }\n',
    );
    const analysis = analyzeDocument({ text });
    const field = (id: string) =>
      inspect(analysis, "s", [id])!.fields.find((f) => f.name === "inside");
    expect(field("c")).toMatchObject({ value: null, placeholder: "none", options: ["g", "inner"] });
    expect(field("a")).toMatchObject({ value: "g", options: ["g", "inner"] });
    // A group never goes into itself or into a group it holds.
    expect(field("g")!.options).toEqual([]);
    expect(field("inner")!.options).toEqual(["g"]);
    // A box can become a container; a group is one already.
    expect(field("c")!.button).toEqual({
      label: "Convert to container",
      action: { kind: "convertToContainer", id: "c" },
    });
    expect(field("g")!.button).toBeUndefined();
  });
});

describe("free clipboard", () => {
  it("copies a child without its group at its drawn position, as a free fragment", () => {
    const analysis = analyzeDocument({ text: grouped });
    const fragment = copyFragment(analysis, "s", ["a"])!;
    expect(fragment).toContain("diagram clipboard: free {");
    expect(fragment).toContain("place a at (196, 150)");
    const pasted = pasteOperations(analysis, "s", fragment, { shift: { x: 28, y: 28 } });
    expect(pasted.ok && pasted.ids).toEqual(["a_2"]);
  });

  it("moves only top-level places when pasting a group", () => {
    const analysis = analyzeDocument({ text: grouped });
    const fragment = copyFragment(analysis, "s", ["g"])!;
    const pasted = pasteOperations(analysis, "s", fragment, { shift: { x: 28, y: 28 } });
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const inserted = pasted.operations[0]!;
    expect(inserted.kind).toBe("insertFragment");
    const text = (inserted as { fragment: string }).fragment;
    expect(text).toContain("place g_2 at (328, 228)");
    expect(text).toContain("place a_2 at (80, 30)");
  });

  it("keeps the layers of a flow fragment, so a front node stays in front", () => {
    const analysis = analyzeDocument({
      text: `diagram f: flow {\n  layout manual\n  layers back, main, front\n  api["API"] { layer front }\n  placement {\n    place api at (200, 100)\n  }\n}\n`,
    });
    const fragment = copyFragment(analysis, "f", ["api"])!;
    expect(fragment).toContain("layers back, main, front");
  });
});

describe("free language services", () => {
  it("completes free kinds and properties in free diagrams", () => {
    const { analysis, offset } = at("diagram s: free {\n  |\n}\n");
    const labels = completions(analysis, offset).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["box", "text", "icon", "image", "layers"]));
    expect(labels).not.toContain("decision");
  });

  it("completes the text properties in free diagrams only, and shapes and radius in both", () => {
    const labels = (source: string) => {
      const { analysis, offset } = at(source);
      return completions(analysis, offset).map((c) => c.label);
    };
    const free = labels('diagram s: free {\n  box a "A"\n  style a { | }\n}\n');
    expect(free).toEqual(expect.arrayContaining(["shape", "radius", "fontSize", "textAlign"]));
    const flow = labels('diagram s: flow {\n  a["A"]\n  style a { | }\n}\n');
    expect(flow).toEqual(expect.arrayContaining(["shape", "radius"]));
    expect(flow).not.toContain("fontSize");
    expect(flow).not.toContain("fontWeight");
    expect(flow).not.toContain("textAlign");
    const shapes = labels('diagram s: free {\n  box a "A"\n  style a { shape | }\n}\n');
    expect(shapes).toHaveLength(24);
    expect(shapes).toEqual(expect.arrayContaining(["ellipse", "square", "flag", "person"]));
  });

  it("completes the shapes of a flow node", () => {
    const { analysis, offset } = at("diagram s: flow {\n  node api\n  style api { shape | }\n}\n");
    expect(completions(analysis, offset).map((c) => c.label)).toEqual(
      expect.arrayContaining(["hexagon", "cloud", "person", "icon"]),
    );
  });

  it("completes the icon's size and the label's position", () => {
    const labels = (source: string) => {
      const { analysis, offset } = at(source);
      return completions(analysis, offset).map((c) => c.label);
    };
    expect(labels("diagram s: flow {\n  node api\n  style api { iconSize | }\n}\n")).toEqual([
      "auto",
    ]);
    expect(labels("diagram s: flow {\n  node api\n  style api { labelPosition | }\n}\n")).toEqual([
      "top",
      "bottom",
      "left",
      "right",
    ]);
    expect(labels("diagram s: flow {\n  node api\n  style api { iconPosition | }\n}\n")).toEqual([
      "left",
      "right",
      "top",
      "bottom",
      "center",
    ]);
  });

  it("offers no shape or radius where kinds draw their own", () => {
    const { analysis, offset } = at(
      'diagram s: sequence {\n  participant a "A"\n  style a { | }\n}\n',
    );
    const labels = completions(analysis, offset).map((c) => c.label);
    expect(labels).toContain("fill");
    expect(labels).not.toContain("shape");
    expect(labels).not.toContain("radius");
  });

  it("hovers the shapes and the corner radius", () => {
    const shape = at("diagram s: flow {\n  node api\n  style api { sha|pe hexagon }\n}\n");
    const shapes = hover(shape.analysis, shape.offset)!.markdown;
    expect(shapes).toContain("flow node");
    expect(shapes).toContain("`hexagon`");
    expect(shapes).toContain("`person`");
    const radius = at('diagram s: free {\n  box a "A"\n  style a { rad|ius 4 }\n}\n');
    expect(hover(radius.analysis, radius.offset)!.markdown).toMatch(
      /^\*\*radius\*\* — Corner radius, 0 to 64/,
    );
  });

  it("completes and hovers rotation where elements turn", () => {
    const labels = (source: string) => {
      const { analysis, offset } = at(source);
      return completions(analysis, offset).map((c) => c.label);
    };
    expect(labels('diagram s: free {\n  box a "A"\n  style a { | }\n}\n')).toContain("rotation");
    expect(labels('diagram s: flow {\n  a["A"]\n  style a { | }\n}\n')).toContain("rotation");
    expect(
      labels("diagram s: sequence {\n  participant web\n  style web { | }\n}\n"),
    ).not.toContain("rotation");
    const rotation = at('diagram s: free {\n  box a "A"\n  style a { rot|ation 30 }\n}\n');
    expect(hover(rotation.analysis, rotation.offset)!.markdown).toMatch(
      /^\*\*rotation\*\* — Degrees an element is turned, 0 to 360, clockwise/,
    );
  });

  it("completes layers and link targets", () => {
    const layered = at('diagram s: free {\n  layers back\n  box a "A" { layer | }\n}\n');
    expect(completions(layered.analysis, layered.offset).map((c) => c.label)).toEqual([
      "back",
      "main",
    ]);
    const linked = at(
      'diagram f: flow {\n  api["API"]\n}\ndiagram s: free {\n  box a "A" { link | }\n}\n',
    );
    expect(completions(linked.analysis, linked.offset).map((c) => c.label)).toEqual(["f.api"]);
  });

  it("completes image paths from the project", () => {
    const { offset, text } = at('diagram s: free {\n  image logo "|"\n}\n');
    const analysis = analyzeDocument({ text, imageFiles: () => ["img/logo.png", "photo.jpg"] });
    expect(completions(analysis, offset).map((c) => c.label)).toEqual([
      "img/logo.png",
      "photo.jpg",
    ]);
  });

  const linkedText =
    'diagram checkout: flow {\n  api["API"]\n}\ndiagram s: free {\n  box a "A" { link checkout.a|pi }\n}\n';

  it("goes to the definition of a linked element", () => {
    const { analysis, offset, text } = at(linkedText);
    const range = definition(analysis, offset)!;
    expect(text.slice(range.start.offset, range.end.offset)).toBe("api");
    expect(range.start.offset).toBe(text.indexOf("api"));
  });

  it("lists links among the references of an element and hovers them", () => {
    const { analysis, offset, text } = at(linkedText);
    const declared = text.indexOf("api");
    const ranges = references(analysis, declared);
    expect(ranges.map((r) => r.start.offset)).toEqual([declared, text.lastIndexOf("api")]);
    expect(hover(analysis, offset)!.markdown).toContain("**link** to `api` of `checkout`");
  });

  it("classifies layers and links for highlighting", () => {
    const { analysis, text } = at(linkedText.replace("|", ""));
    const tokens = semanticTokens(analysis);
    const link = text.lastIndexOf("checkout");
    expect(tokens.find((t) => t.start === link)?.type).toBe("namespace");
  });

  it("offers to declare an unknown layer and to remove an unknown link", () => {
    const layer = at('diagram s: free {\n  box a "A" { layer fr|ont }\n}\n');
    const fixes = codeActions(layer.analysis, { start: layer.offset, end: layer.offset });
    const declare = fixes.find((f) => f.title === "Declare layer `front`")!;
    expect(applyTextEdits(layer.text, declare.edits)).toContain("  layers front, main\n");
    const link = at(
      'diagram f: flow {\n  api["API"]\n}\ndiagram s: free {\n  box a "A" { link f.ap|x }\n}\n',
    );
    const titles = codeActions(link.analysis, { start: link.offset, end: link.offset }).map(
      (f) => f.title,
    );
    expect(titles).toEqual(expect.arrayContaining(["Remove the link", "Change to `f.api`"]));
  });
});
