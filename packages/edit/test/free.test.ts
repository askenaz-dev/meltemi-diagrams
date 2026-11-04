import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits, formatSource } from "@meltemi/diagrams-language";
import { compile, type Compilation } from "@meltemi/diagrams-model";
import { layoutDiagram, typeScale, type Box } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { isUntitled } from "../src/free.js";
import { planEdit, type EditOperation } from "../src/index.js";

function run(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(result.rejection.reason);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  return after;
}

function refused(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return `${result.rejection.code}: ${result.rejection.reason}`;
}

const free = (body: string) => `diagram s: free {\n${body}\n}\n`;

describe("free lines", () => {
  it("declares a line with a generated id and the styles of its kind in one edit", () => {
    const after = run(free("  box a"), {
      kind: "createLine",
      diagram: "s",
      from: { x: 98, y: 98 },
      to: { x: 294, y: 98 },
      styles: [{ property: "arrowhead", value: "triangle" }],
    });
    expect(after).toBe(
      free(
        "  box a\n  line line1 from (98, 98) to (294, 98)\n  style line1 { arrowhead triangle }",
      ),
    );
    const plain = run(free("  box a"), {
      kind: "createLine",
      diagram: "s",
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
    });
    expect(plain).toBe(free("  box a\n  line line1 from (0, 0) to (10, 0)"));
  });

  it("declares a line inside a group, its styles with the diagram's", () => {
    const text = free(
      '  group g "G" {\n    box a\n  }\n  style a { fill accent }\n  placement {\n    place g at (300, 200)\n    place a at (60, 40)\n  }',
    );
    const after = run(text, {
      kind: "createLine",
      diagram: "s",
      parent: "g",
      from: { x: 20, y: 40 },
      to: { x: 120, y: 40 },
      styles: [{ property: "line", value: "dashed" }],
    });
    expect(after).toContain("    box a\n    line line1 from (20, 40) to (120, 40)\n  }");
    expect(after).toContain("  style a { fill accent }\n  style line1 { line dashed }\n");
  });

  it("refuses a line in a flow diagram", () => {
    expect(
      refused("diagram f: flow {\n  a\n}\n", {
        kind: "createLine",
        diagram: "f",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 },
      }),
    ).toBe("edit.invalid-value: Lines that join no element belong to free diagrams.");
  });

  it("moves points number by number, keeping comments and the label", () => {
    const text = free('  line l "Step" from (98, 98) to (294, 98) // the divider');
    const after = run(text, {
      kind: "setLinePoints",
      diagram: "s",
      element: "l",
      from: { x: 98, y: 98 },
      to: { x: 350, y: 168 },
      via: [],
    });
    expect(after).toBe(free('  line l "Step" from (98, 98) to (350, 168) // the divider'));
  });

  it("inserts a via list when a bend appears and removes it when none is left", () => {
    const text = free("  line l from (98, 98) to (294, 98)");
    const bent = run(text, {
      kind: "setLinePoints",
      diagram: "s",
      element: "l",
      from: { x: 98, y: 98 },
      to: { x: 294, y: 98 },
      via: [{ x: 196, y: 154 }],
    });
    expect(bent).toBe(free("  line l from (98, 98) to (294, 98) via [(196, 154)]"));
    const moved = run(bent, {
      kind: "setLinePoints",
      diagram: "s",
      element: "l",
      from: { x: 126, y: 112 },
      to: { x: 322, y: 112 },
      via: [{ x: 224, y: 168 }],
    });
    expect(moved).toBe(free("  line l from (126, 112) to (322, 112) via [(224, 168)]"));
    const straight = run(bent, {
      kind: "setLinePoints",
      diagram: "s",
      element: "l",
      from: { x: 98, y: 98 },
      to: { x: 294, y: 98 },
      via: [],
    });
    expect(straight).toBe(text);
    const two = run(bent, {
      kind: "setLinePoints",
      diagram: "s",
      element: "l",
      from: { x: 98, y: 98 },
      to: { x: 294, y: 98 },
      via: [
        { x: 150, y: 140 },
        { x: 250, y: 140 },
      ],
    });
    expect(two).toBe(free("  line l from (98, 98) to (294, 98) via [(150, 140), (250, 140)]"));
  });

  it("refuses to move the points of something that is not a line", () => {
    expect(
      refused(free("  box a"), {
        kind: "setLinePoints",
        diagram: "s",
        element: "a",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 },
        via: [],
      }),
    ).toBe("edit.invalid-value: `a` is not a line.");
  });

  it("removes a line with its label statement", () => {
    const text = free(
      '  line l "Step" from (0, 0) to (300, 0)\n  box a\n  placement {\n    label l at 30%\n    place a at (0, 100)\n  }',
    );
    const after = run(text, { kind: "removeElement", diagram: "s", element: "l", cascade: true });
    expect(after).not.toContain("line l");
    expect(after).not.toContain("label l");
    expect(after).toContain("place a at (0, 100)");
  });
});

