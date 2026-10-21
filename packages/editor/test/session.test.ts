import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { compile, type PlaceEntry } from "@meltemi/diagrams-model";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";
import { attachEnd, magnets } from "../src/canvas/index.js";
import { IconRegistry, librariesOf } from "@meltemi/diagrams-assets";
import { createNodeIconPacks, createNodeLibraries } from "@meltemi/diagrams-assets/node";

const manual = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place cache at (420, 266)
  }
}
`;

/** A session on a text, with a helper that applies one action and returns the new text. */
function open(text: string, revision = 1) {
  const session = new CanvasSession();
  let current = text;
  let rev = revision;
  const messages = session.update(analyzeDocument({ text: current, revision: rev }));
  const act = (action: CanvasAction) => {
    const result = session.receive({ type: "action", revision: rev, action });
    return result;
  };
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

const places = (text: string) =>
  new Map(
    compile(text)
      .document.diagrams[0]!.placement.filter((p): p is PlaceEntry => p.statement === "place")
      .map((p) => [p.target, { x: p.x, y: p.y }]),
  );

describe("render and state", () => {
  it("renders the diagram with its elements, relations and inspector", () => {
    const { messages } = open(manual);
    const r = render(messages);
    expect(r.svg.startsWith("<svg")).toBe(true);
    expect(r.elements.map((e) => e.id)).toEqual(["api", "db", "cache"]);
    expect(r.relations.map((x) => [x.key, x.from, x.to])).toEqual([["save", "api", "db"]]);
    expect(messages.some((m) => m.type === "inspector")).toBe(true);
  });

  it("hands the canvas the shape each element is drawn with", () => {
    const shaped = manual
      .replace(
        '  cache["Cache"]\n',
        '  cache["Cache"]\n  decision ok "OK?"\n  group g "G" {\n    gate["Gate"]\n  }\n',
      )
      .replace("  placement {", "  style cache { shape hexagon }\n  placement {")
      .replace(
        "    place cache",
        "    place ok at (700, 112)\n    place gate at (700, 266)\n    place cache",
      );
    const shapes = new Map(render(open(shaped).messages).elements.map((e) => [e.id, e.shape]));
    expect(Object.fromEntries(shapes)).toEqual({
      api: "rounded",
      db: "cylinder",
      cache: "hexagon",
      ok: "diamond",
      g: "rounded",
      gate: "rounded",
    });
  });

  it("hands the canvas the connector as drawn beside the route's points", () => {
    const straight = render(open(manual).messages).relations[0]!;
    expect(straight.drawn.length).toBeGreaterThanOrEqual(2);
    const curved = render(
      open(manual.replace("  layout manual", "  layout manual\n  routing bezier")).messages,
    ).relations[0]!;
    // The curve is sampled into many points; the route keeps its two anchors.
    expect(curved.points).toHaveLength(2);
    expect(curved.drawn.length).toBeGreaterThan(8);
  });

  it("adds, renames, fills, moves and removes layers from the panel", () => {
    const { apply, session } = open(manual);
    let text = apply({ kind: "addLayer" });
    expect(text).toContain("  layers layer1, main\n");
    text = apply({ kind: "renameLayer", layer: "layer1", name: "back" });
    expect(text).toContain("  layers back, main\n");
    text = apply({ kind: "setLayer", ids: ["api", "save"], layer: "back" });
    expect(text).toContain('api["API"] { layer back }');
    expect(text).toContain('api -> db: "save" as save { layer back }');
    expect(session.selected).toEqual([]);
    text = apply({ kind: "addLayer" });
    expect(text).toContain("  layers back, layer1, main\n");
    text = apply({ kind: "moveLayer", layer: "back", direction: "up" });
    expect(text).toContain("  layers layer1, back, main\n");
    text = apply({ kind: "setLayer", ids: ["api"], layer: null });
    expect(text).not.toContain('api["API"] { layer back }');
    text = apply({ kind: "removeLayer", layer: "back" });
    expect(text).not.toContain("layer back");
    expect(text).toContain("  layers layer1, main\n");
    text = apply({ kind: "removeLayer", layer: "layer1" });
    expect(text).not.toContain("layers");
    const sequence = open("diagram s: sequence {\n  participant a\n}\n");
    expect(sequence.act({ kind: "addLayer" }).messages[0]).toMatchObject({ type: "rejected" });
  });

  it("lists the libraries, their elements with thumbnails, and creates from them", () => {
    const registry = new IconRegistry(createNodeIconPacks());
    const libraries = librariesOf(registry, createNodeLibraries());
    const session = new CanvasSession();
    let text = manual;
    let rev = 1;
    session.update(analyzeDocument({ text, revision: rev, icons: registry, libraries }));
    const listed = session.receive({ type: "libraries" }).messages[0]!;
    expect(listed.type).toBe("libraries");
    if (listed.type !== "libraries") return;
    expect(listed.libraries.map((l) => l.id)).toEqual([
      "tech",
      "aws",
      "azure",
      "gcp",
      "kubernetes",
      "tabler",
    ]);
    const compute = listed.libraries[1]!.categories.find((c) => c.id === "compute")!;
    expect(compute.count).toBeGreaterThan(10);
    const items = session.receive({ type: "libraryItems", library: "aws", category: "compute" })
      .messages[0]!;
    if (items.type !== "libraryItems") throw new Error(items.type);
    const lambda = items.items.find((i) => i.icon === "aws:lambda")!;
    expect(lambda.label).toBe("AWS Lambda");
    expect(lambda.svg).toMatch(/^<svg/);
    const search = session.receive({ type: "librarySearch", query: "postgres" }).messages[0]!;
    if (search.type !== "librarySearch") throw new Error(search.type);
    expect(search.items.map((i) => i.icon)).toContain("logos:postgresql");
    // Creating writes the label and the icon's style; the id comes from the icon's name.
    const result = session.receive({
      type: "action",
      revision: rev,
      action: {
        kind: "create",
        elementKind: "node",
        at: { x: 300, y: 300 },
        label: "AWS Lambda",
        icon: "aws:lambda",
      },
    });
    text = applyTextEdits(text, result.plan!.edits);
    rev++;
    expect(text).toContain('  lambda1["AWS Lambda"]\n  style lambda1 { icon "aws:lambda" }\n');
    session.update(analyzeDocument({ text, revision: rev, icons: registry, libraries }));
    expect(session.selected).toEqual(["lambda1"]);
    // Sequence diagrams have no libraries.
    const sequence = new CanvasSession();
    sequence.update(
      analyzeDocument({
        text: "diagram s: sequence {\n  participant a\n}\n",
        revision: 1,
        icons: registry,
        libraries,
      }),
    );
    const none = sequence.receive({ type: "libraries" }).messages[0]!;
    expect(none).toEqual({ type: "libraries", libraries: [] });
  });

  it("sends the theme's canvas colours: its accent, or its selection and guide", () => {
    // technical.light's accent.
    expect(render(open(manual).messages).colors).toEqual({
      selection: "#1D4ED8",
      guide: "#1D4ED8",
    });
    const themed = `theme mine {\n  extends "technical.light"\n  selection "#0B6BCB"\n  guide "#16A34A"\n}\n\n${manual.replace("  layout manual", '  layout manual\n  theme "mine"')}`;
    expect(render(open(themed).messages).colors).toEqual({
      selection: "#0B6BCB",
      guide: "#16A34A",
    });
  });

  it("rejects actions on an old revision", () => {
    const { session } = open(manual, 4);
    session.update(analyzeDocument({ text: manual, revision: 5 }));
    const result = session.receive({
      type: "action",
      revision: 4,
      action: { kind: "move", ids: ["api"], delta: { x: 14, y: 0 } },
    });
    expect(result.plan).toBeUndefined();
    expect(result.messages[0]).toMatchObject({ type: "rejected", code: "edit.stale-revision" });
    expect(result.messages.some((m) => m.type === "render")).toBe(true);
  });

  it("keeps the last render while the text has errors", () => {
    const { session } = open(manual);
    const broken = session.update(
      analyzeDocument({ text: manual.replace('api["API"]', 'api["API'), revision: 2 }),
    );
    expect(broken.map((m) => m.type)).toEqual(["render", "stale", "inspector"]);
    const stale = broken.find((m) => m.type === "stale")!;
    expect(stale).toMatchObject({ count: expect.any(Number) });
    const refused = session.receive({
      type: "action",
      revision: 2,
      action: { kind: "move", ids: ["api"], delta: { x: 14, y: 0 } },
    });
    expect(refused.plan).toBeUndefined();
  });

  it("reports a file without a flow diagram", () => {
    const { messages } = open(`language "0.2"\n`);
    expect(messages[0]).toMatchObject({ type: "empty" });
  });
});

describe("gestures", () => {
  it("moves two boxes in one edit", () => {
    const { session, act } = open(manual);
    const result = act({ kind: "move", ids: ["api", "db"], delta: { x: 14, y: 0 } });
    const after = applyTextEdits(manual, result.plan!.edits);
    expect(places(after).get("api")).toEqual({ x: 140, y: 112 });
    expect(places(after).get("db")).toEqual({ x: 434, y: 112 });
    expect(applyTextEdits(after, result.plan!.inverse)).toBe(manual);
    void session;
  });

  it("writes the arrangement first when dragging in auto", () => {
    const auto = `diagram d: flow {\n  client["Client"]\n  api["API"]\n  orders["Orders"]\n  db[("DB")]\n  client -> api\n  api -> orders\n  orders -> db\n}\n`;
    const { session, act } = open(auto);
    const view = analyzeDocument({ text: auto }).diagrams[0]!;
    const before = new Map(
      [...view.layout!.boxes!].map(([id, b]) => [
        id,
        { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) },
      ]),
    );
    const result = act({ kind: "move", ids: ["api"], delta: { x: 28, y: 0 } });
    const after = applyTextEdits(auto, result.plan!.edits);
    expect(after).toContain("layout assisted");
    const written = places(after);
    expect(written.size).toBe(4);
    expect(written.get("api")).toEqual({ x: before.get("api")!.x + 28, y: before.get("api")!.y });
    for (const id of ["client", "orders", "db"]) expect(written.get(id)).toEqual(before.get(id));
    expect(applyTextEdits(after, result.plan!.inverse)).toBe(auto);
    void session;
  });

  it("writes the engine's bends when recomputing the layout", () => {
    const sheet = `diagram overview: flow {
  layout assisted
  direction LR
  client["Client"]
  api["API"] { description "Handles requests" }
  node3[""]
  db[("Database")]
  node1["Esta es una prueba"]
  style node3 { shape square; line dashed; fill "#DBBDBD" }
  client -> api: "HTTPS" as request
  api -> db: "Reads and writes" as store
  db -> client: "Aja? " as db_client_2
  node1 -> client
  placement {
    place client at (322, 280)
    place api at (798, 336)
    place db at (784, 56)
    place node1 at (101, 40)
    place node3 at (770, 68)
    size node3 (238, 196)
    route request from client.east 50% to api.auto
  }
  style db_client_2 { routing orthogonal }
  style request { routing polyline }
}
`;
    const { act } = open(sheet);
    const result = act({ kind: "arrange", scope: "all" });
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    const after = applyTextEdits(sheet, result.plan.edits);
    // The back edge keeps the engine's way around; the straight polyline needs no route.
    expect(after).toMatch(/route db_client_2 from db to client via \[\(\d+, \d+\)/);
    expect(after).not.toContain("route request");
    expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(applyTextEdits(after, result.plan.inverse)).toBe(sheet);
  });

  it("says why the layout cannot be recomputed", () => {
    const sheet = `diagram d: flow {\n  layout assisted\n  group outer "Outer" {\n    a["A"]\n    group band ""\n  }\n  placement {\n    place outer at (300, 200)\n    size outer (400, 300)\n    place a at (200, 200)\n    place band at (350, 250)\n    size band (100, 80)\n  }\n}\n`;
    const { act } = open(sheet);
    const result = act({ kind: "arrange", scope: "all" });
    expect(result.plan).toBeUndefined();
    const rejected = result.messages.find((m) => m.type === "rejected");
    expect(rejected).toMatchObject({ type: "rejected", code: "layout.cannot-arrange" });
    expect(rejected && "reason" in rejected && rejected.reason).toMatch(
      /^Fix the problems of the diagram before arranging it: .*band/,
    );
  });

  const square = `diagram overview: flow {
  layout assisted
  client["Client"]
  node3[""]
  db[("Database")]
  style node3 { shape square; line dashed; fill "#DBBDBD" }
  client -> db as read
  placement {
    place client at (322, 280)
    place node3 at (770, 68)
    size node3 (238, 196)
    place db at (784, 56)
  }
}
`;

  it("converts a square into the container of the boxes stacked on it", () => {
    const { act, apply } = open(square);
    const result = act({ kind: "convertToContainer", id: "node3" });
    expect(result.messages).toContainEqual({
      type: "status",
      message: "`node3` is now a container holding `db`.",
    });
    let text = apply({ kind: "convertToContainer", id: "node3" });
    expect(text).toContain('  group node3 "" {\n    db[("Database")]\n  }\n');
    expect(text).toContain('style node3 { line dashed; fill "#DBBDBD"; radius 0 }');
    expect(text).toContain("size node3 (238, 196)");
    expect(compile(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Moving the container now carries the database.
    text = apply({ kind: "move", ids: ["node3"], delta: { x: -28, y: 14 } });
    expect(places(text).get("node3")).toEqual({ x: 742, y: 82 });
    expect(places(text).get("db")).toEqual({ x: 756, y: 70 });
  });

  it("says that a box dropped on a box is stacked, not inside it", () => {
    const { act } = open(square.replace("place db at (784, 56)", "place db at (322, 420)"));
    const result = act({ kind: "move", ids: ["db"], delta: { x: 462, y: -364 } });
    expect(result.plan).toBeDefined();
    expect(result.messages).toContainEqual({
      type: "status",
      message: "`db` is stacked on `node3`; convert `node3` to a container to move them together.",
    });
  });

  it("places the children of a converted free box in its new interior", () => {
    const free = `diagram slide: free {\n  layout manual\n  box frame ""\n  box db "Database"\n  placement {\n    place frame at (400, 300)\n    size frame (238, 196)\n    place db at (420, 300)\n  }\n}\n`;
    const { apply } = open(free);
    const text = apply({ kind: "convertToContainer", id: "frame" });
    expect(text).toContain('group frame "" {');
    // The interior starts 16 px in from the top-left corner (281, 202) of the untitled group.
    expect(places(text).get("db")).toEqual({ x: 420 - 297, y: 300 - 218 });
    expect(places(text).get("frame")).toEqual({ x: 400, y: 300 });
  });

  it("resizes and moves labels", () => {
    const { apply } = open(manual);
    let text = apply({ kind: "resize", id: "api", box: { x: 46, y: 84, width: 196, height: 56 } });
    expect(text).toContain("size api (196, 56)");
    expect(places(text).get("api")).toEqual({ x: 144, y: 112 });
    text = apply({ kind: "moveLabel", relation: "save", delta: { x: 0, y: -16 } });
    expect(text).toContain("label save at 50% offset (0, -16)");
  });

  it("adds a bend and moves an end to another port", () => {
    const { apply } = open(manual);
    let text = apply({ kind: "setVia", relation: "save", via: [{ x: 273, y: 168 }] });
    expect(text).toContain("route save from api.auto to db.auto via [(273, 168)]");
    text = apply({ kind: "setEnd", relation: "save", end: "to", element: "db", port: "north" });
    expect(text).toContain("route save from api.auto to db.north via [(273, 168)]");
    text = apply({ kind: "setEnd", relation: "save", end: "to", element: "cache", port: "west" });
    expect(text).toContain('api -> cache: "save" as save');
    expect(text).toContain("to cache.west");
  });

  it("pins ends to points of sides and hands them back to the layout", () => {
    const { apply, session } = open(manual);
    let text = apply({
      kind: "setEnd",
      relation: "save",
      end: "to",
      element: "db",
      port: "west",
      position: 50,
    });
    expect(text).toContain("route save from api.auto to db.west 50%");
    text = apply({
      kind: "setEnd",
      relation: "save",
      end: "to",
      element: "cache",
      port: "north",
      position: 25,
    });
    expect(text).toContain("route save from api.auto to cache.north 25%");
    // Nothing is left to keep in the route once both ends are the layout's.
    text = apply({ kind: "setEnd", relation: "save", end: "to", element: "cache", port: null });
    expect(text).not.toContain("route save");
    // A connection dropped on a point pins both ends.
    text = apply({
      kind: "connect",
      from: "db",
      to: "cache",
      line: "solid",
      pinned: { fromPort: "south", fromPosition: 50, toPort: "north", toPosition: 50 },
    });
    expect(text).toContain("db -> cache as db_cache");
    expect(text).toContain("route db_cache from db.south 50% to cache.north 50%");
    expect(session.selected).toEqual(["db_cache"]);
    // A connection started on a border and dropped inside the target pins only its start.
    text = apply({
      kind: "connect",
      from: "cache",
      to: "db",
      line: "solid",
      pinned: { fromPort: "north", fromPosition: 30 },
    });
    expect(text).toContain("cache -> db as cache_db");
    expect(text).toContain("route cache_db from cache.north 30% to db.auto");
  });
});

describe("attaching a dragged end", () => {
  const box = { x: 100, y: 100, width: 120, height: 60 };
  const reach = { border: 12, magnet: 6 };

  it("takes any point of the border to 1 %, inside or just outside the box", () => {
    expect(attachEnd(box, [], { x: 144, y: 104 }, reach)).toEqual({
      port: "north",
      position: 37,
      point: { x: 144.4, y: 100 },
    });
    expect(attachEnd(box, [], { x: 226, y: 121 }, reach)).toMatchObject({
      port: "east",
      position: 35,
    });
  });

  it("is drawn to the middles, the corners and the named ports, unless Alt", () => {
    expect(attachEnd(box, [], { x: 103, y: 128 }, reach)).toEqual({
      port: "west",
      position: 50,
      point: { x: 100, y: 130 },
    });
    expect(attachEnd(box, [], { x: 217, y: 158 }, reach)).toMatchObject({
      port: "south",
      position: 100,
    });
    const ports = [{ name: "in", side: "west" as const, position: 0.4 }];
    expect(attachEnd(box, ports, { x: 101, y: 123 }, reach)).toMatchObject({ port: "in" });
    expect(attachEnd(box, [], { x: 103, y: 128 }, { ...reach, free: true })).toMatchObject({
      port: "west",
      position: 47,
    });
  });

  it("leaves the end to the layout further inside", () => {
    expect(attachEnd(box, [], { x: 160, y: 125 }, reach)).toEqual({
      port: null,
      point: { x: 160, y: 130 },
    });
    expect(magnets(box)).toHaveLength(8);
  });
});

describe("creating, editing and deleting", () => {
  it("creates an empty data store on the grid and selects it", () => {
    const { session, apply } = open(manual);
    const text = apply({ kind: "create", elementKind: "data", at: { x: 420, y: 260 } });
    expect(text).toContain('  data1[("")]\n');
    expect(text).toContain("place data1 at (420, 266)");
    expect(session.selected).toEqual(["data1"]);
  });

  it("connects, labels and renames", () => {
    const { session, apply } = open(manual);
    let text = apply({ kind: "connect", from: "api", to: "cache", line: "dashed" });
    expect(text).toContain("api --> cache");
    // The new relation is selected, as after the relation tool or a drag from a handle.
    expect(session.selected).toEqual(["api->cache#1"]);
    apply({ kind: "connect", from: "api", to: "cache", line: "solid" });
    expect(session.selected).toEqual(["api->cache#2"]);
    text = apply({ kind: "setLabel", id: "api", label: "Orders API" });
    expect(text).toContain('api["Orders API"]');
    text = apply({ kind: "setLabel", id: "api->cache#1", label: "warm" });
    expect(text).toContain('api --> cache: "warm" as api_cache');
    text = apply({ kind: "renameId", id: "save", newId: "persist" });
    expect(text).toContain("as persist");
  });

  it("connects with the four arrow kinds", () => {
    const { session, apply } = open(manual);
    let text = apply({ kind: "connect", from: "api", to: "cache", line: "solid", twoWay: true });
    expect(text).toContain("  api <-> cache\n");
    expect(session.selected).toEqual(["api->cache#1"]);
    text = apply({ kind: "connect", from: "cache", to: "db", line: "dashed", twoWay: true });
    expect(text).toContain("  cache <--> db\n");
    text = apply({ kind: "connect", from: "db", to: "cache", line: "dashed", twoWay: false });
    expect(text).toContain("  db --> cache\n");
  });

  it("moves a flow node into a group and out, keeping its place", () => {
    const grouped = manual.replace(
      '  cache["Cache"]\n',
      '  group g "G" {\n    cache["Cache"]\n  }\n',
    );
    const { apply } = open(grouped);
    let text = apply({ kind: "move", ids: ["api"], delta: { x: 0, y: 14 }, parent: "g" });
    // Flow diagrams place in diagram coordinates.
    expect(text).toContain('  group g "G" {\n    cache["Cache"]\n    api["API"]\n  }\n');
    expect(places(text).get("api")).toEqual({ x: 126, y: 126 });
    text = apply({ kind: "move", ids: ["api"], delta: { x: 0, y: 14 }, parent: null });
    expect(text).toMatch(/\n {2}api\["API"\]\n/);
    expect(places(text).get("api")).toEqual({ x: 126, y: 140 });
  });

  describe("a group without place, drawn around its children", () => {
    // g is drawn around api: (304, 32), 192 × 112.
    const backend = `diagram d: flow {
  layout manual
  web["Web"]
  group g "Backend" {
    api["API"]
  }
  web -> api
  placement {
    place web at (100, 100)
    place api at (400, 100)
  }
}
`;
    const drawn = (session: CanvasSession) => render(session.state());

    it("follows its only child dragged out of its box, which stays in it", () => {
      const { apply, session } = open(backend);
      // api lands at (400, 220), below g's box: the canvas sends no target group.
      const text = apply({ kind: "move", ids: ["api"], delta: { x: 0, y: 120 }, parent: null });
      expect(text).toContain('  group g "Backend" {\n    api["API"]\n  }\n');
      expect(places(text).get("api")).toEqual({ x: 400, y: 220 });
      expect(places(text).has("g")).toBe(false);
      expect(drawn(session).elements.find((e) => e.id === "g")!.box).toEqual({
        x: 304,
        y: 152,
        width: 192,
        height: 112,
      });
    });

    it("follows all its children dragged together, into another group too", () => {
      const two = backend
        .replace('    api["API"]\n', '    api["API"]\n    db[("DB")]\n')
        .replace("    place api", "    place db at (400, 240)\n    place api");
      const { apply, session } = open(two);
      let text = apply({ kind: "move", ids: ["api", "db"], delta: { x: 280, y: 0 }, parent: null });
      expect(text).toContain('  group g "Backend" {\n    api["API"]\n    db[("DB")]\n  }\n');
      expect(places(text).get("api")).toEqual({ x: 680, y: 100 });
      expect(places(text).get("db")).toEqual({ x: 680, y: 240 });
      expect(drawn(session).type).toBe("render");
      const nested = two
        .replace('  web["Web"]\n', '  group h "Other" {\n    web["Web"]\n  }\n')
        .replace(
          "    place web",
          "    place h at (100, 100)\n    size h (600, 400)\n    place web",
        );
      const other = open(nested);
      text = other.apply({
        kind: "move",
        ids: ["api", "db"],
        delta: { x: -280, y: 0 },
        parent: "h",
      });
      expect(text).toContain('  group g "Backend" {\n    api["API"]\n    db[("DB")]\n  }\n');
      expect(places(text).get("api")).toEqual({ x: 120, y: 100 });
    });

    it("keeps the place and size it is drawn with when the Inside field takes its last child out", () => {
      const { apply, session } = open(backend);
      const text = apply({ kind: "setField", ids: ["api"], field: "inside", value: null });
      expect(text).toContain('  group g "Backend" {\n  }\n');
      expect(text).toMatch(/\n {2}api\["API"\]\n/);
      expect(places(text).get("g")).toEqual({ x: 400, y: 88 });
      expect(text).toContain("size g (192, 112)");
      expect(places(text).get("api")).toEqual({ x: 400, y: 100 });
      expect(drawn(session).elements.find((e) => e.id === "g")!.box).toEqual({
        x: 304,
        y: 32,
        width: 192,
        height: 112,
      });
    });
  });

  it("asks before deleting dependents, then cascades", () => {
    const { act, apply } = open(manual);
    const asked = act({ kind: "remove", ids: ["db"], cascade: false });
    expect(asked.plan).toBeUndefined();
    const rejection = asked.messages[0] as HostMessage & { type: "rejected" };
    expect(rejection.code).toBe("edit.has-dependents");
    expect(rejection.dependents!.map((d) => d.kind)).toEqual(["relation", "place"]);
    const text = apply(rejection.retry!);
    expect(text).not.toContain("db");
  });

  it("duplicates a pair with fresh ids and selects the copies", () => {
    const { session, apply } = open(manual);
    const text = apply({ kind: "duplicate", ids: ["api", "db"] });
    expect(text).toContain('api_2["API"]');
    expect(text).toContain('db_2[("DB")]');
    expect(text).toContain('api_2 -> db_2: "save" as save_2');
    expect(places(text).get("api_2")).toEqual({ x: 154, y: 140 });
    expect(session.selected).toEqual(["api_2", "db_2"]);
  });

  it("groups, ungroups, aligns and distributes", () => {
    const { act, apply } = open(manual);
    let text = apply({ kind: "group", ids: ["api", "db"] });
    expect(text).toContain('group group1 "Group" {');
    text = apply({ kind: "ungroup", id: "group1" });
    expect(text).not.toContain("group1");
    // Already aligned: nothing to write.
    expect(act({ kind: "align", ids: ["db", "cache"], edge: "left" }).plan).toBeUndefined();
    text = apply({ kind: "align", ids: ["api", "cache"], edge: "top" });
    expect(places(text).get("cache")).toEqual({ x: 420, y: 112 });
  });

  it("splits a shared style from the inspector", () => {
    const styled = manual.replace(
      "  placement {",
      '  style api, db { fill "#eef" }\n  placement {',
    );
    const { apply } = open(styled);
    const text = apply({ kind: "setField", ids: ["api"], field: "style.fill", value: "accent" });
    expect(text).toContain('style db { fill "#eef" }');
    expect(text).toContain("style api { fill accent }");
  });

  it("asks the host for the clipboard to paste, and pastes a copy", () => {
    const { session, act } = open(manual);
    expect(act({ kind: "paste" }).readClipboard).toEqual({});
    const copied = session.receive({ type: "copy", ids: ["cache"] }).clipboard!;
    const pasted = session.paste(copied, { x: 700, y: 300 });
    const text = applyTextEdits(manual, pasted.plan!.edits);
    expect(text).toContain('cache_2["Cache"]');
    expect(places(text).get("cache_2")).toEqual({ x: 700, y: 294 });
  });
});

describe("what sequence diagrams and C4 views refuse", () => {
  const sequence = `diagram s: sequence {
  group front "Front" {
    participant web "Web"
  }
  participant api "API"
  web -> api: "call"
}
`;

  it("refuses to move a participant into a group or to give it a shape, and moves it", () => {
    const { act } = open(sequence);
    const into = act({ kind: "move", ids: ["api"], delta: { x: 0, y: 0 }, parent: "front" });
    expect(into.messages[0]).toMatchObject({
      type: "rejected",
      reason:
        "Sequence participants do not move between groups; drag them sideways to reorder them.",
    });
    const shaped = act({
      kind: "create",
      elementKind: "participant",
      at: { x: 600, y: 40 },
      shape: "hexagon",
    });
    expect(shaped.messages[0]).toMatchObject({ type: "rejected" });
    expect((shaped.messages[0] as { reason: string }).reason).toMatch(
      /^Sequence participants draw/,
    );
    // The same parent is no move between groups.
    const kept = act({ kind: "move", ids: ["web"], delta: { x: 0, y: 0 }, parent: "front" });
    expect(kept.messages.some((m) => m.type === "rejected")).toBe(false);
  });

  it("refuses a two-way arrow in a C4 view", () => {
    const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const { session, act } = open(commerce);
    session.receive({ type: "pickDiagram", diagram: "context" });
    const view = render(session.state());
    const [from, to] = view.elements.filter((e) => e.kind !== "group").map((e) => e.id);
    const result = act({ kind: "connect", from: from!, to: to!, line: "solid", twoWay: true });
    expect(result.plan).toBeUndefined();
    expect(result.messages[0]).toMatchObject({
      type: "rejected",
      reason: "Relations of C4 views go one way: `->` or `-->`.",
    });
  });
});

describe("two-way selection", () => {
  it("highlights the element of the statement under the text cursor", () => {
    const { session } = open(manual);
    expect(session.selectAt(manual.indexOf("place db") + 3)).toEqual([
      { type: "highlight", ids: ["db"] },
    ]);
  });

  it("reveals the selected element in the text", () => {
    const { session } = open(manual);
    const result = session.receive({ type: "select", ids: ["cache"] });
    expect(manual.slice(result.reveal!.start, result.reveal!.end)).toBe("cache");
    expect(result.reveal!.focus).toBe(false);
  });
});
