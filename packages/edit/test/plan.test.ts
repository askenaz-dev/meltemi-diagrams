import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { corpusFiles } from "../../../test-support/corpus.js";
import {
  applyEdits,
  inversePlan,
  planEdit,
  type EditOperation,
  type PlanResult,
} from "../src/index.js";

const checkout = `language "0.2"

diagram checkout: flow {
  layout manual
  api["API"]
  orders["Orders"]
  db[("DB")]
  api -> orders as create
  orders -> db

  placement {
    place api at (360, 180)
    place db at (1000, 180)
  }
}
`;

function plan(operation: EditOperation, text = checkout): PlanResult {
  return planEdit(compile(text), operation);
}

function rejection(result: PlanResult) {
  if (result.ok) throw new Error("expected a rejection");
  return result.rejection;
}

describe("planEdit", () => {
  it("replaces only the numbers that change", () => {
    const result = plan({
      kind: "setPosition",
      diagram: "checkout",
      element: "api",
      x: 360,
      y: 200,
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(result.plan.edits).toEqual([
      { start: checkout.indexOf("180)"), end: checkout.indexOf("180)") + 3, newText: "200" },
    ]);
  });

  it("returns an empty plan when nothing changes", () => {
    const result = plan({
      kind: "setPosition",
      diagram: "checkout",
      element: "api",
      x: 360.001,
      y: 180,
    });
    expect(result.ok && result.plan.edits).toEqual([]);
    const rename = plan({
      kind: "renameElement",
      diagram: "checkout",
      element: "api",
      newId: "api",
    });
    expect(rename.ok && rename.plan.edits).toEqual([]);
  });

  it("carries the base revision and an exact inverse", () => {
    const result = planEdit(
      compile(checkout),
      { kind: "renameElement", diagram: "checkout", element: "orders", newId: "orderService" },
      { revision: 3 },
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(result.plan.baseRevision).toBe(3);
    const after = applyTextEdits(checkout, result.plan.edits);
    expect(after).toContain("api -> orderService as create");
    expect(applyTextEdits(after, result.plan.inverse)).toBe(checkout);
  });

  it("lists dependents with ranges when removal is blocked", () => {
    const { dependents, code, reason } = rejection(
      plan({ kind: "removeElement", diagram: "checkout", element: "db", cascade: false }),
    );
    expect(code).toBe("edit.has-dependents");
    expect(reason).toMatch(/2 statements/);
    expect(dependents?.map((d) => [d.kind, d.name, d.range.start.line])).toEqual([
      ["relation", "orders->db#1", 9],
      ["place", "db", 13],
    ]);
  });

  it("removes an element without dependents", () => {
    const text = 'diagram d: flow {\n  lonely["Alone"]\n  a -> b\n}\n';
    const result = plan(
      { kind: "removeElement", diagram: "d", element: "lonely", cascade: false },
      text,
    );
    expect(result.ok && applyTextEdits(text, result.plan.edits)).toBe(
      "diagram d: flow {\n  a -> b\n}\n",
    );
  });

  it.each([
    [
      { kind: "setPosition", diagram: "checkout", element: "api", x: Number.NaN, y: 0 },
      "edit.invalid-value",
    ],
    [
      { kind: "setPosition", diagram: "checkout", element: "api", x: 1e12, y: 0 },
      "edit.invalid-value",
    ],
    [
      { kind: "setSize", diagram: "checkout", element: "api", width: 0, height: 10 },
      "edit.invalid-value",
    ],
    [
      {
        kind: "setLabelAnchor",
        diagram: "checkout",
        relation: "create",
        at: 101,
        offset: { x: 0, y: 0 },
      },
      "edit.invalid-value",
    ],
    [
      { kind: "setRoute", diagram: "checkout", relation: "create", from: "left", via: [] },
      "edit.invalid-value",
    ],
    [{ kind: "setPosition", diagram: "nope", element: "api", x: 0, y: 0 }, "edit.unsafe-target"],
    [
      { kind: "setPosition", diagram: "checkout", element: "ghost", x: 0, y: 0 },
      "edit.unsafe-target",
    ],
    [{ kind: "setRoute", diagram: "checkout", relation: "ghost", via: [] }, "edit.unsafe-target"],
    [
      {
        kind: "materializeRelationId",
        diagram: "checkout",
        relationKey: "orders->db#1",
        id: "api",
      },
      "edit.id-conflict",
    ],
    [
      {
        kind: "materializeRelationId",
        diagram: "checkout",
        relationKey: "orders->db#1",
        id: "9lives",
      },
      "edit.invalid-id",
    ],
  ] as [EditOperation, string][])("rejects %o with %s", (operation, code) => {
    expect(rejection(plan(operation)).code).toBe(code);
  });
});

describe("applyEdits", () => {
  it("rejects a plan made for another revision and leaves the document alone", () => {
    const result = planEdit(
      compile(checkout),
      { kind: "setPosition", diagram: "checkout", element: "api", x: 1, y: 2 },
      {
        revision: 3,
      },
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const document = { text: checkout, revision: 4 };
    const applied = applyEdits(document, result.plan);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.rejection.code).toBe("edit.stale-revision");
    expect(document.text).toBe(checkout);
  });

  it("applies and undoes with revisions", () => {
    const result = plan({
      kind: "setPosition",
      diagram: "checkout",
      element: "orders",
      x: 700,
      y: 180,
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    const applied = applyEdits({ text: checkout, revision: 0 }, result.plan);
    if (!applied.ok) throw new Error(applied.rejection.reason);
    expect(applied.document.text).toContain("    place orders at (700, 180)\n  }");
    const undone = applyEdits(
      applied.document,
      inversePlan(result.plan, applied.document.revision),
    );
    expect(undone.ok && undone.document).toEqual({ text: checkout, revision: 2 });
  });
});

describe("every operation on the valid corpus", () => {
  const files = corpusFiles("valid");

  it.each(files.map((f) => [f.name, f.text] as const))("%s", (_name, text) => {
    const compilation = compile(text);
    const errorsBefore = compilation.diagnostics.filter((d) => d.severity === "error").length;
    let planned = 0;
    for (const diagram of compilation.document.diagrams) {
      const operations: EditOperation[] = [];
      const sequence = diagram.type === "sequence";
      for (const element of diagram.elements) {
        const base = { diagram: diagram.id, element: element.id };
        if (!sequence) {
          operations.push(
            { kind: "setPosition", ...base, x: 12.5, y: -40 },
            { kind: "setSize", ...base, width: 200, height: 80 },
          );
        }
        operations.push(
          { kind: "renameElement", ...base, newId: `${element.id}_renamed` },
          { kind: "removeElement", ...base, cascade: true },
          element.kind === "icon" || element.kind === "image"
            ? {
                kind: "setElementSource",
                ...base,
                source: element.kind === "icon" ? "tabler:user" : "x.png",
              }
            : { kind: "setElementLabel", ...base, label: 'New "label"' },
          {
            kind: "setDescription",
            diagram: diagram.id,
            target: element.id,
            targetKind: "element",
            description: "Second line",
          },
          {
            kind: "setStyleProperty",
            diagram: diagram.id,
            target: element.id,
            targetKind: "element",
            property: "stroke",
            value: "@accent",
          },
          {
            kind: "setStyleProperty",
            diagram: diagram.id,
            target: element.id,
            targetKind: "element",
            property: "fill",
            value: null,
          },
        );
        if (element.kind !== "group") {
          const free = diagram.type === "free";
          const kind = free
            ? element.kind === "text"
              ? "box"
              : "text"
            : sequence
              ? element.kind === "actor"
                ? "participant"
                : "actor"
              : "decision";
          if (!free || element.kind === "box" || element.kind === "text") {
            operations.push({ kind: "setElementKind", ...base, elementKind: kind });
          }
          operations.push(
            sequence
              ? {
                  kind: "reorderParticipant",
                  diagram: diagram.id,
                  participant: element.id,
                  index: 0,
                }
              : { kind: "reorderElement", ...base, to: "back" },
          );
          if (element.node && !sequence) {
            operations.push({ kind: "addPort", ...base, name: "fresh_port", side: "south" });
          }
        } else if (!diagram.relations.some((r) => r.from === element.id || r.to === element.id)) {
          operations.push({ kind: "ungroup", diagram: diagram.id, group: element.id });
        }
      }
      // Every element into the first group it may enter, and out of its group with a new place.
      const groups = diagram.elements.filter((e) => e.kind === "group");
      if (!sequence && diagram.type !== "c4") {
        for (const element of diagram.elements) {
          const base = { diagram: diagram.id, element: element.id };
          const into = groups.find((g) => g.id !== element.id && !g.groupPath.includes(element.id));
          if (into) operations.push({ kind: "moveElement", ...base, parent: into.id });
          if (element.groupPath.length > 0) {
            operations.push({ kind: "moveElement", ...base, parent: null, at: { x: 10, y: 20 } });
          }
        }
      }
      const [first, second] = diagram.elements.filter((e) => e.kind !== "group");
      operations.push(
        sequence
          ? { kind: "createElement", diagram: diagram.id, elementKind: "participant" }
          : {
              kind: "createElement",
              diagram: diagram.id,
              elementKind: diagram.type === "free" ? "box" : "node",
              at: { x: 0, y: 0 },
            },
        sequence
          ? { kind: "createElement", diagram: diagram.id, elementKind: "group", label: "G" }
          : {
              kind: "createElement",
              diagram: diagram.id,
              elementKind: "group",
              at: { x: 0, y: 0 },
              size: { width: 200, height: 100 },
            },
        { kind: "setDiagramProperty", diagram: diagram.id, property: "title", value: "Edited" },
      );
      if (!sequence) {
        operations.push({
          kind: "setDiagramProperty",
          diagram: diagram.id,
          property: "routing",
          value: "orthogonal",
        });
      }
      for (const event of diagram.eventsByKey.values()) {
        operations.push(
          { kind: "moveEvent", diagram: diagram.id, event: event.key, direction: "up" },
          { kind: "moveEvent", diagram: diagram.id, event: event.key, direction: "down" },
        );
        if (event.kind === "message" || event.kind === "note" || event.kind === "fragment") {
          operations.push({
            kind: "setSpacing",
            diagram: diagram.id,
            target: event.key,
            targetKind: "event",
            amount: 20,
          });
        }
      }
      if (first && second) {
        operations.push({
          kind: "createRelation",
          diagram: diagram.id,
          from: first.id,
          to: second.id,
          line: "dashed",
          ...(sequence ? {} : { fromPort: "south" }),
        });
        if (first.groupPath.join() === second.groupPath.join()) {
          operations.push({
            kind: "groupElements",
            diagram: diagram.id,
            elements: [first.id, second.id],
            id: "fresh_group",
            label: "Fresh",
          });
        }
      }
      for (const relation of diagram.relations) {
        const base = { diagram: diagram.id };
        if (relation.id === null) {
          operations.push({
            kind: "materializeRelationId",
            ...base,
            relationKey: relation.key,
            id: "fresh_id",
          });
          continue;
        }
        if (!sequence) {
          operations.push({
            kind: "setRoute",
            ...base,
            relation: relation.id,
            from: "south",
            to: "north",
            via: [{ x: 1, y: 2 }],
          });
        }
        operations.push(
          {
            kind: "setLabelAnchor",
            ...base,
            relation: relation.id,
            at: 75,
            offset: { x: 4, y: -4 },
          },
          { kind: "setRelationLabel", ...base, relation: relation.id, label: 'New "label"' },
          { kind: "setRelationLabel", ...base, relation: relation.id, label: null },
          {
            kind: "renameRelation",
            ...base,
            relation: relation.id,
            newId: `${relation.id}_renamed`,
          },
          { kind: "removeRelation", ...base, relation: relation.id },
          { kind: "setRelationLine", ...base, relation: relation.id, line: "dashed" },
          {
            kind: "reconnectRelation",
            ...base,
            relation: relation.id,
            end: "to",
            element: relation.from,
            ...(sequence ? {} : { port: "west" }),
          },
          {
            kind: "setStyleProperty",
            ...base,
            target: relation.id,
            targetKind: "relation",
            property: "routing",
            value: "bezier",
          },
        );
      }
      // A note attaches to another element and detaches again (a view's, to an entity it draws).
      for (const note of diagram.elements.filter((e) => e.kind === "note")) {
        const target = diagram.elements.find(
          (e) => e.id !== note.id && e.kind !== "line" && (diagram.type !== "c4" || e.entity),
        );
        if (target) {
          operations.push({
            kind: "attachNote",
            diagram: diagram.id,
            note: note.id,
            element: target.id,
          });
        }
        operations.push({ kind: "attachNote", diagram: diagram.id, note: note.id, element: null });
      }
      if (diagram.type === "c4") {
        for (const element of diagram.elements) {
          if (element.kind === "group" || element.kind === "note") continue;
          operations.push(
            { kind: "excludeEntity", diagram: diagram.id, entity: element.id, cascade: true },
            { kind: "setLocalLabel", diagram: diagram.id, target: element.id, label: "Local" },
          );
        }
      }
      for (const operation of operations) {
        const result = planEdit(compilation, operation);
        // A move that would break the order of events is refused by design.
        if (!result.ok && operation.kind === "moveEvent") continue;
        // A negative gap cannot sit on the outer side of the first or last participant.
        if (!result.ok && /a gap (before|after) it is 0 or more/.test(result.rejection.reason))
          continue;
        // A `return` takes its ends and line from the call it answers.
        if (!result.ok && /A `return` answers its call/.test(result.rejection.reason)) continue;
        // A free line's points are in its statement: it takes no place or size.
        if (!result.ok && /is a line: its points are written/.test(result.rejection.reason))
          continue;
        // Views refuse operations that write declarations, and model relations stay in the model.
        if (
          !result.ok &&
          diagram.type === "c4" &&
          /does not apply to C4 views|declares notes only|relation of the model|Name the relation in the model|already combined|No relation of the model goes/.test(
            result.rejection.reason,
          )
        ) {
          continue;
        }
        if (!result.ok) expect.fail(`${operation.kind} failed: ${result.rejection.reason}`);
        planned++;
        const after = applyTextEdits(text, result.plan.edits);
        expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
        const recompiled = compile(after);
        const errorsAfter = recompiled.diagnostics.filter((d) => d.severity === "error");
        expect(
          errorsAfter.length,
          `${operation.kind} ${JSON.stringify(operation)}\n${after}`,
        ).toBeLessThanOrEqual(errorsBefore);
      }
    }
    // Model operations on every entity and relation.
    for (const model of compilation.document.models) {
      const operations: EditOperation[] = [];
      for (const entity of model.entities) {
        const base = { model: model.id, entity: entity.path };
        operations.push(
          { kind: "renameEntity", ...base, newId: `${entity.id}_renamed` },
          { kind: "setEntityProperty", ...base, property: "label", value: "Renamed" },
          { kind: "setEntityProperty", ...base, property: "technology", value: "Go" },
          { kind: "setEntityProperty", ...base, property: "description", value: null },
        );
      }
      for (const relation of model.relations) {
        const base = { model: model.id, relation: relation.key };
        operations.push(
          { kind: "setModelRelationProperty", ...base, property: "label", value: "Uses" },
          { kind: "setModelRelationProperty", ...base, property: "technology", value: "gRPC" },
          { kind: "removeModelRelation", ...base, cascade: true },
        );
      }
      for (const operation of operations) {
        const result = planEdit(compilation, operation);
        if (!result.ok) expect.fail(`${operation.kind} failed: ${result.rejection.reason}`);
        planned++;
        const after = applyTextEdits(text, result.plan.edits);
        expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
        const errorsAfter = compile(after).diagnostics.filter((d) => d.severity === "error");
        expect(
          errorsAfter.length,
          `${operation.kind} ${JSON.stringify(operation)}\n${after}`,
        ).toBeLessThanOrEqual(errorsBefore);
      }
    }
    expect(planned).toBeGreaterThan(0);
  });
});

describe("automatic layouts", () => {
  const auto = `diagram d: flow {\n  // services\n  api["API"]\n  db["DB"]\n  api -> db as save\n}\n`;

  it("switches an automatic diagram to assisted when a box is moved", () => {
    const result = plan({ kind: "setPosition", diagram: "d", element: "api", x: 100, y: 80 }, auto);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(applyTextEdits(auto, result.plan.edits)).toBe(
      `diagram d: flow {\n  layout assisted\n  // services\n  api["API"]\n  db["DB"]\n  api -> db as save\n\n  placement {\n    place api at (100, 80)\n  }\n}\n`,
    );
    const written = auto.replace("{\n", "{\n  layout auto\n");
    const replaced = plan(
      { kind: "setPosition", diagram: "d", element: "api", x: 1, y: 2 },
      written,
    );
    expect(replaced.ok && applyTextEdits(written, replaced.plan.edits)).toContain(
      "layout assisted\n",
    );
  });

  it("writes arranged positions for unplaced elements", () => {
    const result = plan(
      {
        kind: "arrange",
        diagram: "d",
        positions: new Map([
          ["api", { x: 100.4, y: 80 }],
          ["db", { x: 340, y: 80.6 }],
        ]),
        scope: "unplaced",
      },
      auto,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = applyTextEdits(auto, result.plan.edits);
    expect(text).toContain("  layout assisted\n");
    expect(text).toContain(
      "  placement {\n    place api at (100, 80)\n    place db at (340, 81)\n  }\n",
    );
    expect(compile(text).ok).toBe(true);
  });

  it("replaces every place and hands connection points back to the layout with scope all", () => {
    const assisted = `diagram d: flow {\n  layout assisted\n  api["API"]\n  db["DB"]\n  bus["Bus"] {\n    port in west\n  }\n  api -> db as save\n  api -> bus as publish\n  placement {\n    place api at (1, 1)\n    route save from api.east 25% to db.west via [(50, 1)]\n    route publish from api.south 30% to bus.in via [(300, 40)]\n  }\n}\n`;
    const result = plan(
      {
        kind: "arrange",
        diagram: "d",
        positions: new Map([
          ["api", { x: 100, y: 80 }],
          ["db", { x: 340, y: 80 }],
        ]),
        scope: "all",
      },
      assisted,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = applyTextEdits(assisted, result.plan.edits);
    expect(text).toContain("place api at (100, 80)");
    expect(text).toContain("place db at (340, 80)");
    // Compass sides, points and waypoints go; named ports stay; an empty route goes.
    expect(text).not.toContain("route save");
    expect(text).toContain("route publish from api to bus.in\n");
    expect(text).not.toContain("via");
    expect(compile(text).diagnostics).toEqual([]);
  });

  it("writes new places where the removed routes were, when every route goes", () => {
    const sheet = `diagram d: flow {\n  client["Client"]\n  api["API"]\n  db[("DB")]\n  client -> api as request\n  api -> db as store\n  api -> client as api_client\n\n  placement {\n    route request from client.south to api.south\n    route api_client from api.north 31% to client.west 50%\n  }\n}\n`;
    const result = plan(
      {
        kind: "arrange",
        diagram: "d",
        positions: new Map([
          ["client", { x: 80, y: 60 }],
          ["api", { x: 300, y: 60 }],
          ["db", { x: 520, y: 60 }],
        ]),
        scope: "all",
      },
      sheet,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = applyTextEdits(sheet, result.plan.edits);
    expect(text).not.toContain("route");
    expect(text).toContain(
      "  placement {\n    place client at (80, 60)\n    place api at (300, 60)\n    place db at (520, 60)\n  }\n",
    );
    expect(compile(text).diagnostics).toEqual([]);
  });

  it("writes the bends of drawn routes as waypoints with scope all", () => {
    const sheet = `diagram d: flow {\n  layout assisted\n  api["API"]\n  db[("DB")]\n  bus["Bus"] {\n    port in west\n  }\n  api -> db as store\n  api -> db as request\n  api -> bus as publish\n  placement {\n    place api at (1, 1)\n    route request from api.east 25% to db.west via [(50, 1)]\n    route publish from api.south 30% to bus.in\n  }\n}\n`;
    const positions = new Map([
      ["api", { x: 700, y: 300 }],
      ["db", { x: 1040, y: 120 }],
      ["bus", { x: 1040, y: 480 }],
    ]);
    const routes = new Map([
      // Bent: an elbow, a point in line and a repeated point that go.
      [
        "store",
        [
          { x: 780, y: 300 },
          { x: 859.6, y: 300 },
          { x: 860.2, y: 220 },
          { x: 860, y: 220 },
          { x: 860, y: 120.4 },
          { x: 960, y: 120 },
        ],
      ],
      // Straight: the route goes.
      [
        "request",
        [
          { x: 780, y: 290 },
          { x: 960, y: 290 },
        ],
      ],
      [
        "publish",
        [
          { x: 700, y: 328 },
          { x: 700, y: 480 },
          { x: 960, y: 480 },
        ],
      ],
    ]);
    const result = plan({ kind: "arrange", diagram: "d", positions, routes, scope: "all" }, sheet);
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = applyTextEdits(sheet, result.plan.edits);
    expect(text).toContain("route store from api to db via [(860, 300), (860, 120)]\n");
    expect(text).not.toContain("route request");
    expect(text).toContain("route publish from api to bus.in via [(700, 480)]\n");
    expect(compile(text).diagnostics).toEqual([]);
    expect(applyTextEdits(text, result.plan.inverse)).toBe(sheet);
  });

  it("names an anonymous relation that needs a route", () => {
    const sheet = `diagram d: flow {\n  layout assisted\n  api["API"]\n  db["DB"]\n  api_db["Taken"]\n  api -> db\n  placement {\n    place api at (1, 1)\n  }\n}\n`;
    const result = plan(
      {
        kind: "arrange",
        diagram: "d",
        positions: new Map([["api", { x: 100, y: 100 }]]),
        routes: new Map([
          [
            "api->db#1",
            [
              { x: 180, y: 100 },
              { x: 240, y: 100 },
              { x: 240, y: 300 },
              { x: 300, y: 300 },
            ],
          ],
        ]),
        scope: "all",
      },
      sheet,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = applyTextEdits(sheet, result.plan.edits);
    expect(text).toContain("  api -> db as api_db_2\n");
    expect(text).toContain("route api_db_2 from api to db via [(240, 100), (240, 300)]");
    expect(compile(text).diagnostics).toEqual([]);
  });

  it("keeps routes when arranging only the unplaced", () => {
    const sheet = `diagram d: flow {\n  layout assisted\n  api["API"]\n  db["DB"]\n  api -> db as save\n  placement {\n    place api at (1, 1)\n    route save from api.east 50% to db.west\n  }\n}\n`;
    const result = plan(
      {
        kind: "arrange",
        diagram: "d",
        positions: new Map([["db", { x: 340, y: 80 }]]),
        scope: "unplaced",
      },
      sheet,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(applyTextEdits(sheet, result.plan.edits)).toContain(
      "route save from api.east 50% to db.west\n",
    );
  });

  it("refuses unknown elements", () => {
    const result = plan(
      {
        kind: "arrange",
        diagram: "d",
        positions: new Map([["ghost", { x: 1, y: 1 }]]),
        scope: "unplaced",
      },
      auto,
    );
    expect(rejection(result).code).toBe("edit.unsafe-target");
  });
});

describe("removing an element used by constraints", () => {
  const sheet = `diagram d: flow {\n  layout manual\n  a["A"]\n  b["B"]\n  c["C"]\n  placement {\n    place a at (0, 0)\n    place b at (200, 0)\n    place c at (400, 0)\n    align a, b, c top\n    row b, c\n    distance a, c 80\n  }\n}\n`;

  it("lists the constraints as dependents", () => {
    const result = plan(
      { kind: "removeElement", diagram: "d", element: "c", cascade: false },
      sheet,
    );
    expect(rejection(result).dependents?.map((d) => [d.kind, d.name])).toEqual([
      ["place", "c"],
      ["constraint", "align"],
      ["constraint", "row"],
      ["constraint", "distance"],
    ]);
  });

  it("drops the element from constraints that keep two targets and deletes the others", () => {
    const result = plan(
      { kind: "removeElement", diagram: "d", element: "c", cascade: true },
      sheet,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(sheet, result.plan.edits);
    expect(after).toContain("    align a, b top\n");
    expect(after).not.toContain("row");
    expect(after).not.toContain("distance");
    expect(compile(after).diagnostics).toEqual([]);
    const first = plan({ kind: "removeElement", diagram: "d", element: "a", cascade: true }, sheet);
    if (!first.ok) throw new Error(first.rejection.reason);
    expect(applyTextEdits(sheet, first.plan.edits)).toContain("    align b, c top\n");
  });
});

describe("renaming an element used by constraints and ports", () => {
  it("renames constraint targets and keeps port names", () => {
    const sheet = `diagram d: flow {\n  layout manual\n  api["API"]\n  bus["Bus"] {\n    port in west\n  }\n  db["DB"]\n  api -> bus as publish\n  placement {\n    place api at (0, 0)\n    place bus at (300, 0)\n    place db at (600, 0)\n    route publish from api.east to bus.in\n    row api, bus\n    distance api, db 80\n  }\n}\n`;
    const result = plan(
      { kind: "renameElement", diagram: "d", element: "api", newId: "gateway" },
      sheet,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(sheet, result.plan.edits);
    expect(after).toContain("row gateway, bus");
    expect(after).toContain("distance gateway, db 80");
    expect(after).toContain("route publish from gateway.east to bus.in");
    expect(compile(after).diagnostics).toEqual([]);
  });
});

describe("ends pinned to a point of a side", () => {
  const apply = (operation: EditOperation, text = checkout) => {
    const result = plan(operation, text);
    if (!result.ok) throw new Error(result.rejection.reason);
    return applyTextEdits(text, result.plan.edits);
  };
  const routed = (route: string) =>
    checkout.replace(
      "    place db at (1000, 180)\n",
      `    place db at (1000, 180)\n    ${route}\n`,
    );

  it("writes a new route with the points of both ends", () => {
    const text = apply({
      kind: "setRoute",
      diagram: "checkout",
      relation: "create",
      from: "east",
      fromPosition: 50,
      to: "north",
      toPosition: 25,
      via: [],
    });
    expect(text).toContain("    route create from api.east 50% to orders.north 25%\n");
    expect(compile(text).diagnostics).toEqual([]);
  });

  it("changes, keeps and removes the point of an end, before and after waypoints", () => {
    const start = routed("route create from api.east 50% to orders.west via [(500, 100)]");
    const moved = apply(
      {
        kind: "setRoute",
        diagram: "checkout",
        relation: "create",
        to: "west",
        toPosition: 75,
        via: [{ x: 500, y: 100 }],
      },
      start,
    );
    expect(moved).toContain("route create from api.east 50% to orders.west 75% via [(500, 100)]");
    const bends = apply(
      { kind: "setRoute", diagram: "checkout", relation: "create", via: [{ x: 520, y: 120 }] },
      moved,
    );
    expect(bends).toContain("route create from api.east 50% to orders.west 75% via [(520, 120)]");
    const unpinned = apply(
      {
        kind: "setRoute",
        diagram: "checkout",
        relation: "create",
        from: "east",
        via: [{ x: 520, y: 120 }],
      },
      bends,
    );
    expect(unpinned).toContain("route create from api.east to orders.west 75% via [(520, 120)]");
  });

  it("hands ends back to the layout and removes the route when nothing is left", () => {
    const start = routed("route create from api.east 50% to orders.west 25%");
    const half = apply(
      { kind: "setRoute", diagram: "checkout", relation: "create", to: null, via: [] },
      start,
    );
    expect(half).toContain("route create from api.east 50% to orders\n");
    const none = apply(
      { kind: "setRoute", diagram: "checkout", relation: "create", from: null, via: [] },
      half,
    );
    expect(none).not.toContain("route create");
    expect(compile(none).diagnostics).toEqual([]);
  });

  it("reconnects and creates relations at a point", () => {
    const start = routed("route create from api.east 50% to orders.west 25%");
    const moved = apply(
      {
        kind: "reconnectRelation",
        diagram: "checkout",
        relation: "create",
        end: "to",
        element: "db",
        port: "north",
        position: 40,
      },
      start,
    );
    expect(moved).toContain("api -> db as create");
    expect(moved).toContain("route create from api.east 50% to db.north 40%");
    const created = apply({
      kind: "createRelation",
      diagram: "checkout",
      from: "orders",
      to: "api",
      line: "solid",
      fromPort: "east",
      fromPosition: 50,
      toPort: "south",
      toPosition: 50,
    });
    expect(created).toContain("orders -> api as orders_api");
    expect(created).toContain("route orders_api from orders.east 50% to api.south 50%");
  });

  it("refuses a point of anything but a compass side, or outside 0..100", () => {
    const cases: EditOperation[] = [
      {
        kind: "setRoute",
        diagram: "checkout",
        relation: "create",
        from: "auto",
        fromPosition: 50,
        via: [],
      },
      {
        kind: "setRoute",
        diagram: "checkout",
        relation: "create",
        from: "east",
        fromPosition: 120,
        via: [],
      },
      { kind: "setRoute", diagram: "checkout", relation: "create", toPosition: 50, via: [] },
    ];
    for (const operation of cases)
      expect(rejection(plan(operation)).code).toBe("edit.invalid-value");
  });
});
