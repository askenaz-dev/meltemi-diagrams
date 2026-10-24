import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { planEdit, type EditOperation, type PlanResult } from "../src/index.js";

function plan(operation: EditOperation, text: string): PlanResult {
  return planEdit(compile(text), operation);
}

/** Plans, applies and checks that the result compiles without errors and the inverse restores. */
function apply(operation: EditOperation, text: string): string {
  const result = plan(operation, text);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(operation: EditOperation, text: string) {
  const result = plan(operation, text);
  if (result.ok) throw new Error("expected a rejection");
  return result.rejection;
}

const sheet = `diagram d: flow {
  layout manual
  // services
  api["API"]
  db[("DB")]
  api -> db: "save" as save
  placement {
    place api at (100, 100)
    place db at (400, 100)
  }
}
`;

describe("planBatch", () => {
  it("composes several operations into one plan", () => {
    const batch: EditOperation = {
      kind: "batch",
      operations: [
        { kind: "setPosition", diagram: "d", element: "api", x: 120, y: 100 },
        { kind: "setSize", diagram: "d", element: "api", width: 200, height: 60 },
        { kind: "setPosition", diagram: "d", element: "db", x: 420, y: 100 },
      ],
    };
    const after = apply(batch, sheet);
    expect(after).toContain("place api at (120, 100)");
    expect(after).toContain("place db at (420, 100)");
    expect(after).toContain("size api (200, 60)");
    // The same as applying the operations one by one.
    let sequential = sheet;
    for (const operation of (batch as { readonly operations: readonly EditOperation[] })
      .operations) {
      sequential = apply(operation, sequential);
    }
    expect(after).toBe(sequential);
  });

  it("merges edits that touch text inserted earlier", () => {
    const batch: EditOperation = {
      kind: "batch",
      operations: [
        { kind: "createElement", diagram: "d", elementKind: "node", at: { x: 700, y: 100 } },
        { kind: "setPosition", diagram: "d", element: "node1", x: 714, y: 100 },
        { kind: "setElementLabel", diagram: "d", element: "node1", label: "Cache" },
      ],
    };
    const result = plan(batch, sheet);
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(sheet, result.plan.edits);
    expect(after).toContain('  node1["Cache"]\n');
    expect(after).toContain("    place node1 at (714, 100)\n");
    expect(applyTextEdits(after, result.plan.inverse)).toBe(sheet);
  });

  it("refuses the whole batch and names the operation", () => {
    const rejection = refused(
      {
        kind: "batch",
        operations: [
          { kind: "setPosition", diagram: "d", element: "api", x: 1, y: 1 },
          { kind: "setPosition", diagram: "d", element: "ghost", x: 1, y: 1 },
        ],
      },
      sheet,
    );
    expect(rejection.code).toBe("edit.unsafe-target");
    expect(rejection.operationIndex).toBe(1);
  });
});

describe("creating", () => {
  it("declares a node after the last declaration and places it", () => {
    const after = apply(
      { kind: "createElement", diagram: "d", elementKind: "node", at: { x: 420, y: 266 } },
      sheet,
    );
    expect(after).toContain('  db[("DB")]\n  node1["Node"]\n  api -> db');
    expect(after).toContain("    place db at (400, 100)\n    place node1 at (420, 266)\n");
  });

  it("writes each kind in its form and skips used ids", () => {
    let text = apply(
      { kind: "createElement", diagram: "d", elementKind: "data", id: "orders", label: "Orders" },
      sheet,
    );
    text = apply({ kind: "createElement", diagram: "d", elementKind: "decision" }, text);
    text = apply(
      { kind: "createElement", diagram: "d", elementKind: "note", label: "Line\ntwo" },
      text,
    );
    text = apply(
      {
        kind: "createElement",
        diagram: "d",
        elementKind: "group",
        at: { x: 300, y: 300 },
        size: { width: 400, height: 200 },
      },
      text,
    );
    expect(text).toContain(
      '  orders[("Orders")]\n  decision decision1 "Decision"\n  note note1 "Line\\ntwo"\n  group group1 "Group" { }\n',
    );
    expect(text).toContain("place group1 at (300, 300)\n    size group1 (400, 200)");
  });

  it("creates inside a group", () => {
    const grouped = `diagram d: flow {\n  group back "Back" {\n    api["API"]\n  }\n}\n`;
    const after = apply(
      { kind: "createElement", diagram: "d", elementKind: "node", parent: "back" },
      grouped,
    );
    expect(after).toBe(
      `diagram d: flow {\n  group back "Back" {\n    api["API"]\n    node1["Node"]\n  }\n}\n`,
    );
    expect(compile(after).document.diagrams[0]!.elementsById.get("node1")!.groupPath).toEqual([
      "back",
    ]);
  });

  it("adds relations after the last one, with a route when ports are given", () => {
    const plain = apply(
      { kind: "createRelation", diagram: "d", from: "db", to: "api", line: "dashed" },
      sheet,
    );
    expect(plain).toContain('  api -> db: "save" as save\n  db --> api\n');
    const routed = apply(
      {
        kind: "createRelation",
        diagram: "d",
        from: "api",
        to: "db",
        line: "solid",
        label: "read",
        fromPort: "south",
        toPort: "south",
      },
      sheet,
    );
    expect(routed).toContain('  api -> db: "read" as api_db\n');
    expect(routed).toContain("    route api_db from api.south to db.south\n");
  });

  it("writes the six relation tokens", () => {
    const cases: [Pick<EditOperation & { kind: "createRelation" }, "line" | "heads">, string][] = [
      [{ line: "solid" }, "->"],
      [{ line: "dashed" }, "-->"],
      [{ line: "solid", heads: "none" }, "--"],
      [{ line: "dashed", heads: "none" }, "---"],
      [{ line: "solid", heads: "both" }, "<->"],
      [{ line: "dashed", heads: "both" }, "<-->"],
    ];
    for (const [arrow, written] of cases) {
      const after = apply(
        { kind: "createRelation", diagram: "d", from: "db", to: "api", ...arrow },
        sheet,
      );
      expect(after).toContain(`  api -> db: "save" as save\n  db ${written} api\n`);
      const relation = compile(after).document.diagrams[0]!.relations[1]!;
      expect([relation.line, relation.heads]).toEqual([arrow.line, arrow.heads ?? "end"]);
    }
    const c4 = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const view = compile(c4).document.diagrams.find((d) => d.type === "c4")!;
    const [from, to] = view.elements.filter((e) => e.kind !== "group");
    expect(
      refused(
        {
          kind: "createRelation",
          diagram: view.id,
          from: from!.id,
          to: to!.id,
          line: "solid",
          heads: "both",
        },
        c4,
      ).reason,
    ).toBe("Relations of C4 views go one way: `->`.");
  });

  it("refuses unknown ports and taken ids", () => {
    expect(
      refused(
        {
          kind: "createRelation",
          diagram: "d",
          from: "api",
          to: "db",
          line: "solid",
          toPort: "in",
        },
        sheet,
      ).code,
    ).toBe("edit.invalid-value");
    expect(
      refused({ kind: "createElement", diagram: "d", elementKind: "node", id: "save" }, sheet).code,
    ).toBe("edit.id-conflict");
  });
});

describe("relations", () => {
  const styled = sheet.replace(
    "  placement {",
    "  style save, api { stroke danger }\n  placement {\n    route save from api.east to db.west\n    label save at 50% offset (0, -16)",
  );

  it("renames a relation everywhere", () => {
    const after = apply(
      { kind: "renameRelation", diagram: "d", relation: "save", newId: "persist" },
      styled,
    );
    expect(after).toContain("as persist");
    expect(after).toContain("style persist, api");
    expect(after).toContain("route persist from");
    expect(after).toContain("label persist at");
    expect(after).not.toMatch(/\bsave\b(?!")/);
  });

  it("removes a relation with its route, label and style target", () => {
    const after = apply({ kind: "removeRelation", diagram: "d", relation: "save" }, styled);
    expect(after).not.toContain("->");
    expect(after).not.toContain("route");
    expect(after).not.toContain("label save");
    expect(after).toContain("  style api { stroke danger }\n");
  });

  it("keeps implicit endpoints declared", () => {
    const after = apply(
      { kind: "removeRelation", diagram: "d", relation: "a->b#1" },
      `diagram d: flow {\n  layout manual\n  a -> b\n  placement { place a at (0, 0); place b at (200, 0) }\n}\n`,
    );
    expect(after).toContain("  node a; node b\n");
  });

  it("reconnects an end and its route", () => {
    const routed = styled.replace('  db[("DB")]\n', '  db[("DB")]\n  cache["Cache"]\n');
    const after = apply(
      {
        kind: "reconnectRelation",
        diagram: "d",
        relation: "save",
        end: "to",
        element: "cache",
        port: "north",
      },
      routed,
    );
    expect(after).toContain('api -> cache: "save" as save');
    expect(after).toContain("route save from api.east to cache.north");
  });

  it("names and routes an anonymous relation that gets a port", () => {
    const after = apply(
      {
        kind: "reconnectRelation",
        diagram: "d",
        relation: "a->b#1",
        end: "from",
        element: "a",
        port: "south",
      },
      `diagram d: flow {\n  layout manual\n  a["A"]\n  b["B"]\n  a -> b\n  placement { place a at (0, 0); place b at (200, 0) }\n}\n`,
    );
    expect(after).toContain("a -> b as a_b");
    expect(after).toContain("route a_b from a.south to b.auto");
  });

  it("switches the line", () => {
    const after = apply(
      { kind: "setRelationLine", diagram: "d", relation: "save", line: "dashed" },
      sheet,
    );
    expect(after).toContain('api --> db: "save" as save');
  });

  it("switches the line of a line and keeps it without heads", () => {
    const lined = sheet.replace('api -> db: "save" as save', 'api -- db: "save" as save');
    const dashed = apply(
      { kind: "setRelationLine", diagram: "d", relation: "save", line: "dashed" },
      lined,
    );
    expect(dashed).toContain('api --- db: "save" as save');
    const solid = apply(
      { kind: "setRelationLine", diagram: "d", relation: "save", line: "solid" },
      dashed,
    );
    expect(solid).toContain('api -- db: "save" as save');
  });

  it("refuses a line where the profile takes none", () => {
    const c4 = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const view = compile(c4).document.diagrams.find((d) => d.type === "c4")!;
    const [from, to] = view.elements.filter((e) => e.kind !== "group");
    expect(
      refused(
        {
          kind: "createRelation",
          diagram: view.id,
          from: from!.id,
          to: to!.id,
          line: "solid",
          heads: "none",
        },
        c4,
      ).reason,
    ).toBe("Relations of C4 views go one way: `->`.");
  });
});

describe("labels, descriptions and kinds", () => {
  it("replaces or adds a label", () => {
    expect(
      apply({ kind: "setElementLabel", diagram: "d", element: "api", label: "Orders API" }, sheet),
    ).toContain('api["Orders API"]');
    const typed = apply(
      { kind: "setElementLabel", diagram: "d", element: "n", label: "Named" },
      `diagram d: flow {\n  node n\n}\n`,
    );
    expect(typed).toContain('node n "Named"');
  });

  it("declares an implicit element to label it", () => {
    const after = apply(
      { kind: "setElementLabel", diagram: "d", element: "b", label: "Billing" },
      `diagram d: flow {\n  a["A"]\n  a -> b\n}\n`,
    );
    expect(after).toBe(`diagram d: flow {\n  a["A"]\n  b["Billing"]\n  a -> b\n}\n`);
  });

  it("sets, replaces and removes descriptions", () => {
    let text = apply(
      {
        kind: "setDescription",
        diagram: "d",
        target: "api",
        targetKind: "element",
        description: "REST",
      },
      sheet,
    );
    expect(text).toContain('api["API"] { description "REST" }');
    text = apply(
      {
        kind: "setDescription",
        diagram: "d",
        target: "api",
        targetKind: "element",
        description: "gRPC",
      },
      text,
    );
    expect(text).toContain('api["API"] { description "gRPC" }');
    text = apply(
      {
        kind: "setDescription",
        diagram: "d",
        target: "api",
        targetKind: "element",
        description: null,
      },
      text,
    );
    expect(text).toBe(sheet);
    const relation = apply(
      {
        kind: "setDescription",
        diagram: "d",
        target: "save",
        targetKind: "relation",
        description: "Writes",
      },
      sheet,
    );
    expect(relation).toContain('as save { description "Writes" }');
  });

  it("rewrites the kind and keeps label and block", () => {
    const text = sheet.replace('api["API"]', 'api["API \\"v2\\""] { description "REST" }');
    expect(
      apply({ kind: "setElementKind", diagram: "d", element: "api", elementKind: "data" }, text),
    ).toContain('api[("API \\"v2\\"")] { description "REST" }');
    expect(
      apply(
        { kind: "setElementKind", diagram: "d", element: "db", elementKind: "decision" },
        sheet,
      ),
    ).toContain('decision db "DB"');
  });

  it("drops the shape of a node that becomes a kind drawing its own shape", () => {
    const text = `diagram d: flow {
  api["API"]
  cache["Cache"]
  style api, cache { shape hexagon; fill "#eef" }
}
`;
    const result = apply(
      { kind: "setElementKind", diagram: "d", element: "api", elementKind: "decision" },
      text,
    );
    expect(result).toContain('decision api "API"');
    expect(result).toContain('style cache { shape hexagon; fill "#eef" }');
    expect(result).toContain('style api { fill "#eef" }');
    expect(compile(result).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("style and diagram properties", () => {
  it("creates, replaces and removes a property", () => {
    let text = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "fill",
        value: "#eeeeff",
      },
      sheet,
    );
    expect(text).toContain('  style api { fill "#eeeeff" }\n');
    text = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "stroke",
        value: "@danger",
      },
      text,
    );
    expect(text).toContain('  style api { fill "#eeeeff"; stroke danger }\n');
    text = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "fill",
        value: "accent",
      },
      text,
    );
    expect(text).toContain("  style api { fill accent; stroke danger }\n");
    text = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "fill",
        value: null,
      },
      text,
    );
    text = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "stroke",
        value: null,
      },
      text,
    );
    expect(text).toBe(sheet);
  });

  it("splits a statement shared by several targets", () => {
    const shared = sheet.replace(
      "  placement {",
      '  style api, db { fill "#eef"; line dashed }\n  placement {',
    );
    const after = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "fill",
        value: "accent",
      },
      shared,
    );
    expect(after).toContain(
      '  style db { fill "#eef"; line dashed }\n  style api { line dashed; fill accent }\n',
    );
  });

  it("validates values and targets", () => {
    expect(
      refused(
        {
          kind: "setStyleProperty",
          diagram: "d",
          target: "api",
          targetKind: "element",
          property: "routing",
          value: "bezier",
        },
        sheet,
      ).code,
    ).toBe("edit.invalid-value");
    expect(
      refused(
        {
          kind: "setStyleProperty",
          diagram: "d",
          target: "api",
          targetKind: "element",
          property: "line",
          value: "wavy",
        },
        sheet,
      ).code,
    ).toBe("edit.invalid-value");
    const routed = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "save",
        targetKind: "relation",
        property: "routing",
        value: "bezier",
      },
      sheet,
    );
    expect(routed).toContain("style save { routing bezier }");
  });

  it("writes the icon's size as a number or the word auto, within its bounds", () => {
    const size = (value: string | number) => ({
      kind: "setStyleProperty" as const,
      diagram: "d",
      target: "api",
      targetKind: "element" as const,
      property: "iconSize",
      value,
    });
    let text = apply(size(48), sheet);
    expect(text).toContain("  style api { iconSize 48 }\n");
    text = apply(size("auto"), text);
    expect(text).toContain("  style api { iconSize auto }\n");
    text = apply(size("32"), text);
    expect(text).toContain("  style api { iconSize 32 }\n");
    for (const value of [200, "4", "big", ""]) {
      expect(refused(size(value), sheet).code, String(value)).toBe("edit.invalid-value");
    }
    expect(refused(size("big"), sheet).reason).toBe("`big` is not a value of `iconSize`.");
    expect(refused(size(200), sheet).reason).toBe("`iconSize` takes a number from 8 to 128.");
    const placed = apply(
      {
        kind: "setStyleProperty",
        diagram: "d",
        target: "api",
        targetKind: "element",
        property: "labelPosition",
        value: "top",
      },
      sheet,
    );
    expect(placed).toContain("  style api { labelPosition top }\n");
  });

  it("sets diagram properties", () => {
    let text = apply(
      { kind: "setDiagramProperty", diagram: "d", property: "title", value: "Checkout" },
      sheet,
    );
    expect(text).toContain('  layout manual\n  title "Checkout"\n');
    text = apply(
      { kind: "setDiagramProperty", diagram: "d", property: "layout", value: "assisted" },
      text,
    );
    expect(text).toContain("  layout assisted\n");
    text = apply(
      { kind: "setDiagramProperty", diagram: "d", property: "canvas", value: "1280 x 720" },
      text,
    );
    expect(text).toContain("  canvas (1280, 720)\n");
    text = apply(
      { kind: "setDiagramProperty", diagram: "d", property: "title", value: null },
      text,
    );
    expect(text).not.toContain("title");
    expect(
      refused(
        { kind: "setDiagramProperty", diagram: "d", property: "direction", value: "UP" },
        sheet,
      ).code,
    ).toBe("edit.invalid-value");
  });
});

