import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  LANE_SPACING,
  anchorPoints,
  layoutDiagram,
  orthogonalize,
  type GroupItem,
  type LayoutEngine,
  type LayoutOptions,
  type PathItem,
  type PolylineItem,
  type RectItem,
  type Scene,
} from "../src/index.js";
import { crossedBoxes } from "../src/routing.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function run(body: string, options: LayoutOptions = {}, mode = "manual") {
  const compilation = compile(
    `${PLAIN}diagram d: flow {\n  layout ${mode}\n  theme "plain"\n${body}\n}\n`,
  );
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, options);
  return { ...result, codes: result.diagnostics.map((d) => d.code) };
}

function scene(body: string, options: LayoutOptions = {}, mode = "manual"): Scene {
  const result = run(body, options, mode);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

function item(s: Scene, id: string, role = "element"): GroupItem {
  const found = s.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id}`);
  return found;
}

const rect = (s: Scene, id: string) =>
  item(s, id).items.find((i): i is RectItem => i.kind === "rect")!;
const center = (s: Scene, id: string) => {
  const r = rect(s, id);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const line = (s: Scene, key: string) =>
  item(s, key, "relation").items.find((i): i is PolylineItem => i.kind === "polyline")!;
const overlaps = (a: RectItem, b: RectItem) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Boxes on a diagonal, 300 px right and 200 px down from each other. */
const diagonal: LayoutEngine = {
  name: "diagonal",
  arrange: (request) => ({
    centers: new Map(request.nodes.map((n, i) => [n.id, { x: 100 + i * 300, y: 100 + i * 200 }])),
    routes: new Map(),
  }),
};

const chain = '  client["Client"]\n  api["API"]\n  db["DB"]\n  client -> api\n  api -> db';

describe("layout modes", () => {
  it("needs an engine for unplaced elements in auto and assisted", () => {
    for (const mode of ["auto", "assisted"]) {
      const result = run(chain, {}, mode);
      expect(result.codes).toEqual(["layout.mode-unsupported"]);
      expect(result.scene).toBeNull();
    }
  });

  it("centres every box on the engine's position in auto", () => {
    const s = scene(chain, { engine: diagonal }, "auto");
    const [a, b, c] = ["client", "api", "db"].map((id) => center(s, id));
    expect([b!.x - a!.x, b!.y - a!.y, c!.x - b!.x, c!.y - b!.y]).toEqual([300, 200, 300, 200]);
    expect(line(s, "client->api#1").points.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores places and waypoints in auto and reports the first", () => {
    const result = run(
      `${chain.replace("client -> api", "client -> api as call")}\n  placement {\n    route call from client.east to api.west via [(5, 5)]\n    place api at (10, 10)\n  }`,
      { engine: diagonal },
      "auto",
    );
    expect(result.codes).toEqual(["layout.placement-ignored"]);
    expect(result.diagnostics[0]!.range.start.line).toBe(15); // the route, one-based
    const s = result.scene!;
    const [a, b] = ["client", "api"].map((id) => center(s, id));
    expect([b!.x - a!.x, b!.y - a!.y]).toEqual([300, 200]);
    // The written ports still apply.
    const points = line(s, "call").points;
    expect(points[0]!.x).toBeCloseTo(rect(s, "client").x + rect(s, "client").width);
  });

  it("follows the engine's routes in auto", () => {
    const routed: LayoutEngine = {
      name: "routed",
      arrange: (request) => {
        const [a, b] = request.nodes;
        return {
          centers: new Map([
            [a!.id, { x: 100, y: 100 }],
            [b!.id, { x: 500, y: 300 }],
          ]),
          routes: new Map([
            [
              request.edges[0]!.id,
              [
                { x: 100 + a!.width / 2, y: 100 },
                { x: 300, y: 100 },
                { x: 300, y: 300 },
                { x: 500 - b!.width / 2, y: 300 },
              ],
            ],
          ]),
        };
      },
    };
    const s = scene('  a["A"]\n  b["B"]\n  a -> b', { engine: routed }, "auto");
    const points = line(s, "a->b#1").points;
    expect(points).toHaveLength(4);
    expect(points[1]!.x - points[0]!.x).toBeCloseTo(300 - (100 + rect(s, "a").width / 2));
    expect(points[2]!.y - points[1]!.y).toBe(200);
  });

  it("keeps placed boxes exactly in assisted and clears the others", () => {
    const body =
      '  api["API"]\n  db["DB"]\n  cache["Cache"]\n  api -> cache\n  cache -> db\n  placement {\n    place api at (300, 200)\n    place db at (700, 200)\n  }';
    const s = scene(body, { engine: gridEngine }, "assisted");
    const [api, db] = ["api", "db"].map((id) => center(s, id));
    expect([db!.x - api!.x, db!.y - api!.y]).toEqual([400, 0]);
    expect(overlaps(rect(s, "cache"), rect(s, "api"))).toBe(false);
    expect(overlaps(rect(s, "cache"), rect(s, "db"))).toBe(false);

    const more = scene(
      body.replace("  placement", '  audit["Audit"]\n  db -> audit\n  placement'),
      { engine: gridEngine },
      "assisted",
    );
    const [api2, db2] = ["api", "db"].map((id) => center(more, id));
    expect([db2!.x - api2!.x, db2!.y - api2!.y]).toEqual([400, 0]);
    expect(overlaps(rect(more, "audit"), rect(more, "db"))).toBe(false);
  });

  it("pushes a free box out of a placed one along the direction", () => {
    // The grid puts `b` 240 px right of `a`; `c` is placed where `b` would land.
    const s = scene(
      '  a["A"]\n  b["B"]\n  c["C"]\n  a -> b\n  placement {\n    place a at (100, 100)\n    place c at (340, 100)\n  }',
      { engine: gridEngine },
      "assisted",
    );
    expect(overlaps(rect(s, "b"), rect(s, "c"))).toBe(false);
    expect(center(s, "b").x).toBeGreaterThan(center(s, "c").x);
  });

  it("reports an engine failure without a scene", () => {
    const failing: LayoutEngine = {
      name: "failing",
      arrange: () => {
        throw new Error("boom");
      },
    };
    const result = run(chain, { engine: failing }, "auto");
    expect(result.codes).toEqual(["layout.engine-failed"]);
    expect(result.diagnostics[0]!.message).toBe("The failing layout engine failed: boom");
    expect(result.scene).toBeNull();
  });

  it("passes groups, ports and relation kinds to the engine", () => {
    let seen: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (request) => {
        seen = request;
        return gridEngine.arrange(request);
      },
    };
    run(
      '  group back "Back" {\n    api["API"] {\n      port out east 25%\n    }\n  }\n  db["DB"]\n  api -> db as save\n  api --> db as warm\n  placement {\n    route save from api.out to db.west\n  }',
      { engine: spy },
      "auto",
    );
    expect(seen!.direction).toBe("LR");
    expect(seen!.groups.map((g) => [g.id, g.parent])).toEqual([["back", null]]);
    const api = seen!.nodes.find((n) => n.id === "api")!;
    expect(api.parent).toBe("back");
    expect(api.ports).toEqual([{ id: "out", side: "east", position: 0.25 }]);
    expect(seen!.nodes.find((n) => n.id === "db")!.ports).toEqual([
      { id: "west", side: "west", position: 0.5 },
    ]);
    expect(seen!.edges.map((e) => [e.id, e.sourcePort, e.targetPort, e.primary])).toEqual([
      ["save", "out", "west", true],
      ["warm", null, null, false],
    ]);
  });

  it("passes a sized group's size as its minimum and draws the engine's box", () => {
    let seen: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const engineBox = { x: 400, y: 20, width: 260, height: 210 };
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (request) => {
        seen = request;
        const arranged = gridEngine.arrange(request);
        const a = request.nodes.find((n) => n.id === "a")!;
        const centers = new Map(arranged.centers);
        centers.set(a.id, { x: 530, y: 125 });
        return { ...arranged, centers, groups: new Map([["g", engineBox]]) };
      },
    };
    const result = run(
      '  group g "" {\n    a["A"]\n  }\n  group h "" {\n    b["B"]\n  }\n  placement {\n    place g at (300, 200)\n    size g (238, 196)\n  }',
      { engine: spy },
      "auto",
    );
    expect(seen!.groups.map((g) => [g.id, g.minimum])).toEqual([
      ["g", { width: 238, height: 196 }],
      ["h", undefined],
    ]);
    expect(result.boxes!.get("g")).toEqual(engineBox);
  });

  it("grows a sized group to its size when the engine gives no box", () => {
    const result = run(
      '  group g "" {\n    a["A"]\n  }\n  placement {\n    size g (238, 196)\n  }',
      { engine: diagonal },
      "auto",
    );
    expect(result.codes).toEqual([]);
    const box = result.boxes!.get("g")!;
    const a = result.boxes!.get("a")!;
    expect([box.width, box.height]).toEqual([238, 196]);
    expect([box.x + box.width / 2, box.y + box.height / 2]).toEqual([
      a.x + a.width / 2,
      a.y + a.height / 2,
    ]);
  });

  it("keeps a band at its place in auto, out of the request, without a warning", () => {
    let seen: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (request) => {
        seen = request;
        return diagonal.arrange(request);
      },
    };
    const result = run(
      `  layers back, main\n${chain}\n  group band "" {\n    layer back\n  }\n  placement {\n    place band at (300, 200)\n    size band (500, 300)\n  }`,
      { engine: spy },
      "auto",
    );
    expect(result.codes).toEqual([]);
    expect(seen!.groups).toEqual([]);
    expect(result.boxes!.get("band")).toEqual({ x: 50, y: 50, width: 500, height: 300 });
  });

  it("keeps reporting a band nested in an arranged group in auto", () => {
    const result = run(
      '  group outer "Outer" {\n    a["A"]\n    group band ""\n  }\n  placement {\n    place band at (300, 200)\n    size band (500, 300)\n  }',
      { engine: diagonal },
      "auto",
    );
    expect(result.codes).toContain("layout.missing-placement");
    expect(result.scene).toBeNull();
  });
});

describe("named ports", () => {
  it("anchors a connector at the port's point", () => {
    const s = scene(
      '  api["API"]\n  bus["Bus"] {\n    port in west 25%\n  }\n  api -> bus as publish\n  placement {\n    place api at (100, 100)\n    place bus at (400, 100)\n    route publish from api.east to bus.in\n  }',
    );
    const bus = rect(s, "bus");
    const points = line(s, "publish").points;
    const last = points[points.length - 1]!;
    // The line stops at the arrowhead's base, just left of the port.
    expect(last.y).toBeCloseTo(bus.y + bus.height * 0.25);
    expect(last.x).toBeLessThan(bus.x);
    expect(points[0]!.x).toBeCloseTo(rect(s, "api").x + rect(s, "api").width);
  });
});

describe("ends pinned to a point of a side", () => {
  const sheet = (route: string) =>
    `  api["API"]\n  db["DB"]\n  api -> db as save\n  placement {\n    place api at (100, 100)\n    size api (120, 60)\n    place db at (340, 140)\n    size db (120, 60)\n    ${route}\n  }`;

  it("anchor at the middle of the sides, whatever the boxes' overlap", () => {
    const s = scene(sheet("route save from api.east 50% to db.west 50%"));
    const [api, db] = [rect(s, "api"), rect(s, "db")];
    const pinned = line(s, "save");
    expect(pinned.points[0]).toEqual({ x: api.x + api.width, y: api.y + api.height / 2 });
    const last = pinned.points[pinned.points.length - 1]!;
    // The line stops at the arrowhead's base, left of the side, at the side's middle.
    expect(last.y).toBeCloseTo(db.y + db.height / 2);
    expect(last.x).toBeLessThan(db.x);
    // Without positions, facing sides meet at the centre of their overlap.
    const free = scene(sheet("route save from api.east to db.west"));
    const overlap = (rect(free, "db").y + rect(free, "api").y + rect(free, "api").height) / 2;
    expect(line(free, "save").points[0]!.y).toBe(overlap);
  });

  it("keep their point when the route has bends, as named ports do", () => {
    const s = scene(sheet("route save from api.east 25% to db.west 75% via [(220, 40)]"));
    const api = rect(s, "api");
    const points = line(s, "save").points;
    expect(points[0]).toEqual({ x: api.x + api.width, y: api.y + api.height * 0.25 });
    const named = scene(
      sheet("route save from api.out to db.in via [(220, 40)]")
        .replace('api["API"]', 'api["API"] {\n    port out east 25%\n  }')
        .replace('db["DB"]', 'db["DB"] {\n    port in west 75%\n  }'),
    );
    expect(points).toEqual(line(named, "save").points);
  });

  it("give the engine a port at their point in auto mode", () => {
    let request: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (r) => {
        request = r;
        return gridEngine.arrange(r);
      },
    };
    run(
      '  api["API"]\n  db["DB"]\n  api -> db as save\n  placement {\n    route save from api.south 25% to db.north\n  }',
      { engine: spy },
      "auto",
    );
    const api = request!.nodes.find((n) => n.id === "api")!;
    expect(api.ports).toContainEqual({ id: "south@25", side: "south", position: 0.25 });
    const db = request!.nodes.find((n) => n.id === "db")!;
    expect(db.ports).toContainEqual({ id: "north", side: "north", position: 0.5 });
    expect(request!.edges[0]).toMatchObject({ sourcePort: "south@25", targetPort: "north" });
  });
});

describe("connectors around boxes with pinned ends", () => {
  // `client` above `db`, `api` to their left, and `client -> api` pinned to both south sides.
  const body = (layout: string) =>
    `  client["Client"]\n  api["API"]\n  db["DB"]\n  client -> api as request\n  placement {\n${layout}    route request from client.south to api.south\n  }`;
  const clear = (s: Scene) => {
    const points = line(s, "request").points;
    expect(crossedBoxes(points, [rect(s, "db")])).toEqual([]);
    const [client, api] = [rect(s, "client"), rect(s, "api")];
    expect(points[0]!.y).toBe(client.y + client.height);
    expect(points[1]!.x).toBe(points[0]!.x);
    const last = points[points.length - 1]!;
    // The line stops at the arrowhead's base, below api's south side.
    expect(last.x).toBe(points[points.length - 2]!.x);
    expect(last.y).toBeGreaterThan(api.y + api.height);
  };

  it("leave the engine's route that runs through a box", () => {
    const through: LayoutEngine = {
      name: "through",
      arrange: (request) => {
        const centers = new Map([
          ["client", { x: 500, y: 40 }],
          ["db", { x: 500, y: 160 }],
          ["api", { x: 100, y: 160 }],
        ]);
        const half = (id: string) => request.nodes.find((n) => n.id === id)!.height / 2;
        const route = [
          { x: 500, y: 40 + half("client") },
          { x: 500, y: 260 },
          { x: 100, y: 260 },
          { x: 100, y: 160 + half("api") },
        ];
        return { centers, routes: new Map([["request", route]]) };
      },
    };
    const result = run(body(""), { engine: through }, "auto");
    expect(result.codes).not.toContain("layout.connector-crossing");
    clear(result.scene!);
  });

  it("go around in a placed view too", () => {
    const placed =
      "    place client at (500, 40)\n    place db at (500, 160)\n    place api at (100, 160)\n";
    // Orthogonal: straight down out of client, which would run through db.
    clear(scene(`  routing orthogonal\n${body(placed)}`));
  });
});

describe("port elbows", () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 60 });
  const named = (side: "north" | "south" | "east" | "west", position = 0.5) => ({
    side,
    position,
  });
  const axisAligned = (points: readonly { x: number; y: number }[]) =>
    points.every((p, i) => i === 0 || p.x === points[i - 1]!.x || p.y === points[i - 1]!.y);

  it("turns once between perpendicular sides", () => {
    const { points } = anchorPoints(
      { box: box(0, 0), port: "east", named: null },
      { box: box(300, 200), port: "top", named: named("north") },
      [],
      0,
    );
    expect(points).toEqual([
      { x: 100, y: 30 },
      { x: 350, y: 30 },
      { x: 350, y: 200 },
    ]);
  });

  it("goes out through stubs when the target port faces away", () => {
    const { points, toSide } = anchorPoints(
      { box: box(300, 0), port: "east", named: null },
      { box: box(0, 200), port: "in", named: named("west", 0.25) },
      [],
      0,
    );
    expect(toSide).toBe("west");
    expect(points[0]).toEqual({ x: 400, y: 30 });
    expect(points[1]).toEqual({ x: 420, y: 30 });
    expect(points[points.length - 2]).toEqual({ x: -20, y: 215 });
    expect(points[points.length - 1]).toEqual({ x: 0, y: 215 });
    expect(axisAligned(points)).toBe(true);
  });
});

describe("constraints", () => {
  const free = '  a["A"]\n  b["B"]\n  c["C"]\n  a -> b\n  b -> c\n';

  it("moves free boxes until the constraint holds", () => {
    const s = scene(
      `${free}  placement {\n    place a at (100, 100)\n    distance a, b 200\n    order c, b\n  }`,
      { engine: gridEngine },
      "assisted",
    );
    const [a, b] = ["a", "b"].map((id) => rect(s, id));
    expect(b!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(200);
    expect(center(s, "c").x).toBeLessThan(center(s, "b").x);
  });

  it("aligns free boxes on a placed one", () => {
    const s = scene(
      `${free}  placement {\n    place a at (100, 100)\n    size b (160, 120)\n    align a, b top\n    column c, a\n  }`,
      { engine: gridEngine },
      "assisted",
    );
    expect(rect(s, "b").y).toBe(rect(s, "a").y);
    expect(center(s, "c").x).toBe(center(s, "a").x);
  });

  it("reports a conflict between placed boxes and still renders", () => {
    const result = run(
      '  a["A"]\n  b["B"]\n  placement {\n    place a at (100, 100)\n    place b at (400, 160)\n    row a, b\n  }',
    );
    expect(result.codes).toEqual(["layout.constraint-conflict"]);
    expect(result.diagnostics[0]!.severity).toBe("error");
    expect(result.diagnostics[0]!.message).toContain("60 px");
    expect(result.scene).not.toBeNull();
  });
});

describe("routing", () => {
  const pair = (routing: string) =>
    `  routing ${routing}\n  a["A"]\n  b["B"]\n  a -> b as go\n  placement {\n    place a at (100, 100)\n    place b at (500, 300)\n    route go from a.east to b.west via [(300, 160)]\n  }`;

  it("draws polylines through the waypoints", () => {
    const points = line(scene(pair("polyline")), "go").points;
    expect(points).toHaveLength(3);
  });

  it("makes orthogonal routes axis-aligned", () => {
    const points = line(scene(pair("orthogonal")), "go").points;
    for (let i = 1; i < points.length; i++) {
      const [p, q] = [points[i - 1]!, points[i]!];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
  });

  it("draws Bézier routes as a path leaving and entering along the sides", () => {
    const s = scene(pair("bezier"));
    const relation = item(s, "go", "relation");
    const curve = relation.items.find((i): i is PathItem => i.kind === "path" && i.fill === "none");
    expect(curve!.d).toMatch(/^M[\d.]+ [\d.]+C/);
    expect(relation.items.some((i) => i.kind === "polyline")).toBe(false);
    const [mx, my, c1x, c1y] = curve!.d.slice(1).split(/[ C]/).map(Number);
    // The first control point lies east of the start, level with it.
    expect(c1y).toBeCloseTo(my!);
    expect(c1x).toBeGreaterThan(mx!);
  });

  it("lets a relation style override the diagram routing", () => {
    const s = scene(`${pair("bezier")}\n  style go {\n    routing polyline\n  }`);
    expect(line(s, "go").points).toHaveLength(3);
  });

  it("inserts one elbow between points that differ on both axes", () => {
    expect(
      orthogonalize(
        [
          { x: 0, y: 0 },
          { x: 100, y: 50 },
          { x: 100, y: 200 },
        ],
        "east",
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 200 },
    ]);
  });

  it("enters the target side along its normal", () => {
    // Without waypoints: south to north, offset sideways, gives a Z through the middle.
    expect(
      orthogonalize(
        [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        "south",
        "north",
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]);
    // With a waypoint, the last segment drops onto the north side.
    expect(
      orthogonalize(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 100 },
        ],
        "east",
        "north",
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("spreads parallel relations into lanes", () => {
    const s = scene(
      '  a["A"]\n  b["B"]\n  a -> b as one\n  a -> b as two\n  b -> a as back\n  placement {\n    place a at (100, 100)\n    place b at (500, 100)\n  }',
    );
    const ys = ["one", "two", "back"].map((key) => line(s, key).points[0]!.y);
    expect(ys[1]! - ys[0]!).toBe(LANE_SPACING);
    expect(ys[2]! - ys[1]!).toBe(LANE_SPACING);
  });

  const intoOneSide = (extra = "") =>
    `  routing orthogonal\n  node1["N"]\n  db["DB"]\n  client["C"]\n  node1 -> client as left\n  db -> client as right\n  placement {\n    place node1 at (100, 40)\n    place db at (780, 56)\n    place client at (322, 280)\n${extra}  }`;

  it("spreads relations from different boxes that meet one side", () => {
    const result = run(intoOneSide());
    expect(result.codes).toEqual([]);
    const s = result.scene!;
    const client = rect(s, "client");
    const ends = ["left", "right"].map((key) => {
      const points = line(s, key).points;
      return points[points.length - 1]!;
    });
    // Both enter the north side (the line stops at the base of the head), the one from the left
    // box on the left, a lane apart.
    for (const end of ends) expect(client.y - end.y).toBeCloseTo(8, 0);
    expect(ends[1]!.x - ends[0]!.x).toBe(LANE_SPACING);
    expect((ends[0]!.x + ends[1]!.x) / 2).toBeCloseTo(client.x + client.width / 2, 5);
  });

  it("leaves an end pinned to a point of a side where it is", () => {
    const s = scene(intoOneSide("    route right from db to client.north 80%\n"));
    const client = rect(s, "client");
    const last = (key: string) => {
      const points = line(s, key).points;
      return points[points.length - 1]!;
    };
    expect(last("right").x).toBeCloseTo(client.x + client.width * 0.8, 5);
    // Alone among the free ends of the side, the other keeps the middle.
    expect(last("left").x).toBeCloseTo(client.x + client.width / 2, 5);
  });
});

describe("composition checks", () => {
  it("passes a clean sheet", () => {
    const result = run(
      '  a["A"]\n  b["B"]\n  a -> b: "call"\n  placement {\n    place a at (100, 100)\n    place b at (500, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
  });

  it("reports a box crossing the edge of its group", () => {
    const result = run(
      '  group g "G" {\n    a["A"]\n  }\n  placement {\n    place g at (300, 200)\n    size g (200, 160)\n    place a at (400, 200)\n  }',
    );
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.message).toBe("`a` crosses the edge of its group `g`.");
  });

  it("reports a box over a group that does not declare it", () => {
    const result = run(
      '  group g "G" {\n    a["A"]\n  }\n  b["B"]\n  placement {\n    place g at (300, 200)\n    size g (400, 300)\n    place a at (220, 220)\n    place b at (400, 260)\n  }',
    );
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.message).toBe(
      "`b` overlaps the group `g`, which does not declare it.",
    );
  });

  it("does not report a box stacked inside an earlier one, but a partial overlap", () => {
    const stack = (inner: string) =>
      `  outer[""]\n  middle[""]\n  inner[""]\n  placement {\n    place outer at (300, 200)\n    size outer (260, 240)\n    place middle at (300, 200)\n    size middle (210, 180)\n    place inner at ${inner}\n    size inner (150, 130)\n  }`;
    expect(run(stack("(300, 200)")).codes).toEqual([]);
    // `inner` sticks out of `middle` and `outer` on the right.
    const partial = run(stack("(400, 200)"));
    expect(partial.diagnostics.map((d) => d.data?.ids)).toEqual([
      ["outer", "inner"],
      ["middle", "inner"],
    ]);
  });

  it("reports a stack declared in the wrong order on the later box", () => {
    const result = run(
      '  inner[""]\n  outer[""]\n  placement {\n    place inner at (300, 200)\n    size inner (150, 130)\n    place outer at (300, 200)\n    size outer (260, 240)\n  }',
    );
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.message).toBe("`inner` and `outer` overlap.");
    expect(result.diagnostics[0]!.range.start.line).toBe(10); // `outer`, one-based
    // The hint tells that the order of the declarations, not the places, makes the stack.
    expect(result.diagnostics[0]!.hints).toEqual([
      "Declare `outer` before `inner` to draw a stack.",
    ]);
  });

  it("reports two boxes that coincide, which no order makes a stack", () => {
    const result = run(
      '  a["A"]\n  b["B"]\n  placement {\n    place a at (300, 200)\n    place b at (300, 200)\n  }',
    );
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.data?.ids).toEqual(["a", "b"]);
    expect(result.diagnostics[0]!.hints).toBeUndefined();
  });

  it("gives no stack hint to a partial overlap", () => {
    const result = run(
      '  a["A"]\n  b["B"]\n  placement {\n    place a at (100, 100)\n    place b at (180, 100)\n  }',
    );
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.hints).toBeUndefined();
  });

  it("does not check boxes and groups on different layers", () => {
    // `band` covers the right edge of `g`, which does not declare it, and `b -> c` runs through it.
    const body =
      '  layers back, main\n  group g "G" {\n    a["A"]\n  }\n  node band "" { layer back }\n  b["B"]\n  c["C"]\n  b -> c as call\n  style call { routing polyline }\n  placement {\n    place g at (300, 200)\n    size g (400, 300)\n    place a at (220, 220)\n    place band at (560, 200)\n    size band (200, 200)\n    place b at (560, 450)\n    place c at (560, -50)\n  }';
    expect(run(body).codes).toEqual([]);
    expect(
      run(body.replace(" { layer back }", "")).diagnostics.map((d) => [d.code, d.data?.ids]),
    ).toEqual([
      ["layout.overlap", ["band", "g"]],
      ["layout.connector-crossing", ["call", "band"]],
    ]);
  });

  it("does not report a connector crossing the box its ends are stacked inside", () => {
    const result = run(
      '  routing polyline\n  outer[""]\n  a["A"]\n  b["B"]\n  a -> b\n  placement {\n    place outer at (300, 200)\n    size outer (400, 200)\n    place a at (200, 200)\n    place b at (400, 200)\n  }',
    );
    expect(result.codes).toEqual([]);
  });

  it("keeps the top of an untitled group to half the padding", () => {
    // The group spans y 100..300; the node's top edge is 8 px below the group's.
    const body = (label: string) =>
      `  group g ${label} {\n    a["A"]\n  }\n  placement {\n    place g at (300, 200)\n    size g (400, 200)\n    place a at (300, 136)\n  }`;
    expect(run(body('""')).codes).toEqual([]);
    expect(run(body('"G"')).codes).toEqual(["layout.container-margin"]);
    expect(run(body('""').replace("(300, 136)", "(300, 132)")).codes).toEqual([
      "layout.container-margin",
    ]);
  });

  it("gives the engine the padding above the interior of an untitled group", () => {
    let seen: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (request) => {
        seen = request;
        return gridEngine.arrange(request);
      },
    };
    const result = run(
      '  group plain "" {\n    a["A"]\n  }\n  group titled "Titled" {\n    b["B"]\n  }\n  a -> b',
      { engine: spy },
      "auto",
    );
    expect(seen!.groups.map((g) => [g.id, g.padding])).toEqual([
      ["plain", { top: 16, right: 16, bottom: 16, left: 16 }],
      ["titled", { top: 40, right: 16, bottom: 16, left: 16 }],
    ]);
    // Drawn around its child with the padding on every side.
    const [plain, a] = ["plain", "a"].map((id) => result.boxes!.get(id)!);
    expect([a!.x - plain!.x, a!.y - plain!.y]).toEqual([16, 16]);
  });

  it("does not check the boxes of tags and notes, which sit on boxes as badges", () => {
    const result = run(
      '  a["A"]\n  tag t "T"\n  note n "N"\n  placement {\n    place a at (100, 100)\n    place t at (170, 76)\n    place n at (40, 124)\n  }',
    );
    expect(result.codes).toEqual([]);
  });
});
