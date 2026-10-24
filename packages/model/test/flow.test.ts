import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { compile, type FlowDiagram } from "../src/index.js";

function flow(body: string, header = 'language "0.2"\n') {
  const compilation = compile(`${header}diagram d: flow {\n${body}\n}\n`);
  const diagram = compilation.document.diagrams[0] as FlowDiagram;
  return { compilation, diagram, codes: compilation.diagnostics.map((d) => d.code) };
}

const checkoutPath = join(CORPUS_ROOT, "valid", "checkout.meltemi");

describe("compile a flow diagram", () => {
  it("compiles two boxes and an arrow", () => {
    const compilation = compile("diagram example: flow { A -> B }");
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    expect(diagram.elements.map((e) => [e.id, e.label, e.kind, e.implicit])).toEqual([
      ["A", "A", "node", true],
      ["B", "B", "node", true],
    ]);
    expect(diagram.relations.map((r) => [r.key, r.from, r.to, r.line])).toEqual([
      ["A->B#1", "A", "B", "solid"],
    ]);
  });

  it("does not touch the source", () => {
    const before = readFileSync(checkoutPath);
    const text = before.toString("utf8");
    const compilation = compile(text);
    expect(compilation.text).toBe(text);
    expect(compilation.ok).toBe(true);
    expect(Object.keys(compilation)).not.toContain("edits");
    expect(readFileSync(checkoutPath).equals(before)).toBe(true);
  });

  it("keeps elements and relations in source order", () => {
    const { diagram } = flow('  b -> a\n  c["C"]\n  a -> c');
    expect(diagram.elements.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });
});

describe("element declarations", () => {
  it("reads shorthand and typed declarations", () => {
    const { diagram, codes } = flow(
      '  db[("PostgreSQL")]\n  decision approved "Approved?"\n  node plain',
    );
    expect(codes).toEqual([]);
    const byId = diagram.elementsById;
    expect([byId.get("db")!.kind, byId.get("db")!.label]).toEqual(["data", "PostgreSQL"]);
    expect([byId.get("approved")!.kind, byId.get("approved")!.label]).toEqual([
      "decision",
      "Approved?",
    ]);
    expect(byId.get("plain")!.label).toBe("plain");
  });

  it("reports a duplicate id with the first declaration", () => {
    const compilation = compile(
      'language "0.2"\ndiagram d: flow {\n  api["API"]\n  orders["Orders"]\n  api -> orders\n  // later\n  node api "Gateway"\n}\n',
    );
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.duplicate-id");
    expect(d!.range.start.line).toBe(7);
    expect(d!.related?.[0]!.range.start.line).toBe(3);
  });

  it("reports an unknown element property with a hint", () => {
    const { compilation } = flow('  api["API"] {\n    colour "red"\n  }');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.range.start).toMatchObject({ line: 4, column: 5 });
    expect(d!.range.end.column).toBe(11);
    expect(d!.hints).toContain(
      "Element blocks accept `description`, `class`, `layer`, `link`, `url` and `port`.",
    );
  });

  it("reads descriptions and group paths", () => {
    const { diagram, codes } = flow(
      '  group backend "Backend" {\n    description "Server side"\n    api["API"] { description "Entry" }\n    group data { db[("DB")] }\n    api -> db\n  }',
    );
    expect(codes).toEqual([]);
    const byId = diagram.elementsById;
    expect(byId.get("backend")).toMatchObject({ kind: "group", description: "Server side" });
    expect(byId.get("api")).toMatchObject({ description: "Entry", groupPath: ["backend"] });
    expect(byId.get("db")!.groupPath).toEqual(["backend", "data"]);
    expect(diagram.relations[0]!.groupPath).toEqual(["backend"]);
  });

  it("rejects diagram-level statements inside groups", () => {
    const { compilation } = flow("  group g {\n    direction TB\n  }");
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(compilation.diagnostics[0]!.hints?.[0]).toMatch(/diagram level/);
  });

  it("hints at a declaration for a bare identifier", () => {
    const { compilation } = flow("  api");
    expect(compilation.diagnostics[0]!.code).toBe("prop.unknown");
    expect(compilation.diagnostics[0]!.hints?.[0]).toBe(
      'Declare an element with `api["Label"]` or `node api`.',
    );
  });
});