describe("pen strokes", () => {
  /** The text as the formatter prints it. */
  const formatted = (text: string): string => {
    const result = formatSource(text);
    if (!result.ok) throw new Error(result.diagnostics[0]!.message);
    return result.text;
  };
  const pointsOf = (text: string, id: string) =>
    compile(text).document.diagrams[0]!.elementsById.get(id)!.pen!.points;
  const errors = (text: string) => compile(text).diagnostics.filter((d) => d.severity === "error");
  /** A stroke of `count` points with decimals, as a canvas would simplify one. */
  const stroke = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      x: 100 + i * 12.34,
      y: 200 + Math.sin(i / 4) * 40.06,
    }));
  const tenth = (value: number) => Math.round(value * 10) / 10;

  it("writes a stroke inside a group after its text, to a tenth, its style with the diagram's", () => {
    const text = free('  group notes "Notes" {\n    text intro "Hello"\n  }');
    const result = planEdit(compile(text), {
      kind: "createPen",
      diagram: "s",
      parent: "notes",
      points: [
        { x: 40, y: 60 },
        { x: 90.46, y: 58.04 },
        { x: 140, y: 70 },
      ],
      style: { width: 4 },
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(text, result.plan.edits);
    expect(after).toBe(
      free(
        '  group notes "Notes" {\n    text intro "Hello"\n    pen pen1 [(40, 60), (90.5, 58), (140, 70)]\n  }\n  style pen1 { width 4 }',
      ),
    );
    expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
    expect(errors(after)).toEqual([]);
    const pen = compile(after).document.diagrams[0]!.elementsById.get("pen1")!;
    expect(pen.groupPath).toEqual(["notes"]);
    expect(pen.pen!.points).toEqual([
      { x: 40, y: 60 },
      { x: 90.5, y: 58 },
      { x: 140, y: 70 },
    ]);
    expect(formatted(after)).toBe(after);
  });

  it("writes the style beside a stroke at the top level, colour tokens bare and colours quoted", () => {
    const highlighter = run(free("  box a"), {
      kind: "createPen",
      diagram: "s",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      style: { stroke: "@highlight", width: 20, opacity: 0.35 },
    });
    expect(highlighter).toBe(
      free(
        "  box a\n  pen pen1 [(0, 0), (10, 5)]\n  style pen1 { stroke highlight; width 20; opacity 0.35 }",
      ),
    );
    expect(errors(highlighter)).toEqual([]);
    const arrow = run(highlighter, {
      kind: "createPen",
      diagram: "s",
      points: [
        { x: 20, y: 20 },
        { x: 80, y: 40 },
      ],
      style: { arrowtail: "circle", stroke: "#e03131", arrowhead: "triangle" },
    });
    expect(arrow).toContain(
      '  pen pen2 [(20, 20), (80, 40)]\n  style pen2 { stroke "#e03131"; arrowhead triangle; arrowtail circle }\n',
    );
    expect(errors(arrow)).toEqual([]);
  });

  it("writes a dot, rounds to a tenth and goes after the last declaration, lines and pens included", () => {
    const text = free(
      "  box a\n  line l from (0, 0) to (10, 0)\n  pen pen1 [(0, 0)]\n  placement {\n    place a at (100, 100)\n  }",
    );
    const after = run(text, {
      kind: "createPen",
      diagram: "s",
      points: [{ x: -0.04, y: -12.26 }],
    });
    expect(after).toBe(
      free(
        "  box a\n  line l from (0, 0) to (10, 0)\n  pen pen1 [(0, 0)]\n  pen pen2 [(0, -12.3)]\n  placement {\n    place a at (100, 100)\n  }",
      ),
    );
    expect(pointsOf(after, "pen2")).toEqual([{ x: 0, y: -12.3 }]);
  });

  it("keeps a statement of 100 columns on one line and fills one of 101", () => {
    const tens = Array.from({ length: 7 }, () => ({ x: 10, y: 10 }));
    const fits = run(free("  box a"), {
      kind: "createPen",
      diagram: "s",
      points: [...tens, { x: 100000, y: 10000.5 }],
    });
    const statement = `  pen pen1 [${Array<string>(7).fill("(10, 10)").join(", ")}, (100000, 10000.5)]`;
    expect(statement.length).toBe(100);
    expect(fits).toBe(free(`  box a\n${statement}`));
    expect(formatted(fits)).toBe(fits);
    const filled = run(free("  box a"), {
      kind: "createPen",
      diagram: "s",
      points: [...tens, { x: 100000, y: 100000.5 }],
    });
    expect(filled).toBe(
      free(
        `  box a\n  pen pen1 [\n    ${Array<string>(7).fill("(10, 10),").join(" ")} (100000, 100000.5),\n  ]`,
      ),
    );
    expect(formatted(filled)).toBe(filled);
    expect(errors(filled)).toEqual([]);
  });

  it("fills a stroke of sixty points to 100 columns, as the formatter prints it", () => {
    const points = stroke(60);
    const result = planEdit(compile(free("  box a")), {
      kind: "createPen",
      diagram: "s",
      points,
      style: { width: 2 },
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(free("  box a"), result.plan.edits);
    const lines = after.split("\n");
    const first = lines.indexOf("  pen pen1 [");
    const last = lines.indexOf("  ]");
    expect(first).toBe(2);
    expect(lines[last + 1]).toBe("  style pen1 { width 2 }");
    const rows = lines.slice(first + 1, last);
    expect(rows.length).toBeGreaterThan(5);
    for (const [i, row] of rows.entries()) {
      expect(row.startsWith("    (")).toBe(true);
      expect(row.endsWith(",")).toBe(true);
      expect(row.length).toBeLessThanOrEqual(100);
      // Filled: the next row's first tuple would not fit on this one.
      const next = rows[i + 1]?.trim().split(" ").slice(0, 2).join(" ");
      if (next !== undefined) expect(row.length + 1 + next.length).toBeGreaterThan(100);
    }
    expect(pointsOf(after, "pen1")).toEqual(points.map((p) => ({ x: tenth(p.x), y: tenth(p.y) })));
    expect(errors(after)).toEqual([]);
    expect(formatted(after)).toBe(after);
  });

  it("fills a long stroke inside a group one level deeper, idempotent under the formatter", () => {
    const text = free(
      '  group notes "Notes" {\n    text intro "Hello"\n  }\n  style intro { color accent }',
    );
    const after = run(text, {
      kind: "createPen",
      diagram: "s",
      parent: "notes",
      points: stroke(40),
      style: { stroke: "danger" },
    });
    expect(after).toContain('    text intro "Hello"\n    pen pen1 [\n      (100, 200), ');
    expect(after).toContain(
      ",\n    ]\n  }\n  style intro { color accent }\n  style pen1 { stroke danger }\n",
    );
    expect(errors(after)).toEqual([]);
    expect(formatted(after)).toBe(after);
  });

  it("moves the points number by number, keeping comments, and the inverse restores them", () => {
    const text = free("  pen pen1 [(40, 60), (90.5, 58), (140, 70)] // the arrow");
    const after = run(text, {
      kind: "setPenPoints",
      diagram: "s",
      element: "pen1",
      points: [
        { x: 50, y: 60 },
        { x: 100.5, y: 58 },
        { x: 150, y: 70 },
      ],
    });
    expect(after).toBe(free("  pen pen1 [(50, 60), (100.5, 58), (150, 70)] // the arrow"));
    // Inside a filled list, comments stay and numbers written with more decimals that are the
    // same to a tenth are kept.
    const filled = free("  pen p [\n    (0, 0), // start\n    (10.04, 10),\n  ]");
    expect(
      run(filled, {
        kind: "setPenPoints",
        diagram: "s",
        element: "p",
        points: [
          { x: 5, y: 0 },
          { x: 10, y: 20.06 },
        ],
      }),
    ).toBe(free("  pen p [\n    (5, 0), // start\n    (10.04, 20.1),\n  ]"));
  });

  it("writes the whole list again when the count changes, noting the comments it drops", () => {
    const text = free("  pen p [\n    // start\n    (0, 0), (10, 10),\n  ] { layer main }");
    const result = planEdit(compile(text), {
      kind: "setPenPoints",
      diagram: "s",
      element: "p",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20.25, y: 0 },
      ],
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(text, result.plan.edits);
    expect(after).toBe(free("  pen p [(0, 0), (10, 10), (20.3, 0)] { layer main }"));
    expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
    expect(result.plan.notes).toEqual(["Removed the comment on line 3: // start"]);
    const long = run(after, {
      kind: "setPenPoints",
      diagram: "s",
      element: "p",
      points: stroke(60),
    });
    expect(long).toMatch(/^ {2}pen p \[\n {4}\(100, 200\), /m);
    expect(long).toContain(",\n  ] { layer main }\n");
    expect(formatted(long)).toBe(long);
    expect(pointsOf(long, "p")).toHaveLength(60);
  });

  it("refuses no points, coordinates that are not finite and diagrams that are not free", () => {
    expect(refused(free("  box a"), { kind: "createPen", diagram: "s", points: [] })).toBe(
      "edit.invalid-value: A pen stroke needs one point at least.",
    );
    expect(
      refused(free("  box a"), {
        kind: "createPen",
        diagram: "s",
        points: [{ x: Number.NaN, y: 0 }],
      }),
    ).toBe("edit.invalid-value: `NaN` is not a coordinate the language can write.");
    expect(
      refused(free("  box a"), {
        kind: "createPen",
        diagram: "s",
        points: [{ x: 0, y: Number.POSITIVE_INFINITY }],
      }),
    ).toMatch(/^edit.invalid-value: `Infinity` is not a coordinate/);
    expect(
      refused("diagram f: flow {\n  a\n}\n", {
        kind: "createPen",
        diagram: "f",
        points: [{ x: 0, y: 0 }],
      }),
    ).toBe("edit.invalid-value: Pen strokes belong to free diagrams.");
    // The model refuses a stroke without width.
    expect(
      refused(free("  box a"), {
        kind: "createPen",
        diagram: "s",
        points: [{ x: 0, y: 0 }],
        style: { width: 0 },
      }),
    ).toMatch(/^edit.invalid-value: /);
  });

  it("refuses to move the points of something that is not a pen, or to no points", () => {
    const text = free("  box a\n  pen p [(0, 0)]");
    expect(
      refused(text, {
        kind: "setPenPoints",
        diagram: "s",
        element: "a",
        points: [{ x: 0, y: 0 }],
      }),
    ).toBe("edit.unsafe-target: `a` is not a pen stroke.");
    expect(refused(text, { kind: "setPenPoints", diagram: "s", element: "p", points: [] })).toBe(
      "edit.invalid-value: A pen stroke needs one point at least.",
    );
  });

  it("refuses a place, a size and a label for a pen", () => {
    const text = free("  pen p [(0, 0), (10, 10)]");
    const points =
      "edit.invalid-value: `p` is a pen stroke: its points are written in its statement.";
    expect(refused(text, { kind: "setPosition", diagram: "s", element: "p", x: 10, y: 10 })).toBe(
      points,
    );
    expect(
      refused(text, { kind: "setSize", diagram: "s", element: "p", width: 10, height: 10 }),
    ).toBe(points);
    expect(refused(text, { kind: "setElementLabel", diagram: "s", element: "p", label: "X" })).toBe(
      "edit.unsafe-target: `p` is a pen stroke, which has no label.",
    );
  });

  it("removes a pen with its style and animate statements as dependents", () => {
    const text = free(
      "  box a\n  pen p [(0, 0), (100, 0)]\n  style p { width 8 }\n  animate p { effect trace }",
    );
    const result = planEdit(compile(text), {
      kind: "removeElement",
      diagram: "s",
      element: "p",
      cascade: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("edit.has-dependents");
      expect(result.rejection.dependents!.map((d) => d.kind)).toEqual(["style", "animate"]);
    }
    expect(run(text, { kind: "removeElement", diagram: "s", element: "p", cascade: true })).toBe(
      free("  box a"),
    );
  });
});

describe("creating free objects", () => {
  it("writes an icon with its source and place", () => {
    const text = free(
      '  icon icon1 "tabler:user"\n  placement {\n    place icon1 at (10, 10)\n  }',
    );
    const after = run(text, {
      kind: "createElement",
      diagram: "s",
      elementKind: "icon",
      source: "tabler:server",
      at: { x: 420, y: 266 },
    });
    expect(after).toContain('  icon icon1 "tabler:user"\n  icon icon2 "tabler:server"\n');
    expect(after).toContain("    place icon2 at (420, 266)\n");
  });

  it("writes boxes, text and images", () => {
    const text = free('  box a "A"');
    expect(
      run('diagram f: flow {\n  api["API"]\n}\n', {
        kind: "createElement",
        diagram: "f",
        elementKind: "node",
        id: "lambda1",
        label: "AWS Lambda",
        icon: "aws:lambda",
      }),
    ).toContain('  lambda1["AWS Lambda"]\n  style lambda1 { icon "aws:lambda" }\n');
    expect(
      refused('diagram f: flow {\n  api["API"]\n}\n', {
        kind: "createElement",
        diagram: "f",
        elementKind: "node",
        icon: "no colon",
      }),
    ).toMatch(/not an icon reference/);
    expect(run(text, { kind: "createElement", diagram: "s", elementKind: "box" })).toContain(
      '  box box1 "Box"\n',
    );
    expect(run(text, { kind: "createElement", diagram: "s", elementKind: "text" })).toContain(
      '  text text1 "Text"\n',
    );
    expect(
      run(text, {
        kind: "createElement",
        diagram: "s",
        elementKind: "image",
        source: "img/logo.png",
      }),
    ).toContain('  image image1 "img/logo.png"\n');
  });

  it("writes a box's shape in a style statement in the same edit", () => {
    const text = free('  box a "A"\n  placement {\n    place a at (10, 10)\n  }');
    const result = planEdit(compile(text), {
      kind: "createElement",
      diagram: "s",
      elementKind: "box",
      shape: "diamond",
      at: { x: 420, y: 266 },
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(text, result.plan.edits);
    expect(after).toContain('  box a "A"\n  box box1 "Box"\n  style box1 { shape diamond }\n');
    expect(after).toContain("    place box1 at (420, 266)\n");
    expect(compile(after).diagnostics).toEqual([]);
    // Beside an icon; `rounded`, the default, writes no style.
    expect(
      run(text, {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        icon: "tabler:server",
        shape: "ellipse",
      }),
    ).toContain('  box box1 "Box"\n  style box1 { icon "tabler:server"; shape ellipse }\n');
    expect(
      run(text, { kind: "createElement", diagram: "s", elementKind: "box", shape: "rounded" }),
    ).toBe(text.replace('box a "A"\n', 'box a "A"\n  box box1 "Box"\n'));
  });

  it("writes a flow node's shape", () => {
    const after = run('diagram f: flow {\n  api["API"]\n}\n', {
      kind: "createElement",
      diagram: "f",
      elementKind: "node",
      shape: "ellipse",
    });
    expect(after).toBe(
      'diagram f: flow {\n  api["API"]\n  node1["Node"]\n  style node1 { shape ellipse }\n}\n',
    );
    expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("writes the shape and icon of an element created in a group with the diagram's styles", () => {
    const text = free(
      '  group g "G" {\n    box a "A"\n  }\n  placement {\n    place g at (200, 200)\n    size g (300, 200)\n  }\n  style a { fill "#eef" }',
    );
    expect(
      run(text, {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        parent: "g",
        shape: "hexagon",
        at: { x: 60, y: 40 },
      }),
    ).toBe(
      free(
        '  group g "G" {\n    box a "A"\n    box box1 "Box"\n  }\n  placement {\n    place g at (200, 200)\n    size g (300, 200)\n    place box1 at (60, 40)\n  }\n  style a { fill "#eef" }\n  style box1 { shape hexagon }',
      ),
    );
    // An icon, as a library element dropped into a group writes it.
    expect(
      run(text, {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        parent: "g",
        label: "Server",
        icon: "tabler:server",
      }),
    ).toContain(
      '    box box1 "Server"\n  }\n  placement {\n    place g at (200, 200)\n    size g (300, 200)\n  }\n  style a { fill "#eef" }\n  style box1 { icon "tabler:server" }\n}\n',
    );
    // A flow node in a group that is the last statement, with no styles and no placement: the new
    // placement block comes first, then the style.
    const flow = 'diagram f: flow {\n  layout manual\n  group g "G" {\n    api["API"]\n  }\n}\n';
    const node = run(flow, {
      kind: "createElement",
      diagram: "f",
      elementKind: "node",
      parent: "g",
      shape: "star",
      icon: "tabler:star",
      at: { x: 300, y: 100 },
    });
    expect(node).toBe(
      'diagram f: flow {\n  layout manual\n  group g "G" {\n    api["API"]\n    node1["Node"]\n  }\n\n  placement {\n    place node1 at (300, 100)\n  }\n  style node1 { icon "tabler:star"; shape star }\n}\n',
    );
    const model = compile(node).document.diagrams[0]!;
    expect(model.elementsById.get("node1")!.groupPath).toEqual(["g"]);
    expect(compile(node).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("refuses an unknown shape and a shape on other kinds", () => {
    expect(
      refused(free('  box a "A"'), {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        shape: "blob",
        at: { x: 420, y: 266 },
      }),
    ).toMatch(/^edit.invalid-value: `blob` is not a shape; the shapes are rounded, rectangle, /);
    expect(
      refused(free('  box a "A"'), {
        kind: "createElement",
        diagram: "s",
        elementKind: "text",
        shape: "ellipse",
      }),
    ).toMatch(/^edit.invalid-value: A new text takes no shape/);
    expect(
      refused('diagram f: flow {\n  api["API"]\n}\n', {
        kind: "createElement",
        diagram: "f",
        elementKind: "decision",
        shape: "ellipse",
      }),
    ).toMatch(/^edit.invalid-value: A new decision takes no shape/);
  });

  it("refuses kinds of the other profile and icons without a source", () => {
    expect(
      refused(free('  box a "A"'), { kind: "createElement", diagram: "s", elementKind: "node" }),
    ).toMatch(/^edit.invalid-value: `node` elements belong to flow diagrams/);
    expect(
      refused("diagram f: flow {\n  a -> b\n}\n", {
        kind: "createElement",
        diagram: "f",
        elementKind: "box",
      }),
    ).toMatch(/^edit.invalid-value: `box` elements belong to free diagrams/);
    expect(
      refused(free('  box a "A"'), { kind: "createElement", diagram: "s", elementKind: "icon" }),
    ).toMatch(/needs its icon/);
  });
});

describe("stickies and list groups in edits", () => {
  afterEach(() => setLocale("en"));
  const errors = (text: string) => compile(text).diagnostics.filter((d) => d.severity === "error");
  const listOf = (text: string, id: string) =>
    compile(text).document.diagrams[0]!.elementsById.get(id)!.list;
  const column = free(
    '  group todo "To do" { layout column }\n  placement {\n    place todo at (100, 100)\n    size todo (240, 400)\n  }',
  );

  it("writes a sticky with its colour and place in one edit", () => {
    const text = free('  box a "A"\n  placement {\n    place a at (10, 10)\n  }');
    const result = planEdit(compile(text), {
      kind: "createElement",
      diagram: "s",
      elementKind: "sticky",
      fill: "#f8bbd0",
      at: { x: 420, y: 266 },
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(text, result.plan.edits);
    expect(after).toBe(
      free(
        '  box a "A"\n  sticky sticky1 "Sticky"\n  style sticky1 { fill "#f8bbd0" }\n  placement {\n    place a at (10, 10)\n    place sticky1 at (420, 266)\n  }',
      ),
    );
    expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
    expect(errors(after)).toEqual([]);
    expect(compile(after).document.diagrams[0]!.elementsById.get("sticky1")!.label).toBe("Sticky");
  });

  it("gives a sticky its default text in the interface language, a token bare and no style without a fill", () => {
    const text = free('  box a "A"');
    expect(run(text, { kind: "createElement", diagram: "s", elementKind: "sticky" })).toBe(
      free('  box a "A"\n  sticky sticky1 "Sticky"'),
    );
    expect(
      run(text, { kind: "createElement", diagram: "s", elementKind: "sticky", fill: "@sticky" }),
    ).toBe(free('  box a "A"\n  sticky sticky1 "Sticky"\n  style sticky1 { fill sticky }'));
    expect(
      run(text, {
        kind: "createElement",
        diagram: "s",
        elementKind: "sticky",
        label: "Call the bank\nby Friday",
        fill: "#c8e6c9",
      }),
    ).toContain(
      '  sticky sticky1 "Call the bank\\nby Friday"\n  style sticky1 { fill "#c8e6c9" }\n',
    );
    setLocale("es");
    expect(run(text, { kind: "createElement", diagram: "s", elementKind: "sticky" })).toBe(
      free('  box a "A"\n  sticky sticky1 "Nota"'),
    );
  });

  it("writes the fill of a sticky created in a group with the diagram's styles", () => {
    const text = free('  group g "G" {\n    box a "A"\n  }\n  style a { fill "#eef" }');
    const after = run(text, {
      kind: "createElement",
      diagram: "s",
      elementKind: "sticky",
      parent: "g",
      fill: "#fff59d",
      at: { x: 40, y: 30 },
    });
    expect(after).toBe(
      free(
        '  group g "G" {\n    box a "A"\n    sticky sticky1 "Sticky"\n  }\n  style a { fill "#eef" }\n  style sticky1 { fill "#fff59d" }\n\n  placement {\n    place sticky1 at (40, 30)\n  }',
      ),
    );
    expect(errors(after)).toEqual([]);
  });

  it("refuses a sticky in a flow diagram and a fill the model refuses", () => {
    expect(
      refused('diagram f: flow {\n  api["API"]\n}\n', {
        kind: "createElement",
        diagram: "f",
        elementKind: "sticky",
      }),
    ).toMatch(/^edit.invalid-value: `sticky` elements belong to free diagrams/);
    expect(
      refused(free('  box a "A"'), {
        kind: "createElement",
        diagram: "s",
        elementKind: "sticky",
        fill: "@nowhere",
      }),
    ).toMatch(/^edit.invalid-value: /);
  });

  it("writes a column group with its layout, place and size", () => {
    const after = run(free('  box a "A"'), {
      kind: "createElement",
      diagram: "s",
      elementKind: "group",
      label: "To do",
      layout: "column",
      at: { x: 100, y: 100 },
      size: { width: 240, height: 400 },
    });
    expect(after).toBe(
      free(
        '  box a "A"\n  group group1 "To do" { layout column }\n\n  placement {\n    place group1 at (100, 100)\n    size group1 (240, 400)\n  }',
      ),
    );
    expect(listOf(after, "group1")).toEqual({ layout: "column", spacing: null, align: null });
    expect(errors(after)).toEqual([]);
  });

  it("refuses a layout on a new element that is not a group, in a flow diagram, or of another word", () => {
    expect(
      refused(free('  box a "A"'), {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        layout: "column",
      }),
    ).toBe("edit.invalid-value: Only a group takes `layout`, not a box.");
    expect(
      refused('diagram f: flow {\n  api["API"]\n}\n', {
        kind: "createElement",
        diagram: "f",
        elementKind: "group",
        layout: "row",
      }),
    ).toBe("edit.invalid-value: A group's `layout` belongs to free diagrams.");
    expect(
      refused(free('  box a "A"'), {
        kind: "createElement",
        diagram: "s",
        elementKind: "group",
        layout: "grid" as never,
      }),
    ).toBe("edit.invalid-value: `grid` is not a value of `layout`; expected one of column, row.");
  });

  it("adds cards to a list without a place, at an index, opening a block written on one line", () => {
    const first = run(column, {
      kind: "createElement",
      diagram: "s",
      elementKind: "sticky",
      parent: "todo",
      at: { x: 10, y: 20 },
    });
    expect(first).toBe(
      free(
        '  group todo "To do" {\n    layout column\n    sticky sticky1 "Sticky"\n  }\n  placement {\n    place todo at (100, 100)\n    size todo (240, 400)\n  }',
      ),
    );
    expect(errors(first)).toEqual([]);
    // Appended after the last card, and inserted before the first one with index 0.
    const second = run(first, {
      kind: "createElement",
      diagram: "s",
      elementKind: "sticky",
      parent: "todo",
    });
    expect(second).toContain(
      '    layout column\n    sticky sticky1 "Sticky"\n    sticky sticky2 "Sticky"\n  }\n',
    );
    const before = run(second, {
      kind: "createElement",
      diagram: "s",
      elementKind: "sticky",
      parent: "todo",
      label: "First",
      index: 0,
    });
    expect(before).toContain(
      '    layout column\n    sticky sticky3 "First"\n    sticky sticky1 "Sticky"\n    sticky sticky2 "Sticky"\n  }\n',
    );
    // Past the end is after the last; a column added to a row keeps its least size.
    const row = free(
      '  group board "" {\n    layout row; align stretch\n    group todo "To do" { layout column }\n  }',
    );
    const added = run(row, {
      kind: "createElement",
      diagram: "s",
      elementKind: "group",
      parent: "board",
      label: "Done",
      layout: "column",
      index: 7,
      at: { x: 300, y: 20 },
      size: { width: 240, height: 400 },
    });
    expect(added).toBe(
      free(
        '  group board "" {\n    layout row; align stretch\n    group todo "To do" { layout column }\n    group group1 "Done" { layout column }\n  }\n\n  placement {\n    size group1 (240, 400)\n  }',
      ),
    );
    expect(errors(added)).toEqual([]);
  });

  it("inserts a new declaration at an index of the diagram body, above the comments of the one there", () => {
    const text = free('  box a "A"\n  // the second\n  box b "B"');
    expect(run(text, { kind: "createElement", diagram: "s", elementKind: "text", index: 1 })).toBe(
      free('  box a "A"\n  text text1 "Text"\n  // the second\n  box b "B"'),
    );
    expect(
      run(text, {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        shape: "diamond",
        index: 0,
      }),
    ).toBe(
      free(
        '  box box1 "Box"\n  style box1 { shape diamond }\n  box a "A"\n  // the second\n  box b "B"',
      ),
    );
    expect(
      refused(text, { kind: "createElement", diagram: "s", elementKind: "box", index: -1 }),
    ).toBe(
      "edit.invalid-value: `-1` is not a position among the declarations of a block; positions are whole numbers from 0.",
    );
  });

  it("sets spacing and then removes the layout with it", () => {
    const spaced = run(column, {
      kind: "setElementProperty",
      diagram: "s",
      target: "todo",
      targetKind: "element",
      property: "spacing",
      value: 16,
    });
    expect(spaced).toBe(column.replace("{ layout column }", "{ layout column; spacing 16 }"));
    expect(listOf(spaced, "todo")).toEqual({ layout: "column", spacing: 16, align: null });
    const plain = run(spaced, {
      kind: "setElementProperty",
      diagram: "s",
      target: "todo",
      targetKind: "element",
      property: "layout",
      value: null,
    });
    expect(plain).toBe(column.replace("{ layout column }", "{ }"));
    expect(listOf(plain, "todo")).toBeNull();
    expect(errors(plain)).toEqual([]);
  });

  it("writes the list properties among the group's own statements, replacing values in place", () => {
    const text = free(
      '  group todo "To do" {\n    description "Next up"\n    // the first card\n    sticky a "A"\n    sticky b "B"\n  }',
    );
    const set = (
      source: string,
      property: "layout" | "spacing" | "align",
      value: string | number | null,
    ) =>
      run(source, {
        kind: "setElementProperty",
        diagram: "s",
        target: "todo",
        targetKind: "element",
        property,
        value,
      });
    const listed = set(text, "layout", "column");
    expect(listed).toBe(text.replace('"Next up"\n', '"Next up"\n    layout column\n'));
    const aligned = set(listed, "align", "stretch");
    expect(aligned).toContain(
      '    description "Next up"\n    layout column\n    align stretch\n    // the first card\n',
    );
    expect(set(aligned, "spacing", "12")).toContain("    align stretch\n    spacing 12\n");
    // Only the value changes, and the same value changes nothing.
    const result = planEdit(compile(aligned), {
      kind: "setElementProperty",
      diagram: "s",
      target: "todo",
      targetKind: "element",
      property: "layout",
      value: "row",
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(result.plan.edits).toHaveLength(1);
    expect(aligned.slice(result.plan.edits[0]!.start, result.plan.edits[0]!.end)).toBe("column");
    expect(listOf(applyTextEdits(aligned, result.plan.edits), "todo")).toEqual({
      layout: "row",
      spacing: null,
      align: "stretch",
    });
    const same = planEdit(compile(aligned), {
      kind: "setElementProperty",
      diagram: "s",
      target: "todo",
      targetKind: "element",
      property: "align",
      value: "stretch",
    });
    expect(same.ok && same.plan.edits).toEqual([]);
    // `align` alone goes; `layout` takes `align` with it and leaves the rest.
    expect(set(aligned, "align", null)).toBe(listed);
    expect(set(aligned, "layout", null)).toBe(text);
    // Removing what is not written changes nothing.
    const nothing = planEdit(compile(text), {
      kind: "setElementProperty",
      diagram: "s",
      target: "todo",
      targetKind: "element",
      property: "spacing",
      value: null,
    });
    expect(nothing.ok && nothing.plan.edits).toEqual([]);
    // A group that holds only children takes the layout before the first one and its comments.
    const children = free('  group g "G" {\n    // the first card\n    sticky a "A"\n  }');
    expect(
      run(children, {
        kind: "setElementProperty",
        diagram: "s",
        target: "g",
        targetKind: "element",
        property: "layout",
        value: "row",
      }),
    ).toBe(free('  group g "G" {\n    layout row\n    // the first card\n    sticky a "A"\n  }'));
    // An empty group takes it in its braces, and a sticky created in it opens them onto lines.
    const empty = run(free('  group g "G" { }'), {
      kind: "setElementProperty",
      diagram: "s",
      target: "g",
      targetKind: "element",
      property: "layout",
      value: "column",
    });
    expect(empty).toBe(free('  group g "G" { layout column }'));
    expect(
      run(free('  group g "G" { }'), {
        kind: "createElement",
        diagram: "s",
        elementKind: "sticky",
        parent: "g",
      }),
    ).toBe(free('  group g "G" {\n    sticky sticky1 "Sticky"\n  }'));
  });

  it("refuses the list properties on boxes, relations and flow groups, and values a list does not take", () => {
    const text = free(
      '  box api "API"\n  group todo "To do" {\n    sticky a "A"\n  }\n  api -> a as call',
    );
    const set = (
      source: string,
      target: string,
      property: "layout" | "spacing" | "align",
      value: string | number | null,
      targetKind: "element" | "relation" = "element",
    ) =>
      refused(source, {
        kind: "setElementProperty",
        diagram: source.startsWith("diagram f") ? "f" : "s",
        target,
        targetKind,
        property,
        value,
      });
    expect(set(text, "api", "layout", "column")).toBe(
      "edit.invalid-value: `layout` arranges the children of a group; `api` is not a group.",
    );
    expect(set(text, "call", "align", "start", "relation")).toBe(
      "edit.invalid-value: `align` arranges the children of a group; `call` is not a group.",
    );
    expect(
      set('diagram f: flow {\n  group g "G" {\n    a["A"]\n  }\n}\n', "g", "layout", "row"),
    ).toBe("edit.invalid-value: A group's `layout` belongs to free diagrams.");
    expect(set(text, "todo", "spacing", 8)).toBe(
      "edit.invalid-value: `spacing` arranges the children of a list; write `layout column` or `layout row` first.",
    );
    expect(set(text, "todo", "layout", "grid")).toBe(
      "edit.invalid-value: `grid` is not a value of `layout`; expected one of column, row.",
    );
    const listed = text.replace("{\n    sticky a", "{\n    layout column\n    sticky a");
    expect(set(listed, "todo", "spacing", 500)).toBe(
      "edit.invalid-value: `spacing` takes a number from 0 to 400.",
    );
    expect(set(listed, "todo", "align", "middle")).toBe(
      "edit.invalid-value: `middle` is not a value of `align`; expected one of start, center, end, stretch.",
    );
    expect(set(listed, "todo", "align", 3)).toMatch(
      /^edit.invalid-value: `3` is not a value of `align`/,
    );
    expect(
      refused(text, {
        kind: "setElementProperty",
        diagram: "s",
        target: "api",
        targetKind: "element",
        property: "layer",
        value: 2,
      }),
    ).toBe("edit.invalid-value: `layer` takes a word or a string.");
  });

  it("ungroups a list without leaving its arrangement in the body", () => {
    const text = free(
      '  group todo "To do" {\n    layout column\n    spacing 8\n    align stretch\n    sticky a "A"\n  }',
    );
    const after = run(text, { kind: "ungroup", diagram: "s", group: "todo" });
    expect(after).toBe(free('  sticky a "A"'));
    expect(errors(after)).toEqual([]);
  });
});

describe("reordering declarations", () => {
  const text = free('  box a "A"\n  box b "B" // second\n  box c "C"\n  a -> b');
  const order = (after: string) => compile(after).document.diagrams[0]!.elements.map((e) => e.id);

  it("sends backward, brings forward, to the front and to the back", () => {
    expect(
      order(run(text, { kind: "reorderElement", diagram: "s", element: "c", to: "backward" })),
    ).toEqual(["a", "c", "b"]);
    expect(
      order(run(text, { kind: "reorderElement", diagram: "s", element: "a", to: "forward" })),
    ).toEqual(["b", "a", "c"]);
    expect(
      order(run(text, { kind: "reorderElement", diagram: "s", element: "a", to: "front" })),
    ).toEqual(["b", "c", "a"]);
    expect(
      order(run(text, { kind: "reorderElement", diagram: "s", element: "c", to: "back" })),
    ).toEqual(["c", "a", "b"]);
  });

  it("moves trailing comments with the line and leaves relations in place", () => {
    const after = run(text, { kind: "reorderElement", diagram: "s", element: "b", to: "front" });
    expect(after).toBe(free('  box a "A"\n  box c "C"\n  box b "B" // second\n  a -> b'));
  });

  it("does nothing at the end already", () => {
    const result = planEdit(compile(text), {
      kind: "reorderElement",
      diagram: "s",
      element: "c",
      to: "front",
    });
    expect(result.ok && result.plan.edits).toEqual([]);
  });

  it("moves declarations that share a line", () => {
    const shared = free('  box a "A"; box b "B"; box c "C"');
    expect(
      order(run(shared, { kind: "reorderElement", diagram: "s", element: "a", to: "front" })),
    ).toEqual(["b", "c", "a"]);
  });

  it("reorders inside a group and declares implicit elements", () => {
    const grouped = free('  group g "G" {\n    box a "A"\n    box b "B"\n  }\n  x -> a');
    const after = run(grouped, { kind: "reorderElement", diagram: "s", element: "a", to: "front" });
    expect(after).toContain('    box b "B"\n    box a "A"\n');
    const declared = run(grouped, {
      kind: "reorderElement",
      diagram: "s",
      element: "x",
      to: "back",
    });
    expect(declared).toContain("  box x\n  group g");
  });
});

describe("layer, link and source statements", () => {
  const layered = free(
    '  layers main, front\n  box a "A"\n  box b "B" { description "Two" }\n  a -> b as r',
  );

  it("moves an element to a layer, and back to main", () => {
    const after = run(layered, {
      kind: "setElementProperty",
      diagram: "s",
      target: "a",
      targetKind: "element",
      property: "layer",
      value: "front",
    });
    expect(after).toContain('  box a "A" { layer front }\n');
    expect(
      run(after, {
        kind: "setElementProperty",
        diagram: "s",
        target: "a",
        targetKind: "element",
        property: "layer",
        value: "main",
      }),
    ).toBe(layered);
  });

  it("adds a layer to an existing block and to a relation", () => {
    const after = run(layered, {
      kind: "setElementProperty",
      diagram: "s",
      target: "b",
      targetKind: "element",
      property: "layer",
      value: "front",
    });
    expect(after).toContain('box b "B" { description "Two"; layer front }');
    expect(
      run(layered, {
        kind: "setElementProperty",
        diagram: "s",
        target: "r",
        targetKind: "relation",
        property: "layer",
        value: "front",
      }),
    ).toContain("a -> b as r { layer front }");
  });

  it("renames a layer everywhere it is written, and refuses main and taken names", () => {
    const after = run(layered, { kind: "renameLayer", diagram: "s", layer: "front", name: "top" });
    expect(after).toContain("layers main, top");
    expect(after).not.toContain("front");
    expect(
      refused(layered, { kind: "renameLayer", diagram: "s", layer: "main", name: "x" }),
    ).toMatch(/main/);
    expect(
      refused(layered, { kind: "renameLayer", diagram: "s", layer: "front", name: "main" }),
    ).toMatch(/not a free layer name/);
    // Flow diagrams take layers too.
    const flow = `diagram f: flow {\n  layers back, main\n  group band "Band" { layer back }\n  api["API"]\n}\n`;
    const renamed = run(flow, { kind: "renameLayer", diagram: "f", layer: "back", name: "bands" });
    expect(renamed).toContain("layers bands, main");
    expect(renamed).toContain('group band "Band" { layer bands }');
    expect(
      run(flow, {
        kind: "setElementProperty",
        diagram: "f",
        target: "api",
        targetKind: "element",
        property: "layer",
        value: "back",
      }),
    ).toContain('api["API"] { layer back }');
  });

  it("refuses unknown layers and malformed links", () => {
    expect(
      refused(layered, {
        kind: "setElementProperty",
        diagram: "s",
        target: "a",
        targetKind: "element",
        property: "layer",
        value: "back",
      }),
    ).toMatch(/^edit.invalid-value: There is no layer `back`/);
    expect(
      refused(layered, {
        kind: "setElementProperty",
        diagram: "s",
        target: "a",
        targetKind: "element",
        property: "link",
        value: "nowhere",
      }),
    ).toMatch(/is not a link/);
  });

  it("writes a link that resolves", () => {
    const text = `diagram f: flow {\n  api["API"]\n}\n\n${layered}`;
    const after = run(text, {
      kind: "setElementProperty",
      diagram: "s",
      target: "a",
      targetKind: "element",
      property: "link",
      value: "f.api",
    });
    expect(after).toContain('box a "A" { link f.api }');
    expect(
      refused(text, {
        kind: "setElementProperty",
        diagram: "s",
        target: "a",
        targetKind: "element",
        property: "link",
        value: "f.ghost",
      }),
    ).toMatch(/^edit.invalid-value: `f` has no element `ghost`/);
  });

  it("replaces the source of icons and images", () => {
    const text = free('  icon i "tabler:user"');
    expect(
      run(text, { kind: "setElementSource", diagram: "s", element: "i", source: "tabler:server" }),
    ).toContain('icon i "tabler:server"');
    expect(
      refused(text, { kind: "setElementLabel", diagram: "s", element: "i", label: "X" }),
    ).toMatch(/has no label/);
  });

  it("sets the layers of the diagram", () => {
    const after = run(free('  box a "A"'), {
      kind: "setDiagramProperty",
      diagram: "s",
      property: "layers",
      value: "back, main ,front",
    });
    expect(after).toContain("  layers back, main, front\n");
  });
});

describe("links follow renames and removals", () => {
  const text = `diagram checkout: flow {\n  api["API Gateway"]\n  api -> db\n}\n\ndiagram checkout_free: free {\n  box api "API Gateway" { link checkout.api }\n  box other "Other" { description "x"; link checkout.api }\n}\n`;

  it("rewrites the element part of links on rename", () => {
    const after = run(text, {
      kind: "renameElement",
      diagram: "checkout",
      element: "api",
      newId: "gateway",
    });
    expect(after).toContain('box api "API Gateway" { link checkout.gateway }');
    expect(after).toContain('box other "Other" { description "x"; link checkout.gateway }');
  });

  it("lists links as dependents and removes them with cascade", () => {
    const result = planEdit(compile(text), {
      kind: "removeElement",
      diagram: "checkout",
      element: "api",
      cascade: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.dependents!.map((d) => d.kind)).toEqual(["relation", "link", "link"]);
    }
    const after = run(text, {
      kind: "removeElement",
      diagram: "checkout",
      element: "api",
      cascade: true,
    });
    expect(after).toContain('  box api "API Gateway"\n');
    expect(after).toContain('  box other "Other" { description "x" }\n');
    expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("arranging free diagrams", () => {
  it("writes places and sizes of groups with interior positions", () => {
    const text = free('  layout auto\n  group g "G" {\n    box a "A"\n  }\n  box b "B"\n  a -> b');
    const after = run(text, {
      kind: "arrange",
      diagram: "s",
      scope: "all",
      writeGroups: true,
      positions: new Map([
        ["g", { x: 200, y: 150 }],
        ["a", { x: 96, y: 48 }],
        ["b", { x: 500, y: 150 }],
      ]),
      sizes: new Map([["g", { width: 224, height: 140 }]]),
    });
    expect(after).toContain("  layout assisted\n");
    expect(after).toContain(
      "    place g at (200, 150)\n    size g (224, 140)\n    place a at (96, 48)\n    place b at (500, 150)\n",
    );
    expect(compile(after).diagnostics).toEqual([]);
  });

  it("writes no place for the children of a list and no size for the list, nested lists included", () => {
    const text = free(
      '  layout auto\n  group board "" {\n    layout row\n    group todo "To do" {\n      layout column\n      sticky a "A"\n      sticky b "B"\n    }\n  }\n  box c "C"\n  a -> c',
    );
    const positions = new Map([
      ["board", { x: 300, y: 200 }],
      ["todo", { x: 120, y: 160 }],
      ["a", { x: 80, y: 40 }],
      ["b", { x: 80, y: 220 }],
      ["c", { x: 700, y: 200 }],
    ]);
    const sizes = new Map([
      ["board", { width: 480, height: 400 }],
      ["todo", { width: 200, height: 380 }],
    ]);
    const after = run(text, {
      kind: "arrange",
      diagram: "s",
      scope: "all",
      writeGroups: true,
      positions,
      sizes,
    });
    expect(after).toContain(
      "  placement {\n    place board at (300, 200)\n    place c at (700, 200)\n  }\n",
    );
    expect(after).not.toMatch(/place (todo|a|b) |size /);
    expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // A list placed and sized by hand keeps its least size, and its children stay unplaced.
    const sized = text.replace(
      "  a -> c",
      "  a -> c\n  placement {\n    place board at (10, 10)\n    size board (600, 300)\n  }",
    );
    const moved = run(sized, { kind: "arrange", diagram: "s", scope: "all", positions, sizes });
    expect(moved).toContain(
      "    place board at (300, 200)\n    size board (600, 300)\n    place c at (700, 200)\n",
    );
    expect(moved).not.toMatch(/place (todo|a|b) /);
  });

  it("writes no place for lines and pens, whose points are in their statements", () => {
    const text = free(
      '  layout auto\n  box a "A"\n  line l from (0, 0) to (100, 0)\n  pen p [(0, 40), (50, 60), (100, 40)]\n  group g "G" {\n    pen q [(0, 0), (20, 20)]\n    box b "B"\n  }',
    );
    for (const scope of ["unplaced", "all"] as const) {
      const after = run(text, {
        kind: "arrange",
        diagram: "s",
        scope,
        writeGroups: true,
        positions: new Map([
          ["a", { x: 100, y: 100 }],
          ["l", { x: 50, y: 0 }],
          ["p", { x: 50, y: 50 }],
          ["g", { x: 400, y: 200 }],
          ["q", { x: 10, y: 10 }],
          ["b", { x: 96, y: 48 }],
        ]),
        sizes: new Map([["g", { width: 240, height: 160 }]]),
      });
      expect(after, scope).toContain(
        "  placement {\n    place a at (100, 100)\n    place g at (400, 200)\n    size g (240, 160)\n    place b at (96, 48)\n  }\n",
      );
      expect(after, scope).not.toMatch(/place (l|p|q) /);
      expect(compile(after).diagnostics, scope).toEqual([]);
    }
  });
});

describe("converting to free", () => {
  const engine = createElkEngine();

  function convert(text: string, diagram: string): { after: string; source: Map<string, Box> } {
    const compilation: Compilation = compile(text);
    const flow = compilation.document.diagrams.find((d) => d.id === diagram)!;
    const layout = layoutDiagram(compilation, flow, { engine });
    expect(layout.scene).not.toBeNull();
    const theme = layout.theme!;
    const scale = typeScale(theme);
    const after = run(text, {
      kind: "convertToFree",
      diagram,
      boxes: layout.boxes!,
      metrics: {
        groupPadding: theme.groupPadding,
        groupHeader: theme.groupHeader,
        tagSize: scale.tag,
      },
    });
    return { after, source: new Map(layout.boxes!) };
  }

  function expectSameBoxes(after: string, id: string, source: Map<string, Box>) {
    const compilation = compile(after);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const copy = compilation.document.diagrams.find((d) => d.id === id)!;
    const result = layoutDiagram(compilation, copy, { engine });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    for (const [element, box] of source) {
      const drawn = result.boxes!.get(element)!;
      const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      expect(Math.abs(centre(drawn).x - centre(box).x), element).toBeLessThanOrEqual(1);
      expect(Math.abs(centre(drawn).y - centre(box).y), element).toBeLessThanOrEqual(1);
      expect(Math.abs(drawn.width - box.width), element).toBeLessThanOrEqual(1);
      expect(Math.abs(drawn.height - box.height), element).toBeLessThanOrEqual(1);
    }
  }

  it("copies the checkout sheet as drawn, with links", () => {
    const text = readFileSync(join(CORPUS_ROOT, "valid", "checkout.meltemi"), "utf8");
    const { after, source } = convert(text, "checkout");
    expect(after.startsWith(text.trimEnd())).toBe(true);
    const copy = after.slice(after.indexOf("diagram checkout_free: free {"));
    expect(copy).toContain('  box api "API Gateway" { link checkout.api }');
    expect(copy).toContain('  box db "PostgreSQL" { class from_data; link checkout.db }');
    expect(copy).toContain("  class from_data { shape cylinder }");
    expect(copy).toContain('  theme "editorial.light"\n  layout manual\n');
    expect(copy).toContain("    route create from api.east to orders.west via [(520, 180)]");
    expect(copy).toContain('  style api {\n    icon "tabler:server"\n  }');
    expect(copy).toContain("  animate request {\n    effect flow\n");
    expectSameBoxes(after, "checkout_free", source);
  });

  it("keeps children inside their copied group at the same place", () => {
    const text =
      'diagram d: flow {\n  layout manual\n  group backend "Backend" {\n    api["API"]\n    db[("DB")]\n    api -> db\n  }\n  client["Client"]\n  note n "Remember"\n  tag t "v2"\n  client -> api\n  placement {\n    place client at (100, 100)\n    place api at (400, 100)\n    place db at (400, 260)\n    place n at (100, 260)\n    place t at (100, 340)\n  }\n}\n';
    const { after, source } = convert(text, "d");
    expect(after).toContain(
      '  group backend "Backend" {\n    link d.backend\n    box api "API" { link d.api }',
    );
    expect(after).toContain("    api -> db\n  }");
    // A note stays a note, with no class of its own.
    expect(after).toContain('  note n "Remember" { link d.n }');
    expect(after).not.toContain("from_note");
    expectSameBoxes(after, "d_free", source);
  });

  it("measures the children of an untitled group from its padding", () => {
    const text =
      'diagram d: flow {\n  layout manual\n  group backend "" {\n    api["API"]\n  }\n  client["Client"]\n  client -> api\n  placement {\n    place client at (100, 100)\n    place api at (400, 100)\n  }\n}\n';
    const { after, source } = convert(text, "d");
    const group = source.get("backend")!;
    const api = source.get("api")!;
    const local = (value: number) => String(Math.round(value));
    expect(after).toContain(
      `    place api at (${local(api.x + api.width / 2 - group.x - 16)}, ${local(api.y + api.height / 2 - group.y - 16)})\n`,
    );
    expectSameBoxes(after, "d_free", source);
  });

  it("tells untitled groups by their label, description and icon", () => {
    const groups = [
      'group plain "" { a["A"] }',
      'group described "" { description "Why"; b["B"] }',
      'group titled "T" { c["C"] }',
      'group named { d["D"] }',
      'group styled "" { e["E"] }',
      'group classed "" { class iconic; f["F"] }',
      'group ruled "" { g["G"] }',
    ];
    const text = `theme brand {\n  extends "technical.light"\n  class iconic { icon "tabler:box" }\n}\n\ndiagram d: flow {\n  theme "brand"\n  ${groups.join("\n  ")}\n  style styled { icon "tabler:server" }\n}\n`;
    const compilation = compile(text);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const ctx = { compilation, text, diagram, eol: "\n", unit: "  ", notes: [] };
    const untitled = diagram.elements
      .filter((e) => e.kind === "group" && isUntitled(ctx, e))
      .map((e) => e.id);
    expect(untitled).toEqual(["plain", "ruled"]);
    const withRule = compile(
      text.replace('  theme "brand"\n', '  theme "brand"\n  rule group { icon "tabler:folder" }\n'),
    );
    const ruled = withRule.document.diagrams[0]!;
    expect(
      ruled.elements.some(
        (e) =>
          e.kind === "group" && isUntitled({ ...ctx, compilation: withRule, diagram: ruled }, e),
      ),
    ).toBe(false);
  });

  it("keeps the layers and every layer statement", () => {
    const text =
      'diagram d: flow {\n  layout manual\n  layers back, main\n  group band "" {\n    layer back\n    api["API"]\n  }\n  db[("DB")] { layer back }\n  api -> db { layer back }\n  placement {\n    place api at (200, 100)\n    place db at (500, 100)\n  }\n}\n';
    const { after, source } = convert(text, "d");
    const copy = after.slice(after.indexOf("diagram d_free: free {"));
    expect(copy).toContain("  layers back, main\n  layout manual\n");
    expect(copy).toContain('  group band "" {\n    layer back\n    link d.band\n');
    expect(copy).toContain(
      '  box db "DB" {\n    class from_data\n    layer back\n    link d.db\n  }\n',
    );
    expect(copy).toContain("  api -> db { layer back }\n");
    const model = compile(after).document.diagrams.find((d) => d.id === "d_free")!;
    expect(model.elementsById.get("band")!.layer).toBe("back");
    expect(model.relations[0]!.layer).toBe("back");
    expectSameBoxes(after, "d_free", source);
  });

  it("names the copy after free ids and refuses diagrams with errors", () => {
    const text =
      "diagram d: flow {\n  layout manual\n  a -> b\n  placement { place a at (0, 0); place b at (300, 0) }\n}\n\ndiagram d_free: free {\n}\n";
    expect(convert(text, "d").after).toContain("diagram d_free_2: free {");
    expect(
      refused(text, {
        kind: "convertToFree",
        diagram: "d",
        boxes: new Map(),
        metrics: { groupPadding: 16, groupHeader: 40, tagSize: 10.5 },
      }),
    ).toMatch(/has no drawn box/);
  });
});
