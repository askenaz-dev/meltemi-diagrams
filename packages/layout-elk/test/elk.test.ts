import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { compile } from "@meltemi/diagrams-model";
import {
  layoutDiagram,
  type ArrangeRequest,
  type GroupItem,
  type PolylineItem,
  type RectItem,
  type Scene,
} from "@meltemi/diagrams-layout";
import { ELK_VERSION, createElkEngine, elkGraph, loadElkWorkerFile } from "../src/index.js";

const engine = createElkEngine();

const node = (id: string, parent: string | null = null) => ({
  id,
  width: 160,
  height: 56,
  kind: "node",
  parent,
  fixed: null,
  ports: [],
});
const edge = (id: string, source: string, target: string, primary = true) => ({
  id,
  source,
  target,
  sourcePort: null,
  targetPort: null,
  primary,
});
const request = (
  direction: ArrangeRequest["direction"],
  extra: Partial<ArrangeRequest> = {},
): ArrangeRequest => ({
  direction,
  nodes: [node("a"), node("b"), node("c")],
  groups: [],
  edges: [edge("ab", "a", "b"), edge("bc", "b", "c")],
  spacing: { node: 40, layer: 70, edge: 16 },
  ...extra,
});

describe("ELK engine", () => {
  it("is the pinned version", () => {
    expect(ELK_VERSION).toBe("0.12.0");
  });

  it("arranges a chain left to right with edges starting on their boxes", () => {
    const { centers, routes } = engine.arrange(request("LR"));
    const [a, b, c] = ["a", "b", "c"].map((id) => centers.get(id)!);
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
    const ab = routes.get("ab")!;
    expect(ab[0]!.x).toBeCloseTo(a!.x + 80, 0);
    expect(ab[ab.length - 1]!.x).toBeCloseTo(b!.x - 80, 0);
  });

  it("follows the direction", () => {
    const { centers } = engine.arrange(request("TB"));
    expect(centers.get("a")!.y).toBeLessThan(centers.get("b")!.y);
    expect(centers.get("b")!.y).toBeLessThan(centers.get("c")!.y);
    const up = engine.arrange(request("BT")).centers;
    expect(up.get("a")!.y).toBeGreaterThan(up.get("c")!.y);
  });

  it("keeps group children inside their group", () => {
    const result = engine.arrange(
      request("LR", {
        nodes: [node("a", "g"), node("b", "g"), node("c")],
        groups: [{ id: "g", parent: null, padding: { top: 40, right: 16, bottom: 16, left: 16 } }],
        edges: [edge("ab", "a", "b"), edge("bc", "b", "c")],
      }),
    );
    const graph = elkGraph(
      request("LR", {
        nodes: [node("a", "g"), node("b", "g")],
        groups: [{ id: "g", parent: null, padding: { top: 40, right: 16, bottom: 16, left: 16 } }],
      }),
    );
    expect(graph.children!.map((c) => c.id)).toEqual(["g"]);
    const a = result.centers.get("a")!;
    const b = result.centers.get("b")!;
    const c = result.centers.get("c")!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(c.x).toBeGreaterThan(Math.max(a.x, b.x));
  });

  it("gives a container its minimum size, its child centred, clear of its neighbours", () => {
    const padding = { top: 16, right: 16, bottom: 16, left: 16 };
    const db = { ...node("db", "g"), height: 64 };
    const arrange = (minimum?: { width: number; height: number }) =>
      engine.arrange(
        request("LR", {
          nodes: [node("a"), db, node("c")],
          groups: [{ id: "g", parent: null, padding, ...(minimum ? { minimum } : {}) }],
          edges: [edge("in", "a", "db"), edge("out", "db", "c")],
        }),
      );
    const sized = arrange({ width: 238, height: 196 });
    const box = sized.groups!.get("g")!;
    expect(box.width).toBeGreaterThanOrEqual(238);
    expect(box.height).toBeGreaterThanOrEqual(196);
    const centre = sized.centers.get("db")!;
    expect(Math.abs(centre.x - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.y - (box.y + box.height / 2))).toBeLessThanOrEqual(1);
    for (const id of ["a", "c"]) {
      const c = sized.centers.get(id)!;
      const clear = c.x + 80 <= box.x || c.x - 80 >= box.x + box.width;
      expect(clear).toBe(true);
    }
    const fitted = arrange().groups!.get("g")!;
    expect([fitted.width, fitted.height]).toEqual([160 + 32, 64 + 32]);
  });

  it("uses ports at their side", () => {
    const result = engine.arrange(
      request("LR", {
        nodes: [
          { ...node("a"), ports: [{ id: "out", side: "south", position: 0.5 }] },
          node("b"),
          node("c"),
        ],
        edges: [{ ...edge("ab", "a", "b"), sourcePort: "out" }],
      }),
    );
    const a = result.centers.get("a")!;
    const start = result.routes.get("ab")![0]!;
    expect(start.y).toBeGreaterThanOrEqual(a.y + 28 - 1);
  });

  it("keeps a chain straight when some boxes have ports", () => {
    // `b` has fixed ports for one relation; the other enters it in the middle of its west side.
    const result = engine.arrange(
      request("LR", {
        nodes: [
          node("a"),
          { ...node("b"), ports: [{ id: "east", side: "east", position: 0.5 }] },
          node("c"),
        ],
        edges: [edge("ab", "a", "b"), { ...edge("bc", "b", "c"), sourcePort: "east" }],
      }),
    );
    const ys = ["a", "b", "c"].map((id) => result.centers.get(id)!.y);
    expect(new Set(ys).size).toBe(1);
    const ab = result.routes.get("ab")!;
    expect(ab[ab.length - 1]!.y).toBeCloseTo(ys[1]!, 0);
  });

  it("is deterministic and keeps the order when an unrelated node is added", () => {
    const first = engine.arrange(request("LR"));
    expect(engine.arrange(request("LR"))).toEqual(first);
    const more = engine.arrange(
      request("LR", { nodes: [node("a"), node("b"), node("c"), node("z")] }),
    );
    const xs = ["a", "b", "c"].map((id) => more.centers.get(id)!.x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
  });

  it("throws ELK's message on broken graphs", () => {
    expect(() => engine.arrange(request("LR", { edges: [edge("ax", "a", "missing")] }))).toThrow(
      /missing|Referenced/i,
    );
  });
});

describe("layout with ELK", () => {
  const text = `diagram d: flow {\n  direction LR\n  client["Client"]\n  api["API"]\n  orders["Orders"]\n  db[("DB")]\n  client -> api: "HTTPS"\n  api -> orders\n  orders -> db\n}\n`;

  function scene(source: string): { scene: Scene; codes: string[] } {
    const compilation = compile(source);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    return { scene: result.scene!, codes: result.diagnostics.map((d) => d.code) };
  }
  const groupOf = (s: Scene, id: string) =>
    s.items.find((i): i is GroupItem => i.kind === "group" && i.id === id)!;
  const rect = (s: Scene, id: string) =>
    groupOf(s, id).items.find((i): i is RectItem => i.kind === "rect");

  it("arranges an auto diagram left to right without overlaps", () => {
    const { scene: s, codes } = scene(text);
    expect(codes).toEqual([]);
    const client = rect(s, "client")!;
    const api = rect(s, "api")!;
    const orders = rect(s, "orders")!;
    expect(client.x + client.width).toBeLessThan(api.x);
    expect(api.x + api.width).toBeLessThan(orders.x);
    const relation = s.items.find(
      (i): i is GroupItem =>
        i.kind === "group" && i.role === "relation" && i.id.startsWith("client->api"),
    )!;
    const line = relation.items.find((i): i is PolylineItem => i.kind === "polyline")!;
    expect(line.points[0]!.x).toBeCloseTo(client.x + client.width, 0);
  });

  it("is stable across runs", () => {
    expect(scene(text).scene).toEqual(scene(text).scene);
  });

  it("routes from a side of a group, ending on the group's border", () => {
    const source = `diagram d: flow {\n  group api "API" {\n    node server\n  }\n  node fn\n  api -> fn as calls\n  placement {\n    route calls from api.east to fn.west\n  }\n}\n`;
    const graph = elkGraph({
      direction: "LR",
      nodes: [node("server", "api"), node("fn")],
      groups: [{ id: "api", parent: null, padding: { top: 40, left: 16, bottom: 16, right: 16 } }],
      edges: [{ ...edge("calls", "api", "fn"), sourcePort: "east" }],
      spacing: { node: 40, layer: 70, edge: 16 },
    });
    const group = graph.children!.find((c) => c.id === "api")!;
    expect(group.ports?.map((p) => p.layoutOptions?.["elk.port.side"])).toEqual(["EAST"]);
    const { scene: s, codes } = scene(source);
    expect(codes).toEqual([]);
    const box = rect(s, "api")!;
    const relation = s.items.find(
      (i): i is GroupItem => i.kind === "group" && i.role === "relation" && i.id === "calls",
    )!;
    const line = relation.items.find((i): i is PolylineItem => i.kind === "polyline")!;
    expect(line.points[0]!.x).toBeCloseTo(box.x + box.width, 0);
  });

  it("keeps placed boxes in assisted mode and arranges the others clear of them", () => {
    const assisted = text.replace(
      "direction LR",
      "direction LR\n  layout assisted\n  placement { place api at (300, 200); place orders at (900, 200) }",
    );
    const { scene: s, codes } = scene(assisted);
    expect(codes).toEqual([]);
    const center = (r: RectItem) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    const api = center(rect(s, "api")!);
    const orders = center(rect(s, "orders")!);
    expect([orders.x - api.x, orders.y - api.y]).toEqual([600, 0]);
    const client = rect(s, "client")!;
    const apiRect = rect(s, "api")!;
    const overlaps = (a: RectItem, b: RectItem) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps(client, apiRect)).toBe(false);
  });

  it("keeps a band where it is written in an automatic diagram", () => {
    const banded = text.replace(
      "direction LR",
      'direction LR\n  layers back, main\n  group band "" { layer back }\n  placement { place band at (300, 200); size band (500, 300) }',
    );
    const compilation = compile(banded);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    expect(result.diagnostics.map((d) => d.code)).toEqual([]);
    expect(result.boxes!.get("band")).toEqual({ x: 50, y: 50, width: 500, height: 300 });
    const plain = layoutDiagram(compile(text), compile(text).document.diagrams[0]!, { engine });
    for (const id of ["client", "api", "orders", "db"]) {
      expect(result.boxes!.get(id)).toEqual(plain.boxes!.get(id));
    }
  });

  it("draws a sized container at least its size in an automatic diagram", () => {
    const source = `diagram d: flow {\n  client["Client"]\n  group node3 "" {\n    db[("Database")]\n  }\n  client -> db\n  placement {\n    place node3 at (770, 68)\n    size node3 (238, 196)\n  }\n}\n`;
    const compilation = compile(source);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    expect(result.diagnostics.map((d) => d.code)).toEqual(["layout.placement-ignored"]);
    const box = result.boxes!.get("node3")!;
    expect(box.width).toBeGreaterThanOrEqual(238);
    expect(box.height).toBeGreaterThanOrEqual(196);
    const db = result.boxes!.get("db")!;
    expect(Math.abs(db.x + db.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(db.y + db.height / 2 - (box.y + box.height / 2))).toBeLessThanOrEqual(1);
    const unsized = source.replace("    size node3 (238, 196)\n", "");
    const fitted = layoutDiagram(compile(unsized), compile(unsized).document.diagrams[0]!, {
      engine,
    });
    const fittedBox = fitted.boxes!.get("node3")!;
    const fittedDb = fitted.boxes!.get("db")!;
    expect([fittedBox.width, fittedBox.height]).toEqual([
      fittedDb.width + 32,
      fittedDb.height + 32,
    ]);
  });

  it("arranges an automatic free diagram left to right without overlaps", () => {
    const free = `diagram slide: free {\n  layout auto\n  box a "Ingest"\n  box b "Process"\n  box c "Publish"\n  group g "Workers" {\n    text note "Scaled out"\n  }\n  a -> b\n  b -> c\n}\n`;
    const compilation = compile(free);
    expect(compilation.diagnostics).toEqual([]);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    expect(result.diagnostics.map((d) => d.code)).toEqual([]);
    const [a, b, c] = ["a", "b", "c"].map((id) => result.boxes!.get(id)!);
    expect(a!.x + a!.width).toBeLessThan(b!.x);
    expect(b!.x + b!.width).toBeLessThan(c!.x);
    const g = result.boxes!.get("g")!;
    expect(result.origins!.get("note")).toEqual({ x: g.x + 16, y: g.y + 40 });
  });
});

describe("editor geometry and bundled workers", () => {
  it("reports an offset, boxes and connectors that agree with the scene", () => {
    const text = readFileSync(join(REPO_ROOT, "corpus", "valid", "checkout.meltemi"), "utf8");
    const compilation = compile(text);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    const s = result.scene!;
    const offset = result.offset!;
    for (const [id, box] of result.boxes!) {
      const group = s.items.find(
        (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === "element",
      );
      const drawn = group?.items.find((i): i is RectItem => i.kind === "rect");
      if (!drawn) continue; // data stores are paths
      expect([drawn.x, drawn.y]).toEqual([box.x + offset.x, box.y + offset.y]);
    }
    for (const [key, connector] of result.connectors!) {
      const relation = s.items.find(
        (i): i is GroupItem => i.kind === "group" && i.role === "relation" && i.id === key,
      )!;
      const line = relation.items.find((i): i is PolylineItem => i.kind === "polyline")!;
      expect(line.points[0]!.x).toBeCloseTo(connector.points[0]!.x + offset.x, 1);
      expect(line.points[0]!.y).toBeCloseTo(connector.points[0]!.y + offset.y, 1);
    }
    expect([...result.labels!.keys()]).toEqual(["request", "create", "save"]);
  });

  it("loads the worker in hosts that define self, such as the VS Code extension host", () => {
    const global = globalThis as { self?: unknown };
    const had = "self" in global;
    const saved = global.self;
    global.self = { postMessage: () => undefined };
    try {
      const require = createRequire(import.meta.url);
      const path = require.resolve("elkjs/lib/elk-worker.min.js");
      const hosted = createElkEngine({ loadWorker: () => loadElkWorkerFile(path) });
      expect(hosted.arrange(request("LR"))).toEqual(engine.arrange(request("LR")));
      expect(createElkEngine().arrange(request("TB"))).toEqual(engine.arrange(request("TB")));
      expect((global.self as { onmessage?: unknown }).onmessage).toBeUndefined();
    } finally {
      if (had) global.self = saved;
      else delete global.self;
    }
  });

  it("loads a copied worker through the loader option", () => {
    const folder = mkdtempSync(join(tmpdir(), "elk-worker-"));
    try {
      const require = createRequire(import.meta.url);
      const original = require.resolve("elkjs/lib/elk-worker.min.js");
      const copy = join(folder, "elk-worker.min.js");
      copyFileSync(original, copy);
      const bundled = createElkEngine({ loadWorker: () => require(copy) });
      expect(bundled.arrange(request("LR"))).toEqual(engine.arrange(request("LR")));
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("bundles for browsers with no Node module, given the worker", async () => {
    const folder = mkdtempSync(join(tmpdir(), "elk-browser-"));
    try {
      const result = await build({
        entryPoints: [join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts")],
        bundle: true,
        platform: "browser",
        format: "esm",
        write: false,
        conditions: ["@meltemi/diagrams-source"],
        logLevel: "silent",
      });
      const code = result.outputFiles[0]!.text;
      expect(code).not.toMatch(/(?:from|import\(|require\()\s*["']node:/);
      const file = join(folder, "elk.mjs");
      writeFileSync(file, code);
      const bundle = (await import(pathToFileURL(file).href)) as typeof import("../src/index.js");
      const require = createRequire(import.meta.url);
      const browser = bundle.createElkEngine({
        loadWorker: () => require("elkjs/lib/elk-worker.min.js"),
      });
      expect(browser.arrange(request("TB"))).toEqual(engine.arrange(request("TB")));
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
