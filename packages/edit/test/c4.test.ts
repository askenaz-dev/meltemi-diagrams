import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { planEdit, type EditOperation } from "../src/index.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");

function run(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(result.rejection.reason);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return `${result.rejection.code}: ${result.rejection.reason}`;
}

describe("model operations", () => {
  it("adds entities where they belong", () => {
    const worker = run(commerce, {
      kind: "createEntity",
      model: "commerce",
      parent: "shop",
      entityKind: "container",
      id: "worker",
    });
    expect(worker).toContain(
      '    datastore db "Pedidos" { technology "PostgreSQL" }\n    container worker "Worker"\n',
    );
    const person = run(commerce, {
      kind: "createEntity",
      model: "commerce",
      entityKind: "person",
      label: "Admin",
    });
    expect(person).toContain('  person person1 "Admin"');
    expect(
      refused(commerce, {
        kind: "createEntity",
        model: "commerce",
        parent: "shop",
        entityKind: "component",
      }),
    ).toMatch(/cannot be declared in the system/);
  });

  it("renames an entity everywhere in the file", () => {
    const after = run(commerce, {
      kind: "renameEntity",
      model: "commerce",
      entity: "shop.api",
      newId: "orders",
    });
    expect(after).toContain('    container orders "API" {');
    expect(after).toContain("    orders.orders -> db");
    expect(after).toContain('  shop.web -> shop.orders: "HTTPS"');
    expect(after).toContain("  include customer, shop.web, shop.orders, shop.db");
    expect(after).toContain('  label shop.orders "API de pedidos"');
    expect(after).toContain("  scope shop.orders\n");
    expect(after).toContain("  shop.web -> shop.orders.orders:");
    expect(
      refused(commerce, {
        kind: "renameEntity",
        model: "commerce",
        entity: "shop.api",
        newId: "web",
      }),
    ).toMatch(/^edit.id-conflict/);
  });

  it("sets entity properties and relation properties", () => {
    const set = (
      property: "label" | "description" | "technology" | "external",
      value: string | boolean | null,
    ) =>
      run(commerce, {
        kind: "setEntityProperty",
        model: "commerce",
        entity: "shop.web",
        property,
        value,
      });
    expect(set("technology", "Vue")).toContain('container web "Web" { technology "Vue" }');
    expect(set("label", "Tienda")).toContain('container web "Tienda" {');
    expect(set("description", "SPA")).toContain(
      'container web "Web" { description "SPA"; technology "React" }',
    );
    expect(
      run(commerce, {
        kind: "setEntityProperty",
        model: "commerce",
        entity: "customer",
        property: "external",
        value: true,
      }),
    ).toContain('person customer "Cliente" { external; description "Compra en línea" }');
    const relation = run(commerce, {
      kind: "setModelRelationProperty",
      model: "commerce",
      relation: "persist",
      property: "technology",
      value: "JDBC",
    });
    expect(relation).toContain('shop.api -> shop.db: "SQL" as persist { technology "JDBC" }');
    const renamed = run(commerce, {
      kind: "setModelRelationProperty",
      model: "commerce",
      relation: "orders",
      property: "id",
      value: "lists",
    });
    expect(renamed).toContain("as lists\n");
  });

  it("lists dependents and removes an entity with its relations and view statements", () => {
    const result = planEdit(compile(commerce), {
      kind: "removeEntity",
      model: "commerce",
      entity: "shop.db",
      cascade: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("edit.has-dependents");
      expect(new Set(result.rejection.dependents!.map((d) => d.kind))).toEqual(
        new Set(["relation", "element"]),
      );
    }
    const after = run(commerce, {
      kind: "removeEntity",
      model: "commerce",
      entity: "shop.db",
      cascade: true,
    });
    expect(after).not.toContain("shop.db");
    expect(after).not.toContain("datastore db");
    expect(
      refused(commerce, {
        kind: "removeEntity",
        model: "commerce",
        entity: "shop.api",
        cascade: true,
      }),
    ).toMatch(/opens `shop.api`/);
  });

  it("adds and removes model relations with the combinations that stand for them", () => {
    const added = run(commerce, {
      kind: "createModelRelation",
      model: "commerce",
      from: "customer",
      to: "bank",
      label: "Paga",
      id: "pays",
    });
    expect(added).toContain('  customer -> bank: "Paga" as pays\n');
    const removed = run(commerce, {
      kind: "removeModelRelation",
      model: "commerce",
      relation: "orders",
    });
    expect(removed).not.toContain('"Usa" as uses');
  });
});

describe("view operations", () => {
  it("includes and excludes entities and keeps the model", () => {
    const excluded = run(commerce, {
      kind: "excludeEntity",
      diagram: "containers",
      entity: "shop.db",
      cascade: true,
    });
    expect(excluded).toContain("  include customer, shop.web, shop.api\n");
    expect(excluded).toContain('datastore db "Pedidos"');
    const fromDefault = run(commerce, {
      kind: "excludeEntity",
      diagram: "context",
      entity: "bank",
      cascade: true,
    });
    expect(fromDefault).toContain("  level context\n  exclude bank\n");
    const back = run(fromDefault, { kind: "includeEntity", diagram: "context", entity: "bank" });
    expect(back).toBe(commerce);
    const explicit = run(commerce, {
      kind: "includeEntity",
      diagram: "components",
      entity: "customer",
    });
    expect(explicit).toContain(
      "  scope shop.api\n  include shop.web, shop.api.orders, shop.api.payments, shop.db, bank, customer\n",
    );
  });

  it("writes and removes local labels", () => {
    const changed = run(commerce, {
      kind: "setLocalLabel",
      diagram: "containers",
      target: "shop.api",
      label: "Pedidos API",
    });
    expect(changed).toContain('  label shop.api "Pedidos API"');
    const removed = run(commerce, {
      kind: "setLocalLabel",
      diagram: "containers",
      target: "shop.api",
      label: null,
    });
    expect(removed).not.toContain("label shop.api");
    const added = run(commerce, {
      kind: "setLocalLabel",
      diagram: "containers",
      target: "visit",
      label: "Compra en línea",
    });
    expect(added).toContain('  label shop.api "API de pedidos"\n  label visit "Compra en línea"\n');
  });

  it("moves an element of one view only", () => {
    const moved = run(commerce, {
      kind: "setPosition",
      diagram: "containers",
      element: "shop.api",
      x: 420,
      y: 140,
    });
    expect(moved).toContain("  placement {\n    place shop.api at (420, 140)\n  }\n");
    expect(moved.match(/place /g)).toHaveLength(1);
    const routed = run(moved, {
      kind: "setRoute",
      diagram: "containers",
      relation: "request",
      from: "east",
      to: "west",
      via: [],
    });
    expect(routed).toContain("route request from shop.web.east to shop.api.west");
  });

  it("refuses declarations and model relations in a view", () => {
    expect(
      refused(commerce, {
        kind: "createElement",
        diagram: "containers",
        elementKind: "container",
        at: { x: 0, y: 0 },
      }),
    ).toMatch(/does not apply to C4 views/);
    expect(
      refused(commerce, { kind: "removeRelation", diagram: "containers", relation: "visit" }),
    ).toMatch(/relation of the model/);
    expect(
      refused(commerce, {
        kind: "setRelationLabel",
        diagram: "containers",
        relation: "visit",
        label: "x",
      }),
    ).toMatch(/setLocalLabel/);
  });
});
