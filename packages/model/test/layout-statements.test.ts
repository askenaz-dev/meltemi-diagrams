import { describe, expect, it } from "vitest";
import { compile, toJson, type FlowDiagram, type RouteEntry } from "../src/index.js";

function flow(body: string) {
  const compilation = compile(`language "0.2"\ndiagram d: flow {\n${body}\n}\n`);
  const diagram = compilation.document.diagrams[0] as FlowDiagram;
  return { compilation, diagram, codes: compilation.diagnostics.map((d) => d.code) };
}

const routes = (diagram: FlowDiagram) =>
  diagram.placement.filter((p): p is RouteEntry => p.statement === "route");

describe("named ports", () => {
  it("reads ports with their side and position", () => {
    const { diagram, codes } = flow(
      '  bus["Event bus"] {\n    port in west\n    port out east 30%\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("bus")!.ports.map((p) => [p.name, p.side, p.position])).toEqual(
      [
        ["in", "west", 0.5],
        ["out", "east", 0.3],
      ],
    );
  });

  it("resolves routes to named and compass ports", () => {
    const { diagram, codes } = flow(
      '  api["API"]\n  bus["Bus"] {\n    port in west 20%\n  }\n  api -> bus as publish\n  placement {\n    route publish from api.east to bus.in\n  }',
    );
    expect(codes).toEqual([]);
    const [route] = routes(diagram);
    expect(route!.from).toEqual({ element: "api", port: "east", named: false, explicitPort: true });
    expect(route!.to).toEqual({ element: "bus", port: "in", named: true, explicitPort: true });
  });

  it("reads a point of a compass side after a route end", () => {
    const { compilation, diagram, codes } = flow(
      '  api["API"]\n  db["DB"]\n  api -> db as save\n  placement {\n    route save from api.east 50% to db.north 25% via [(10, 20)]\n  }',
    );
    expect(codes).toEqual([]);
    const [route] = routes(diagram);
    expect(route!.from).toEqual({
      element: "api",
      port: "east",
      named: false,
      explicitPort: true,
      position: 0.5,
    });
    expect(route!.to.position).toBe(0.25);
    expect(route!.via).toEqual([{ x: 10, y: 20 }]);
    const json = toJson(compilation).diagrams[0]!.placement.find((p) => p.statement === "route");
    expect(json).toMatchObject({
      from: { element: "api", port: "east", position: 50 },
      to: { element: "db", port: "north", position: 25 },
    });
  });

  it("refuses a point after anything but a compass side, or outside 0..100", () => {
    const sheet = (route: string) =>
      flow(
        `  api["API"]\n  db["DB"] {\n    port in west\n  }\n  api -> db as save\n  placement {\n    ${route}\n  }`,
      );
    for (const route of [
      "route save from api 50% to db.west",
      "route save from api.auto 50% to db.west",
      "route save from api.east to db.in 30%",
      "route save from api.east 120% to db.west",
      "route save from api.east 5 to db.west",
    ]) {
      expect(sheet(route).codes, route).toEqual(["prop.invalid-value"]);
    }
    expect(sheet("route save from api 50% to db.west").compilation.diagnostics[0]!.message).toBe(
      "A position goes after a compass side, such as `api.east 50%`; `api` is not one.",
    );
  });

  it("reports an unknown port and lists the element's ports", () => {
    const { compilation, codes } = flow(
      '  api["API"]\n  bus["Bus"] {\n    port in west\n  }\n  api -> bus as publish\n  placement {\n    route publish from api.east to bus.inbox\n  }',
    );
    expect(codes).toEqual(["placement.unknown-port"]);
    expect(compilation.diagnostics[0]!.hints).toEqual([
      "Ports of `bus`: in, north, south, east, west, auto.",
    ]);
  });

  it("reports duplicate, built-in and malformed ports", () => {
    const duplicate = flow('  bus["Bus"] {\n    port in west\n    port in east\n  }');
    expect(duplicate.codes).toEqual(["ref.duplicate-id"]);
    expect(duplicate.compilation.diagnostics[0]!.related).toHaveLength(1);
    expect(flow('  bus["Bus"] {\n    port east west\n  }').codes).toEqual(["prop.invalid-value"]);
    expect(flow('  bus["Bus"] {\n    port in up\n  }').codes).toEqual(["prop.invalid-value"]);
    expect(flow('  bus["Bus"] {\n    port in west 120%\n  }').codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(flow('  bus["Bus"] {\n    port in west 30\n  }').codes).toEqual(["prop.invalid-value"]);
  });

  it("serialises ports", () => {
    const { compilation } = flow('  bus["Bus"] {\n    port out south 25%\n  }');
    const json = toJson(compilation);
    expect(json.diagrams[0]!.elements[0]!.ports).toEqual([
      expect.objectContaining({ name: "out", side: "south", position: 0.25 }),
    ]);
  });
});

describe("layout constraints", () => {
  const boxes = '  a["A"]\n  b["B"]\n  c["C"]\n';

  it("reads every constraint form", () => {
    const { diagram, codes } = flow(
      `${boxes}  placement {\n    align a, b, c top\n    row a, b\n    column b, c\n    order c, a, b vertical\n    order a, b\n    distance a, c 80\n  }`,
    );
    expect(codes).toEqual([]);
    expect(
      diagram.constraints.map((c) => [c.kind, c.targets.join(","), c.edge, c.axis, c.distance]),
    ).toEqual([
      ["align", "a,b,c", "top", null, null],
      ["row", "a,b", "middle", null, null],
      ["column", "b,c", "center", null, null],
      ["order", "c,a,b", null, "vertical", null],
      ["order", "a,b", null, null, null],
      ["distance", "a,c", null, null, 80],
    ]);
    expect(diagram.references.filter((r) => r.role === "constraint")).toHaveLength(14);
  });

  it("treats an element named like an axis as a target", () => {
    const { diagram, codes } = flow(
      '  a["A"]\n  vertical["V"]\n  placement {\n    order a, vertical\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.constraints[0]!.targets).toEqual(["a", "vertical"]);
    expect(diagram.constraints[0]!.axis).toBeNull();
  });

  it("reports unknown, repeated and group targets", () => {
    expect(flow(`${boxes}  placement {\n    row a, ghost\n  }`).codes).toEqual([
      "ref.unknown-element",
    ]);
    expect(flow(`${boxes}  placement {\n    row a, a\n  }`).codes).toEqual(["prop.invalid-value"]);
    expect(
      flow('  group g "G" {\n    a["A"]\n  }\n  b["B"]\n  placement {\n    row g, b\n  }').codes,
    ).toEqual(["prop.invalid-value"]);
  });

  it("reports too few targets and bad values", () => {
    expect(flow(`${boxes}  placement {\n    row a\n  }`).codes).toEqual(["prop.invalid-value"]);
    expect(flow(`${boxes}  placement {\n    distance a, b, c 40\n  }`).codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(flow(`${boxes}  placement {\n    align a, b diagonal\n  }`).codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(flow(`${boxes}  placement {\n    distance a, b 0\n  }`).codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(flow(`${boxes}  placement {\n    distance a, b 40%\n  }`).codes).toEqual([
      "prop.invalid-value",
    ]);
  });

  it("serialises constraints", () => {
    const { compilation } = flow(`${boxes}  placement {\n    distance a, b 40px\n  }`);
    const json = toJson(compilation);
    expect(json.diagrams[0]!.constraints).toEqual([
      expect.objectContaining({ kind: "distance", targets: ["a", "b"], distance: 40 }),
    ]);
  });
});

describe("routing", () => {
  it("reads the diagram property and defaults to auto", () => {
    expect(flow("  a -> b").diagram.properties.routing).toBe("auto");
    expect(flow("  routing bezier\n  a -> b").diagram.properties.routing).toBe("bezier");
    expect(flow("  routing curved\n  a -> b").codes).toEqual(["prop.invalid-value"]);
  });

  it("accepts routing as a relation style only", () => {
    const relation = flow("  a -> b as call\n  style call {\n    routing polyline\n  }");
    expect(relation.codes).toEqual([]);
    expect(relation.diagram.styles[0]!.properties).toMatchObject({ routing: "polyline" });
    expect(flow("  a -> b\n  style a {\n    routing polyline\n  }").codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(flow("  a -> b as call\n  style call {\n    routing zigzag\n  }").codes).toEqual([
      "prop.invalid-value",
    ]);
  });
});