describe("relations", () => {
  it("keys named and anonymous relations", () => {
    const { diagram, codes } = flow(
      '  api -> orders: "Create" as create\n  orders -> db\n  orders -> db: "again"',
    );
    expect(codes).toEqual([]);
    expect(diagram.relations.map((r) => r.key)).toEqual(["create", "orders->db#1", "orders->db#2"]);
    expect(diagram.relations.map((r) => r.label)).toEqual(["Create", null, "again"]);
  });

  it("counts named relations when numbering parallel relations", () => {
    const text = readFileSync(join(CORPUS_ROOT, "valid", "edge", "parallel.meltemi"), "utf8");
    const diagram = compile(text).document.diagrams[0]!;
    expect(diagram.relations.map((r) => [r.key, r.line])).toEqual([
      ["orders->db#1", "solid"],
      ["orders->db#2", "solid"],
      ["audit", "solid"],
      ["db->orders#1", "dashed"],
      ["orders->orders#1", "solid"],
    ]);
  });

  it("reports qualified endpoints in flow diagrams", () => {
    const { compilation } = flow("  shop.api -> db");
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.unknown-element");
    expect(d!.range.start.column).toBe(3);
    expect(d!.range.end.column).toBe(11);
    expect(d!.hints?.[0]).toMatch(/[Qq]ualified references are not available in flow diagrams/);
  });

  it("reports a relation id that clashes with an element", () => {
    const { compilation } = flow('  api["API"]\n  client -> api: "HTTPS" as api');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.duplicate-id");
    expect(d!.range.start).toMatchObject({ line: 4, column: 29 });
  });

  it("records where the token puts heads: lines have none, two-way arrows both", () => {
    const { diagram, codes } = flow(
      "  api -- cache as link\n  api <--> db\n  api -> web\n  web --- db",
    );
    expect(codes).toEqual([]);
    expect(diagram.relations.map((r) => [r.key, r.line, r.heads, r.twoWay])).toEqual([
      ["link", "solid", "none", false],
      ["api->db#1", "dashed", "both", true],
      ["api->web#1", "solid", "end", false],
      ["web->db#1", "dashed", "none", false],
    ]);
  });

  it("keeps a written head on a line", () => {
    const { diagram, codes } = flow("  a -- b as l\n  style l { arrowhead circle }");
    expect(codes).toEqual([]);
    expect(diagram.relations[0]).toMatchObject({ key: "l", heads: "none", twoWay: false });
  });

  it("reports relation ids used as endpoints", () => {
    const { codes } = flow("  a -> b as r\n  r -> c");
    expect(codes).toEqual(["ref.unknown-element"]);
  });
});

