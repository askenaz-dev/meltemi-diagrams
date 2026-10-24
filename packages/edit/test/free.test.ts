import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
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
        noteSize: scale.note,
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
    expect(after).toContain('  text n "Remember" { class from_note; link d.n }');
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
        metrics: { groupPadding: 16, groupHeader: 40, noteSize: 11, tagSize: 10.5 },
      }),
    ).toMatch(/has no drawn box/);
  });
});