describe("ports, groups and fragments", () => {
  it("adds and removes ports", () => {
    let text = apply(
      { kind: "addPort", diagram: "d", element: "db", name: "in", side: "west", position: 0.3 },
      sheet,
    );
    expect(text).toContain('db[("DB")] { port in west 30% }');
    text = apply({ kind: "addPort", diagram: "d", element: "db", name: "out", side: "east" }, text);
    expect(text).toContain('db[("DB")] { port in west 30%; port out east }');
    const used = text.replace(
      "    place db",
      "    route save from api.east to db.in\n    place db",
    );
    expect(
      refused({ kind: "removePort", diagram: "d", element: "db", name: "in" }, used).code,
    ).toBe("edit.has-dependents");
    text = apply({ kind: "removePort", diagram: "d", element: "db", name: "in" }, text);
    text = apply({ kind: "removePort", diagram: "d", element: "db", name: "out" }, text);
    expect(text).toBe(sheet);
  });

  it("groups siblings and ungroups them back", () => {
    const grouped = apply(
      {
        kind: "groupElements",
        diagram: "d",
        elements: ["db", "api"],
        id: "back",
        label: "Backend",
      },
      sheet,
    );
    expect(grouped).toContain(
      '  // services\n  group back "Backend" {\n    api["API"]\n    db[("DB")]\n  }\n  api -> db',
    );
    const model = compile(grouped).document.diagrams[0]!;
    expect(model.elementsById.get("db")!.groupPath).toEqual(["back"]);
    const back = apply({ kind: "ungroup", diagram: "d", group: "back" }, grouped);
    expect(back).toBe(sheet);
  });

  it("refuses to group elements of different parents and to ungroup a relation end", () => {
    const nested = `diagram d: flow {\n  group g "G" {\n    a["A"]\n  }\n  b["B"]\n  g -> b\n}\n`;
    expect(
      refused(
        { kind: "groupElements", diagram: "d", elements: ["a", "b"], id: "x", label: "X" },
        nested,
      ).code,
    ).toBe("edit.unsafe-target");
    expect(refused({ kind: "ungroup", diagram: "d", group: "g" }, nested).code).toBe(
      "edit.has-dependents",
    );
  });

  it("adds the layers a fragment uses to the diagram on their side of main", () => {
    const layered = `diagram d: free {\n  layers back, main, front\n  box a "A"\n}\n`;
    const fragment = `diagram clipboard: free {\n  layers band, main, top\n  group zone "" { layer band }\n  box b "B" { layer top }\n  box c "C" { layer front }\n  b -> c { layer top }\n}\n`;
    const after = apply({ kind: "insertFragment", diagram: "d", fragment }, layered);
    expect(after).toContain("  layers back, band, main, top, front\n");
    expect(after).toContain('  group zone "" { layer band }\n  box b "B" { layer top }\n');
    expect(after).toContain("  b -> c { layer top }\n");
    const model = compile(after).document.diagrams[0]!;
    expect(model.elementsById.get("zone")!.layer).toBe("band");
    // A diagram without `layers` gains the statement; a layer the fragment uses without declaring
    // it goes before main.
    const plain = apply(
      { kind: "insertFragment", diagram: "d", fragment },
      'diagram d: free {\n  box a "A"\n}\n',
    );
    expect(plain).toBe(
      'diagram d: free {\n  layers band, front, main, top\n  box a "A"\n  group zone "" { layer band }\n  box b "B" { layer top }\n  box c "C" { layer front }\n  b -> c { layer top }\n}\n',
    );
    // Boxes copied from a front layer stay above the main boxes they are pasted among.
    const front = `diagram clipboard: free {\n  layers back, main, front\n  box f "F" { layer front }\n}\n`;
    expect(
      apply(
        { kind: "insertFragment", diagram: "d", fragment: front },
        'diagram d: free {\n  box a "A"\n}\n',
      ),
    ).toContain("  layers main, front\n");
    // Added layers keep their order and their neighbours from the fragment, on each side.
    const many = `diagram clipboard: free {\n  layers floor, back, under, main, front, over, sky\n  box p "P" { layer floor }\n  box q "Q" { layer under }\n  box r "R" { layer over }\n  box s "S" { layer sky }\n}\n`;
    expect(apply({ kind: "insertFragment", diagram: "d", fragment: many }, layered)).toContain(
      "  layers floor, back, under, main, front, over, sky\n",
    );
    // A neighbour on the other side of main in the diagram does not pull a layer across.
    const crossed = `diagram clipboard: free {\n  layers front, top, main\n  box t "T" { layer top }\n}\n`;
    expect(apply({ kind: "insertFragment", diagram: "d", fragment: crossed }, layered)).toContain(
      "  layers back, top, main, front\n",
    );
    // Layers the diagram has already are not added again.
    const known = apply(
      {
        kind: "insertFragment",
        diagram: "d",
        fragment: 'diagram clipboard: free {\n  box e "E" { layer back }\n}\n',
      },
      layered,
    );
    expect(known).toContain("  layers back, main, front\n");
  });

  it("inserts a fragment in its sections", () => {
    const fragment = `language "0.2"\ndiagram clipboard: flow {\n  layout manual\n  api_2["API"]\n  api_2 -> db as save_2\n  placement {\n    place api_2 at (128, 128)\n  }\n  style api_2 { fill accent }\n}\n`;
    const after = apply({ kind: "insertFragment", diagram: "d", fragment }, sheet);
    expect(after).toContain(
      '  api -> db: "save" as save\n  api_2["API"]\n  api_2 -> db as save_2\n  placement {',
    );
    expect(after).toContain("    place db at (400, 100)\n    place api_2 at (128, 128)\n");
    expect(after).toContain("  style api_2 { fill accent }\n}");
    expect(
      refused(
        { kind: "insertFragment", diagram: "d", fragment: fragment.replaceAll("api_2", "api") },
        sheet,
      ).code,
    ).toBe("edit.id-conflict");
  });
});

