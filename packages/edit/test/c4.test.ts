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
    // `orders` is combined by `uses` in `components` and drawn, lifted, in `containers`.
    const asked = planEdit(compile(commerce), {
      kind: "removeModelRelation",
      model: "commerce",
      relation: "orders",
      cascade: false,
      view: "components",
    });
    expect(asked.ok).toBe(false);
    if (!asked.ok) {
      expect(asked.rejection.code).toBe("edit.has-dependents");
      // `shop.web` is in `components` only for `orders`: it leaves the view with the relation.
      expect(asked.rejection.dependents!.map((d) => d.description).sort()).toEqual([
        expect.stringMatching(/^`orders` drawn in the view `containers` on line \d+$/),
        "`shop.web` no longer drawn in the view `components`",
        expect.stringMatching(/^relation `uses` on line \d+$/),
      ]);
    }
    const removed = run(commerce, {
      kind: "removeModelRelation",
      model: "commerce",
      relation: "orders",
      cascade: true,
    });
    expect(removed).not.toContain('"Usa" as uses');
    expect(removed).not.toContain("as orders");
    // Nothing names `request` and only `containers` draws it: it goes at once from there.
    const alone = run(commerce, {
      kind: "removeModelRelation",
      model: "commerce",
      relation: "request",
      cascade: false,
      view: "containers",
    });
    expect(alone).not.toContain("as request");
  });

  it("removes a relation out of the styles it shares and with its own statements", () => {
    const text = commerce.replace(
      "diagram containers: c4 using commerce {\n",
      'diagram containers: c4 using commerce {\n  style visit, request { width 2 }\n  animate request { effect flow }\n  label request "Pide"\n',
    );
    const after = run(text, {
      kind: "removeModelRelation",
      model: "commerce",
      relation: "request",
      cascade: true,
    });
    expect(after).toContain("  style visit { width 2 }\n");
    expect(after).not.toContain("animate request");
    expect(after).not.toContain('label request "Pide"');
    expect(after).not.toContain("as request");
  });

  it("moves an end of a relation, by its id or its key, and refuses impossible ends", () => {
    const moved = run(commerce, {
      kind: "reconnectModelRelation",
      model: "commerce",
      relation: "visit",
      end: "to",
      entity: "bank",
    });
    expect(moved).toContain('  customer -> bank: "Compra" as visit\n');
    // A relation written with relative paths inside an entity takes the path from the root.
    const nested = run(commerce, {
      kind: "reconnectModelRelation",
      model: "commerce",
      relation: "store",
      end: "to",
      entity: "bank",
    });
    expect(nested).toContain('    api.orders -> bank: "Guarda" as store\n');
    const anonymous = run(commerce.replace(" as persist", ""), {
      kind: "reconnectModelRelation",
      model: "commerce",
      relation: "shop.api->shop.db#1",
      end: "from",
      entity: "shop.web",
    });
    expect(anonymous).toContain('  shop.web -> shop.db: "SQL"\n');
    // The same end changes nothing.
    expect(
      run(commerce, {
        kind: "reconnectModelRelation",
        model: "commerce",
        relation: "visit",
        end: "from",
        entity: "customer",
      }),
    ).toBe(commerce);
    expect(
      refused(commerce, {
        kind: "reconnectModelRelation",
        model: "commerce",
        relation: "persist",
        end: "to",
        entity: "shop",
      }),
    ).toMatch(/^edit\.invalid-value: /);
    expect(
      refused(commerce, {
        kind: "reconnectModelRelation",
        model: "commerce",
        relation: "persist",
        end: "to",
        entity: "nothing",
      }),
    ).toMatch(/has no entity `nothing`/);
  });

  describe("routes follow a moved end", () => {
    // The container view draws the bank too, and pins two routes.
    const routed = (routes: string) =>
      commerce.replace(
        "  include customer, shop.web, shop.api, shop.db\n",
        `  include customer, shop.web, shop.api, shop.db, bank\n  placement {\n${routes}  }\n`,
      );
    const reconnect = (relation: string, end: "from" | "to", entity: string) =>
      ({ kind: "reconnectModelRelation", model: "commerce", relation, end, entity }) as const;

    it("rewrites the moved end of a route, keeping the other end and the waypoints", () => {
      const text = routed("    route visit from customer.south to shop.web via [(200, 300)]\n");
      const after = run(text, reconnect("visit", "to", "bank"));
      expect(after).toContain('  customer -> bank: "Compra" as visit\n');
      expect(after).toContain("    route visit from customer.south to bank via [(200, 300)]\n");
    });

    it("carries a compass side over and drops the old side's point", () => {
      const text = routed("    route visit from customer.east 25% to shop.web.north 30%\n");
      const after = run(text, reconnect("visit", "to", "bank"));
      expect(after).toContain("    route visit from customer.east 25% to bank.north\n");
    });

    it("writes the port and point dropped on the edited view", () => {
      const text = routed("    route visit from customer to shop.web.north\n");
      const after = run(text, {
        ...reconnect("visit", "to", "bank"),
        view: "containers",
        port: "west",
        position: 40,
      });
      expect(after).toContain("    route visit from customer to bank.west 40%\n");
    });

    it("leaves a lifted view's route alone when its drawn end does not move", () => {
      const text = commerce.replace(
        '  title "Commerce en contexto"\n',
        '  title "Commerce en contexto"\n  layout manual\n  placement {\n    place customer at (100, 100)\n    place shop at (400, 100)\n    place bank at (700, 100)\n    route request from shop.north to shop.south\n  }\n',
      );
      // `request` joins two containers of `shop`: the context view does not draw it, and its
      // route there is already refused; moving its end inside `shop` changes nothing there.
      const visit = commerce.replace(
        '  title "Commerce en contexto"\n',
        '  title "Commerce en contexto"\n  placement {\n    route visit from customer to shop via [(250, 40)]\n  }\n',
      );
      const after = run(visit, reconnect("visit", "to", "shop.api"));
      expect(after).toContain('  customer -> shop.api: "Compra" as visit\n');
      expect(after).toContain("    route visit from customer to shop via [(250, 40)]\n");
      expect(text).toContain("route request");
    });

    it("removes a route whose relation the view no longer draws", () => {
      // Without the bank in `include`, the container view stops drawing `visit` once it ends there.
      const text = commerce.replace(
        "  include customer, shop.web, shop.api, shop.db\n",
        "  include customer, shop.web, shop.api, shop.db\n  placement {\n    route visit from customer to shop.web via [(200, 300)]\n  }\n",
      );
      const after = run(text, reconnect("visit", "to", "bank"));
      expect(after).not.toContain("route visit");
    });

    it("repairs a route the last reconnect left behind, which made the view refuse every edit", () => {
      // The state of today's bug: the model already ends at `bank`, the route still at `shop.web`.
      const stale = routed(
        "    route visit from customer.south to shop.web via [(200, 300)]\n",
      ).replace(
        '  customer -> shop.web: "Compra" as visit\n',
        '  customer -> bank: "Compra" as visit\n',
      );
      expect(compile(stale).diagnostics.map((d) => d.code)).toContain("placement.route-mismatch");
      const after = run(stale, reconnect("visit", "to", "shop.api"));
      expect(after).toContain('  customer -> shop.api: "Compra" as visit\n');
      expect(after).toContain("    route visit from customer.south to shop.api via [(200, 300)]\n");
    });

    it("refuses an unknown entity and rewrites no route", () => {
      const text = routed("    route visit from customer.south to shop.web via [(200, 300)]\n");
      expect(refused(text, reconnect("visit", "to", "warehouse"))).toMatch(/warehouse/);
    });

    it("rewrites a route of a view in another file through rewriteRouteEnd", () => {
      // The view's own compilation already resolves the moved model: its route ends elsewhere.
      const view = routed(
        "    route visit from customer.south to shop.web via [(200, 300)]\n",
      ).replace(
        '  customer -> shop.web: "Compra" as visit\n',
        '  customer -> bank: "Compra" as visit\n',
      );
      const after = run(view, {
        kind: "rewriteRouteEnd",
        diagram: "containers",
        relation: "visit",
        end: "to",
      });
      expect(after).toContain("    route visit from customer.south to bank via [(200, 300)]\n");
      // A route of another relation stays as it was.
      const other = routed(
        "    route visit from customer.south to shop.web via [(200, 300)]\n    route persist from shop.api to shop.db.south\n",
      ).replace(
        '  customer -> shop.web: "Compra" as visit\n',
        '  customer -> bank: "Compra" as visit\n',
      );
      expect(
        run(other, {
          kind: "rewriteRouteEnd",
          diagram: "containers",
          relation: "visit",
          end: "to",
        }),
      ).toContain("    route persist from shop.api to shop.db.south\n");
    });
  });

  it("names an anonymous relation by its key, once", () => {
    const text = commerce.replace(" as persist", "");
    const named = run(text, {
      kind: "batch",
      operations: [
        {
          kind: "setModelRelationProperty",
          model: "commerce",
          relation: "shop.api->shop.db#1",
          property: "id",
          value: "shop_api_shop_db",
        },
        {
          kind: "setStyleProperty",
          diagram: "containers",
          target: "shop_api_shop_db",
          targetKind: "relation",
          property: "width",
          value: 2,
        },
      ],
    });
    expect(named).toContain('  shop.api -> shop.db: "SQL" as shop_api_shop_db\n');
    expect(named).toContain("  style shop_api_shop_db { width 2 }\n");
    expect(
      refused(text, {
        kind: "setModelRelationProperty",
        model: "commerce",
        relation: "shop.api->shop.db#1",
        property: "id",
        value: "visit",
      }),
    ).toMatch(/^edit\.id-conflict: /);
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
    ).toMatch(/declares notes only.*createEntity.*includeEntity/);
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