describe("diagram properties", () => {
  it("reads valid properties", () => {
    const { diagram, codes } = flow(
      '  direction TB\n  layout assisted\n  theme "editorial.light"\n  title "T"',
    );
    expect(codes).toEqual([]);
    expect(diagram.properties).toEqual({
      direction: "TB",
      layout: "assisted",
      theme: "editorial.light",
      title: "T",
      description: null,
      preset: null,
      canvas: null,
      routing: "auto",
      layers: ["main"],
      autonumber: null,
    });
  });

  it("applies defaults", () => {
    const { diagram } = flow("  a -> b");
    expect([diagram.properties.direction, diagram.properties.layout]).toEqual(["LR", "auto"]);
  });

  it("lists allowed values for an invalid direction", () => {
    const { compilation } = flow("  direction UP");
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.invalid-value");
    expect(d!.range.start.column).toBe(13);
    expect(d!.message).toContain("LR, RL, TB, BT");
  });

  it("reports a property set twice", () => {
    const { compilation } = flow("  layout auto\n  layout manual");
    expect(compilation.diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([
      ["prop.duplicate", 4],
    ]);
  });
});

describe("placement", () => {
  it("reads the checkout placement", () => {
    const diagram = compile(readFileSync(checkoutPath, "utf8")).document.diagrams[0]!;
    expect(
      diagram.placement.map((p) => {
        const { range: _r, targetRange: _t, node: _n, ...rest } = p;
        return rest;
      }),
    ).toEqual([
      { statement: "place", target: "api", x: 360, y: 180 },
      { statement: "place", target: "orders", x: 700, y: 180 },
      {
        statement: "route",
        target: "create",
        from: { element: "api", port: "east", named: false, explicitPort: true },
        to: { element: "orders", port: "west", named: false, explicitPort: true },
        via: [{ x: 520, y: 180 }],
      },
      { statement: "label", target: "create", at: 50, offset: { x: 0, y: -16 } },
    ]);
  });

  it("reports a route on an unknown relation with a hint about anonymous relations", () => {
    const { compilation } = flow(
      '  orders -> db: "Persist"\n  placement {\n    route save from orders.east to db.west via []\n  }',
    );
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.unknown-relation");
    expect(d!.range.start).toMatchObject({ line: 5, column: 11 });
    expect(d!.hints?.[0]).toMatch(/as <id>/);
  });

  it("reports route endpoints that do not match the relation", () => {
    const { compilation } = flow(
      "  api -> orders as create\n  placement {\n    route create from orders.west to api.east\n  }",
    );
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("placement.route-mismatch");
    expect(d!.range.start.column).toBe(23);
  });

  it("reports an invalid port and an out-of-range percentage", () => {
    const { compilation } = flow(
      "  api -> orders as create\n  placement {\n    route create from api.left to orders.west via []\n    label create at 120% offset (0, 0)\n  }",
    );
    const found = compilation.diagnostics.map((d) => [
      d.code,
      compilation.text.slice(d.range.start.offset, d.range.end.offset),
    ]);
    expect(found).toEqual([
      ["placement.unknown-port", "left"],
      ["prop.invalid-value", "120%"],
    ]);
  });

  it("accepts implied ports, missing waypoints and missing offsets", () => {
    const { diagram, codes } = flow(
      "  a -> b as r\n  placement {\n    route r from a to b.west\n    label r at 25%\n    size a (120, 60)\n  }",
    );
    expect(codes).toEqual([]);
    expect(diagram.placement.map((p) => p.statement)).toEqual(["route", "label", "size"]);
    expect(diagram.placement[0]).toMatchObject({
      from: { element: "a", port: "auto", explicitPort: false },
      via: [],
    });
    expect(diagram.placement[1]).toMatchObject({ at: 25, offset: { x: 0, y: 0 } });
  });

  it("reports duplicate placement across blocks", () => {
    const { compilation } = flow(
      "  a -> b\n  placement {\n    place a at (1, 1)\n  }\n  placement {\n    place a at (2, 2)\n  }",
    );
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("placement.duplicate");
    expect(d!.range.start.line).toBe(8);
    expect(d!.related?.[0]!.range.start.line).toBe(5);
  });

  it("reports malformed placement statements", () => {
    const { codes } = flow(
      "  a -> b as r\n  placement {\n    place a (1, 2)\n    size a (0, 10)\n    place b at (1ms, 2)\n    a -> b\n    nudge a\n  }",
    );
    expect(codes).toEqual([
      "prop.invalid-value",
      "prop.invalid-value",
      "prop.invalid-value",
      "prop.unknown",
      "prop.unknown",
    ]);
  });
});

describe("style and animate", () => {
  it("reads style and animate blocks", () => {
    const { diagram, codes } = flow(
      '  client -> api as request\n  style api { icon "tabler:server" }\n  animate request { effect flow; duration 1200ms; repeat forever }',
    );
    expect(codes).toEqual([]);
    expect(diagram.styles[0]).toMatchObject({
      target: "api",
      targetKind: "element",
      properties: { icon: "tabler:server" },
    });
    expect(diagram.animations[0]).toMatchObject({
      target: "request",
      targetKind: "relation",
      effect: "flow",
      durationMs: 1200,
      repeat: "forever",
    });
  });

  it("converts seconds and reads repeat counts", () => {
    const { diagram } = flow("  a -> b\n  animate a { effect pulse; duration 1.2s; repeat 3 }");
    expect(diagram.animations[0]).toMatchObject({ durationMs: 1200, repeat: 3 });
  });

  it("asks for a unit on durations", () => {
    const { compilation } = flow(
      "  a -> b as r\n  animate r {\n    effect flow\n    duration 1200\n  }",
    );
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.invalid-value");
    expect(compilation.text.slice(d!.range.start.offset, d!.range.end.offset)).toBe("1200");
    expect(d!.hints?.[0]).toMatch(/`ms` or `s`/);
  });

  it("reports a style on an unknown target", () => {
    const { compilation } = flow('  a -> b\n  style gateway { fill "#fff" }');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.unknown-element");
    expect(compilation.text.slice(d!.range.start.offset, d!.range.end.offset)).toBe("gateway");
  });

  it("reports duplicate and unknown properties across style blocks", () => {
    const { codes } = flow(
      '  a -> b\n  style a { fill "#fff" }\n  style a { fill "#000"; shadow "x"; icon "bad" }',
    );
    expect(codes).toEqual(["prop.duplicate", "prop.unknown", "prop.invalid-value"]);
  });
});

describe("source map", () => {
  it("gives statement and identifier ranges", () => {
    const { diagram } = flow('  client["Cliente"]', 'language "0.2"\n\n');
    const client = diagram.elementsById.get("client")!;
    expect(client.range.start).toMatchObject({ line: 4, column: 3 });
    expect(client.idRange.start).toMatchObject({ line: 4, column: 3 });
    expect(client.idRange.end).toMatchObject({ line: 4, column: 9 });
  });

  it("gives implicit elements the range of their first use", () => {
    const { diagram } = flow("  A -> B\n  B -> C", "");
    const b = diagram.elementsById.get("B")!;
    expect(b.idRange.start).toMatchObject({ line: 2, column: 8 });
    expect(b.range).toEqual(b.idRange);
  });

  it("records references for every resolved identifier", () => {
    const diagram = compile(readFileSync(checkoutPath, "utf8")).document.diagrams[0]!;
    const apiRefs = diagram.references.filter((r) => r.target === "api").map((r) => r.role);
    expect(apiRefs.sort()).toEqual(
      [
        "declaration",
        "relation-endpoint",
        "relation-endpoint",
        "place",
        "route-endpoint",
        "style",
      ].sort(),
    );
  });
});

describe("profile gating and top level", () => {
  it("compiles export profiles before or after their diagram", () => {
    const compilation = compile(
      'language "0.2"\nexport deck for checkout {\n  format pdf\n}\ndiagram checkout: flow {\n  client -> api\n}\n',
    );
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.document.exports.map((e) => [e.id, e.target.kind, e.format])).toEqual([
      ["deck", "diagram", "pdf"],
    ]);
    expect(compilation.document.unsupported).toEqual([]);
  });

  it("lists the known profiles for an unknown one", () => {
    const compilation = compile("diagram x: mindmap { }\n");
    expect(compilation.diagnostics[0]!.code).toBe("profile.unknown");
    expect(compilation.diagnostics[0]!.message).toContain("flow, sequence, c4, free");
  });

  it("reports unsupported versions", () => {
    const compilation = compile('language "0.3"\ndiagram d: flow { a -> b }\n');
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["language.unsupported-version"]);
    expect(compilation.document.language).toBe("0.3");
  });

  it("reports duplicate top-level ids", () => {
    const compilation = compile("diagram d: flow { a -> b }\ndiagram d: flow { c -> d }\n");
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["ref.duplicate-id"]);
    expect(compilation.document.diagrams.map((d) => d.hasErrors)).toEqual([false, true]);
  });

  it("isolates errors per diagram", () => {
    const compilation = compile(
      "diagram a: flow {\n  x -> y\n  place\n}\ndiagram b: flow {\n  p -> q\n}\n",
    );
    expect(compilation.document.diagrams.map((d) => [d.id, d.hasErrors])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("marks diagrams with syntax errors", () => {
    const compilation = compile('diagram a: flow {\n  x -> y\n  api["unterminated\n}\n');
    expect(compilation.document.diagrams[0]).toMatchObject({
      hasSyntaxErrors: true,
      hasErrors: true,
    });
    expect(compilation.document.diagrams[0]!.relations).toHaveLength(1);
  });
});