describe("moving declarations between groups", () => {
  const composition = `diagram s: free {
  group g "G" {
    box a "A"
  }
  // the cache
  box c "C" { description "Hot keys" } // keeps sessions
  a -> c as reads
  style c { fill "#eef" }
  placement {
    place g at (200, 150)
    size g (300, 200)
    place a at (60, 40)
    place c at (400, 300)
  }
}
`;
  const parentOf = (text: string, id: string) =>
    compile(text).document.diagrams[0]!.elementsById.get(id)!.groupPath.at(-1) ?? null;

  it("moves a declaration into a group with its comments and writes its place", () => {
    const after = apply(
      { kind: "moveElement", diagram: "s", element: "c", parent: "g", at: { x: 84, y: 60 } },
      composition,
    );
    expect(after).toBe(`diagram s: free {
  group g "G" {
    box a "A"
    // the cache
    box c "C" { description "Hot keys" } // keeps sessions
  }
  a -> c as reads
  style c { fill "#eef" }
  placement {
    place g at (200, 150)
    size g (300, 200)
    place a at (60, 40)
    place c at (84, 60)
  }
}
`);
    expect(parentOf(after, "c")).toBe("g");
  });

  it("moves a declaration out to the diagram body, after the last declaration there", () => {
    const flow = `diagram d: flow {
  group backend "Backend" {
    node api "API"
    db[("DB")]
  }
  client["Client"]
  api -> db
}
`;
    const after = apply({ kind: "moveElement", diagram: "d", element: "api", parent: null }, flow);
    expect(after).toBe(`diagram d: flow {
  group backend "Backend" {
    db[("DB")]
  }
  client["Client"]
  node api "API"
  api -> db
}
`);
    const model = compile(after).document.diagrams[0]!;
    expect(model.relations.map((r) => [r.from, r.to])).toEqual([["api", "db"]]);
    expect(parentOf(after, "api")).toBeNull();
  });

  it("moves a group with its children, re-indented, into a sibling group", () => {
    const nested = `diagram s: free {
  group outer "" {
    box x "X"
  }
  group inner "Inner" {
    box y "Y" {
      description "Two"
    }
    x -> y
  }
}
`;
    const after = apply(
      { kind: "moveElement", diagram: "s", element: "inner", parent: "outer" },
      nested,
    );
    expect(after).toBe(`diagram s: free {
  group outer "" {
    box x "X"
    group inner "Inner" {
      box y "Y" {
        description "Two"
      }
      x -> y
    }
  }
}
`);
    expect(compile(after).document.diagrams[0]!.elementsById.get("y")!.groupPath).toEqual([
      "outer",
      "inner",
    ]);
    // And back out to the top level.
    expect(
      apply({ kind: "moveElement", diagram: "s", element: "inner", parent: null }, after),
    ).toBe(nested);
  });

  it("goes after a group's own statements, opens an empty one-line block and joins a one-line one", () => {
    const text = `diagram s: free {
  group g "G" {
    description "Front"
  }
  group empty "" { }
  group short "S" { box z "Z" }
  box c "C" // note
}
`;
    expect(apply({ kind: "moveElement", diagram: "s", element: "c", parent: "g" }, text)).toContain(
      '  group g "G" {\n    description "Front"\n    box c "C" // note\n  }\n',
    );
    expect(
      apply({ kind: "moveElement", diagram: "s", element: "c", parent: "empty" }, text),
    ).toContain('  group empty "" {\n    box c "C" // note\n  }\n  group short');
    const result = plan({ kind: "moveElement", diagram: "s", element: "c", parent: "short" }, text);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(applyTextEdits(text, result.plan.edits)).toContain(
      '  group short "S" { box z "Z"; box c "C" }\n}\n',
    );
    expect(result.plan.notes).toEqual(["Removed the comment on line 7: // note"]);
  });

  it("moves a declaration that shares its line, and declares an implicit element", () => {
    const text = `diagram s: free {\n  group g "G" {\n    box a "A"\n  }\n  box b "B"; box c "C"\n  a -> x\n}\n`;
    expect(apply({ kind: "moveElement", diagram: "s", element: "c", parent: "g" }, text)).toBe(
      `diagram s: free {\n  group g "G" {\n    box a "A"\n    box c "C"\n  }\n  box b "B"\n  a -> x\n}\n`,
    );
    const declared = apply({ kind: "moveElement", diagram: "s", element: "x", parent: "g" }, text);
    expect(declared).toContain('    box a "A"\n    box x\n  }\n');
    expect(parentOf(declared, "x")).toBe("g");
  });

  it("keeps CRLF line ends", () => {
    const text =
      'diagram s: free {\r\n  group g "G" {\r\n    box a "A"\r\n  }\r\n  // c\r\n  box c "C" // note\r\n}\r\n';
    expect(apply({ kind: "moveElement", diagram: "s", element: "c", parent: "g" }, text)).toBe(
      'diagram s: free {\r\n  group g "G" {\r\n    box a "A"\r\n    // c\r\n    box c "C" // note\r\n  }\r\n}\r\n',
    );
  });

  it("moves the last statement of a body without placement and writes its place", () => {
    // The new placement block goes after the last statement, which is the one that moves.
    for (const layout of ["assisted", "manual", "auto"]) {
      const text = `diagram s: free {\n  layout ${layout}\n  group g "G" {\n    box a "A"\n  }\n  box c "C"\n}\n`;
      const after = apply(
        { kind: "moveElement", diagram: "s", element: "c", parent: "g", at: { x: 10, y: 20 } },
        text,
      );
      expect(after, layout).toBe(
        `diagram s: free {\n  layout ${layout === "auto" ? "assisted" : layout}\n  group g "G" {\n    box a "A"\n    box c "C"\n  }\n\n  placement {\n    place c at (10, 20)\n  }\n}\n`,
      );
      expect(parentOf(after, "c")).toBe("g");
    }
    const flow = `diagram d: flow {\n  group g "G" {\n    a["A"]\n  }\n  c["C"]\n}\n`;
    expect(
      apply(
        { kind: "moveElement", diagram: "d", element: "c", parent: "g", at: { x: 10, y: 20 } },
        flow,
      ),
    ).toBe(
      `diagram d: flow {\n  layout assisted\n  group g "G" {\n    a["A"]\n    c["C"]\n  }\n\n  placement {\n    place c at (10, 20)\n  }\n}\n`,
    );
    // A top-level group that is the last statement, into its sibling.
    const groups = `diagram s: free {\n  layout manual\n  group g "G" {\n    box a "A"\n  }\n  group h "H" {\n    box b "B"\n  }\n}\n`;
    const nested = apply(
      { kind: "moveElement", diagram: "s", element: "h", parent: "g", at: { x: 10, y: 20 } },
      groups,
    );
    expect(nested).toBe(
      `diagram s: free {\n  layout manual\n  group g "G" {\n    box a "A"\n    group h "H" {\n      box b "B"\n    }\n  }\n\n  placement {\n    place h at (10, 20)\n  }\n}\n`,
    );
    expect(compile(nested).document.diagrams[0]!.elementsById.get("b")!.groupPath).toEqual([
      "g",
      "h",
    ]);
  });

  it("moves a declaration with the comment after its `;`", () => {
    const text = `diagram s: free {\n  group g "G" {\n    box a "A"\n  }\n  box c "C"; // trailing\n  box d "D"\n}\n`;
    expect(apply({ kind: "moveElement", diagram: "s", element: "c", parent: "g" }, text)).toBe(
      `diagram s: free {\n  group g "G" {\n    box a "A"\n    box c "C"; // trailing\n  }\n  box d "D"\n}\n`,
    );
    // Into a block written on one line, the comment is left out and named in a note.
    const short = text.replace('group g "G" {\n    box a "A"\n  }', 'group g "G" { box a "A" }');
    const result = plan({ kind: "moveElement", diagram: "s", element: "c", parent: "g" }, short);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(applyTextEdits(short, result.plan.edits)).toBe(
      `diagram s: free {\n  group g "G" { box a "A"; box c "C" }\n  box d "D"\n}\n`,
    );
    expect(result.plan.notes).toEqual(["Removed the comment on line 3: // trailing"]);
  });

  it("writes only the place when the parent stays, and nothing without a place", () => {
    const same = plan(
      { kind: "moveElement", diagram: "s", element: "a", parent: "g" },
      composition,
    );
    expect(same.ok && same.plan.edits).toEqual([]);
    const placed = apply(
      { kind: "moveElement", diagram: "s", element: "a", parent: "g", at: { x: 70, y: 40 } },
      composition,
    );
    expect(placed).toBe(composition.replace("place a at (60, 40)", "place a at (70, 40)"));
  });

  it("refuses a group into itself or its own subtree, a non-group parent, sequences and C4 views", () => {
    const nested = `diagram s: free {\n  group outer "Outer" {\n    group inner "Inner" {\n      box a "A"\n    }\n  }\n  box b "B"\n}\n`;
    const cycle = refused(
      { kind: "moveElement", diagram: "s", element: "outer", parent: "inner" },
      nested,
    );
    expect(cycle.code).toBe("edit.unsafe-target");
    expect(cycle.reason).toBe("`outer` cannot be moved into `inner`, which is inside `outer`.");
    expect(
      refused({ kind: "moveElement", diagram: "s", element: "outer", parent: "outer" }, nested)
        .reason,
    ).toBe("`outer` cannot be moved into itself.");
    expect(
      refused({ kind: "moveElement", diagram: "s", element: "a", parent: "b" }, nested).code,
    ).toBe("edit.unsafe-target");
    const sequence = `diagram p: sequence {\n  group shop "Shop" {\n    participant api "API"\n  }\n  participant db "DB"\n  api -> db\n}\n`;
    const participant = refused(
      { kind: "moveElement", diagram: "p", element: "db", parent: "shop" },
      sequence,
    );
    expect(participant.code).toBe("edit.unsafe-target");
    expect(participant.reason).toMatch(/^Participants of sequence diagrams do not move/);
    const c4 = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const view = compile(c4).document.diagrams.find((d) => d.type === "c4")!;
    const viewRefusal = refused(
      { kind: "moveElement", diagram: view.id, element: view.elements[0]!.id, parent: null },
      c4,
    );
    expect(viewRefusal.code).toBe("edit.unsafe-target");
    expect(viewRefusal.reason).toMatch(/C4 view/);
  });
});

describe("creating diagrams", () => {
  it("turns an empty file into the header and an empty diagram", () => {
    expect(apply({ kind: "createDiagram", type: "flow" }, "")).toBe(
      'language "0.2"\n\ndiagram diagram1: flow {\n}\n',
    );
    // Blank lines left by emptying the file go too.
    expect(apply({ kind: "createDiagram", type: "free" }, "\n\n  \n")).toBe(
      'language "0.2"\n\ndiagram diagram1: free {\n}\n',
    );
  });

  it("appends the next free id after the last block, with its title", () => {
    const text = 'language "0.2"\n\ndiagram diagram1: flow { }\n';
    expect(apply({ kind: "createDiagram", type: "free", title: "Slide" }, text)).toBe(
      `${text}\ndiagram diagram2: free {\n  title "Slide"\n}\n`,
    );
  });

  it("skips the ids of models, themes, stories and imports", () => {
    const text = [
      'language "0.2"',
      "",
      "theme diagram1 {",
      '  extends "technical.light"',
      "}",
      "",
      "diagram overview: flow {",
      "  a -> b",
      "}",
      "",
      "story diagram2 for overview {",
      '  scene one "One" {',
      "    reveal a",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(compile(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const after = apply({ kind: "createDiagram", type: "sequence" }, text);
    expect(after).toBe(`${text}\ndiagram diagram3: sequence {\n}\n`);
  });

  it("writes the header first in a file without one", () => {
    const text = "// The checkout\ndiagram overview: flow {\n  a -> b\n}\n";
    expect(apply({ kind: "createDiagram", type: "sequence", id: "calls" }, text)).toBe(
      `language "0.2"\n\n${text}\ndiagram calls: sequence {\n}\n`,
    );
  });

  it("keeps a comment on the last line where it is, and the file's line endings", () => {
    const text = 'language "0.2"\r\n\r\ndiagram a: flow {\r\n  x -> y\r\n} // end\r\n';
    expect(apply({ kind: "createDiagram", type: "flow" }, text)).toBe(
      'language "0.2"\r\n\r\ndiagram a: flow {\r\n  x -> y\r\n} // end\r\n\r\ndiagram diagram1: flow {\r\n}\r\n',
    );
    // A last line without a newline gets one.
    expect(apply({ kind: "createDiagram", type: "free" }, 'language "0.2"')).toBe(
      'language "0.2"\n\ndiagram diagram1: free {\n}\n',
    );
    // A file of comments: the header before them, the diagram after them.
    expect(apply({ kind: "createDiagram", type: "flow" }, "// notes\n")).toBe(
      'language "0.2"\n\n// notes\n\ndiagram diagram1: flow {\n}\n',
    );
  });

  it("quotes the title as a string", () => {
    const after = apply(
      { kind: "createDiagram", type: "flow", title: 'Q3 "plan"' },
      'language "0.2"\n',
    );
    expect(after).toBe('language "0.2"\n\ndiagram diagram1: flow {\n  title "Q3 \\"plan\\""\n}\n');
    expect(compile(after).document.diagrams[0]!.properties.title).toBe('Q3 "plan"');
  });

  it("refuses a taken id, an id that is not one and other types", () => {
    const text = 'language "0.2"\n\ndiagram overview: flow {\n  a -> b\n}\n';
    const taken = refused({ kind: "createDiagram", type: "flow", id: "overview" }, text);
    expect(taken.code).toBe("edit.invalid-value");
    expect(taken.reason).toBe("`overview` is already used in this file; choose another id.");
    expect(refused({ kind: "createDiagram", type: "flow", id: "2nd" }, text).code).toBe(
      "edit.invalid-value",
    );
    const c4 = refused({ kind: "createDiagram", type: "c4" as "flow" }, text);
    expect(c4.code).toBe("edit.invalid-value");
    expect(c4.reason).toMatch(/^`c4` is not a type of diagram that can be created here/);
  });

  it("is undone by its inverse in one step", () => {
    const text = 'language "0.2"\n\ndiagram overview: flow {\n  a -> b\n}\n';
    const result = plan({ kind: "createDiagram", type: "free" }, text);
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(text, result.plan.edits);
    expect(compile(after).document.diagrams.map((d) => [d.id, d.type])).toEqual([
      ["overview", "flow"],
      ["diagram1", "free"],
    ]);
    expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  });
});
