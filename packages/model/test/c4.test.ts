import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  childLevel,
  compile,
  isChildView,
  type CompileOptions,
  type FlowDiagram,
} from "../src/index.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");

const MODEL = `model m {
  person customer "Cliente"
  system shop "Commerce" {
    container web "Web" { technology "React" }
    container api "API" {
      component orders "Orders"
      component payments "Payments"
    }
    datastore db "DB" { technology "PostgreSQL" }
    api -> db: "SQL" as persist
  }
  system bank "Bank" { external }
  customer -> shop.web: "Buys" as visit
  customer -> shop.api: "Calls" as call
  shop.web -> shop.api as request
  shop.api.payments -> bank as authorize
}
`;

function compileView(body: string, extra = "") {
  const compilation = compile(`${MODEL}${extra}\ndiagram v: c4 using m {\n${body}\n}\n`);
  const view = compilation.document.diagrams.find((d) => d.id === "v")!;
  return { compilation, view, codes: compilation.diagnostics.map((d) => d.code) };
}

const ids = (view: FlowDiagram) => view.elements.map((e) => e.id);
const arrows = (view: FlowDiagram) =>
  view.relations.map((r) => `${r.key}:${r.from}->${r.to}${r.derived ? "*" : ""}`);

describe("model blocks", () => {
  it("compiles the proposal's model with kinds, labels and technologies", () => {
    const compilation = compile(commerce);
    expect(compilation.diagnostics).toEqual([]);
    const model = compilation.document.models[0]!;
    expect(model.entities.map((e) => `${e.path}:${e.kind}`)).toEqual([
      "customer:person",
      "shop:system",
      "shop.web:container",
      "shop.api:container",
      "shop.api.orders:component",
      "shop.api.payments:component",
      "shop.db:datastore",
      "bank:system",
    ]);
    expect(model.entitiesByPath.get("shop.db")!.technology).toBe("PostgreSQL");
    expect(model.entitiesByPath.get("bank")!.external).toBe(true);
    expect(model.relations.map((r) => `${r.key}:${r.from}->${r.to}`)).toContain(
      "store:shop.api.orders->shop.db",
    );
  });

  it("refuses misplaced kinds", () => {
    const { diagnostics } = compile(
      "model m {\n  system shop {\n    component orders\n  }\n  container loose\n}\n",
    );
    expect(diagnostics.map((d) => d.code)).toEqual([
      "model.invalid-nesting",
      "model.invalid-nesting",
    ]);
    expect(diagnostics[0]!.message).toMatch(/components belong in a container/);
  });

  it("resolves relative endpoints in any order and reports unknown ones", () => {
    const relative = compile(
      "model m {\n  a.x -> a.y as early\n  system a {\n    container x\n    container y\n    x -> y as late\n  }\n}\n",
    );
    expect(relative.diagnostics).toEqual([]);
    expect(relative.document.models[0]!.relations.map((r) => `${r.from}->${r.to}`)).toEqual([
      "a.x->a.y",
      "a.x->a.y",
    ]);
    const unknown = compile("model m {\n  system a { container api }\n  a.apx -> a\n}\n");
    expect(unknown.diagnostics[0]).toMatchObject({ code: "ref.unknown-entity" });
    expect(unknown.diagnostics[0]!.hints![0]).toMatch(/a\.api/);
  });

  it("refuses relations to self and to ancestors", () => {
    const { diagnostics } = compile(
      "model m {\n  system a { container b }\n  a -> a.b\n  a -> a\n}\n",
    );
    expect(diagnostics.map((d) => d.code)).toEqual([
      "model.invalid-relation",
      "model.invalid-relation",
    ]);
  });
});

describe("views", () => {
  it("draws the proposal's container view with its boundary", () => {
    const view = compile(commerce).document.diagrams.find((d) => d.id === "containers")!;
    expect(view.type).toBe("c4");
    expect(ids(view)).toEqual(["shop", "customer", "shop.web", "shop.api", "shop.db"]);
    expect(view.elementsById.get("shop")!.kind).toBe("group");
    expect(view.elementsById.get("shop.web")!.groupPath).toEqual(["shop"]);
    expect(view.relations.map((r) => r.key)).toEqual(
      expect.arrayContaining(["visit", "request", "persist"]),
    );
  });

  it("validates levels and scopes", () => {
    expect(compileView("  level container").codes).toEqual(["c4.scope-required"]);
    expect(compileView("  level component\n  scope shop.db").codes).toEqual(["c4.invalid-scope"]);
    expect(compileView("  level container\n  scope shop.web").codes).toEqual(["c4.invalid-scope"]);
    expect(compileView("  level deployment").codes).toContain("c4.invalid-level");
    expect(compileView('  title "No level"').codes).toEqual(["c4.invalid-level"]);
  });

  it("refuses entities out of level and the scope in include", () => {
    const { compilation, codes } = compileView(
      "  level container\n  scope shop\n  include shop.api.orders, shop, shop.web",
    );
    expect(codes).toEqual(["c4.out-of-level", "c4.out-of-level"]);
    expect(compilation.diagnostics[0]!.message).toMatch(
      /container view does not draw the component/,
    );
    expect(compilation.diagnostics[1]!.message).toMatch(/drawn as the boundary/);
  });

  it("draws the default set and applies exclude", () => {
    const { view } = compileView("  level container\n  scope shop");
    expect(ids(view)).toEqual(["shop", "customer", "shop.web", "shop.api", "shop.db", "bank"]);
    const excluded = compileView("  level container\n  scope shop\n  exclude bank").view;
    expect(ids(excluded)).not.toContain("bank");
    expect(ids(compileView("  level context").view)).toEqual(["customer", "shop", "bank"]);
    expect(ids(compileView("  level context\n  scope bank").view)).toEqual(["shop", "bank"]);
  });

  it("lifts relations with traceability and keeps them apart", () => {
    const { view } = compileView("  level context");
    expect(arrows(view)).toEqual([
      "visit:customer->shop*",
      "call:customer->shop*",
      "authorize:shop->bank*",
    ]);
    expect(view.relationsByKey.get("visit")!.sources).toEqual(["visit"]);
  });

  it("combines only by an explicit statement backed by the model", () => {
    const { view, codes } = compileView('  level context\n  customer -> shop: "Uses" as uses');
    expect(codes).toEqual([]);
    expect(arrows(view)).toEqual(["authorize:shop->bank*", "uses:customer->shop*"]);
    expect(view.relationsByKey.get("uses")!.sources).toEqual(["visit", "call"]);
    expect(compileView("  level context\n  shop -> customer").codes).toEqual([
      "c4.unsupported-relation",
    ]);
  });

  it("overrides labels locally", () => {
    const { view, compilation } = compileView(
      '  level container\n  scope shop\n  label shop.api "Orders API"\n  label visit "Compra"',
    );
    expect(view.elementsById.get("shop.api")!.label).toBe("Orders API");
    expect(view.relationsByKey.get("visit")!.label).toBe("Compra");
    expect(compilation.document.models[0]!.entitiesByPath.get("shop.api")!.label).toBe("API");
    expect(compileView('  level context\n  label shop.api "X"').codes).toEqual([
      "ref.unknown-element",
    ]);
  });

  it("places and styles qualified ids, and routes with ports", () => {
    const { view, codes } = compileView(
      "  level container\n  scope shop\n  layout manual\n  placement {\n    place shop.api at (300, 100)\n    route request from shop.web.east to shop.api.west\n  }\n  style shop.db { fill accent }",
    );
    expect(codes.filter((c) => c !== "layout.missing-placement")).toEqual([]);
    expect(view.placement.map((p) => `${p.statement}:${p.target}`)).toEqual([
      "place:shop.api",
      "route:request",
    ]);
    expect(view.styles[0]).toMatchObject({ target: "shop.db", targetKind: "element" });
    expect(view.entityReferences.filter((r) => r.path === "shop.api").length).toBeGreaterThan(0);
  });

  it("reports unknown models and resolves imported ones through the options", () => {
    expect(
      compile("diagram v: c4 using nothing {\n  level context\n}\n").diagnostics[0],
    ).toMatchObject({
      code: "ref.unknown-model",
    });
    const view =
      'import "./m.meltemi" as models\n\ndiagram v: c4 using models.m {\n  level context\n}\n';
    const silent = compile(view);
    expect(silent.diagnostics).toEqual([]);
    expect(silent.document.diagrams[0]!.hasErrors).toBe(true);
    const definition = compile(MODEL).document.models[0]!;
    const options: CompileOptions = {
      models: (name) => (name === "models.m" ? { definition, file: "/p/m.meltemi" } : undefined),
    };
    const resolved = compile(view, options);
    expect(resolved.diagnostics).toEqual([]);
    const diagram = resolved.document.diagrams[0]!;
    expect(ids(diagram)).toEqual(["customer", "shop", "bank"]);
    expect(diagram.elements[0]!.entity).toEqual({
      model: "m",
      path: "customer",
      file: "/p/m.meltemi",
    });
    expect(resolved.options).toBe(options);
  });
});

describe("relation tokens in a view", () => {
  it("refuses a line token as it refuses a two-way arrow, naming `->` and `-->`", () => {
    for (const [token, column] of [
      ["---", 12],
      ["<->", 12],
    ] as const) {
      const { compilation } = compileView(
        `  level container\n  scope shop\n  shop.web ${token} shop.api`,
      );
      const refused = compilation.diagnostics.find((d) => d.message.startsWith(`\`${token}\``));
      expect(refused, token).toBeDefined();
      expect(refused!.range.start.column).toBe(column);
      expect(refused!.message).toBe(`\`${token}\` is not available here; write \`->\` or \`-->\`.`);
    }
  });
});

describe("child views of an entity", () => {
  const compilation = compile(commerce);
  const model = compilation.document.models[0]!;
  const views = compilation.document.diagrams;
  const entity = (path: string) => model.entitiesByPath.get(path)!;
  const children = (path: string) =>
    views
      .filter((v) => v.c4 && isChildView(v.c4, null, { file: null, id: "commerce" }, entity(path)))
      .map((v) => v.id);

  it("opens the next level by the entity's kind", () => {
    expect(childLevel("system")).toBe("container");
    expect(childLevel("container")).toBe("component");
    expect(childLevel("person")).toBeNull();
    expect(childLevel("datastore")).toBeNull();
    expect(childLevel("component")).toBeNull();
  });

  it("finds the container view of a system and the component view of a container", () => {
    expect(children("shop")).toEqual(["containers"]);
    expect(children("shop.api")).toEqual(["components"]);
  });

  it("finds nothing for datastores, persons and other systems", () => {
    expect(children("shop.db")).toEqual([]);
    expect(children("customer")).toEqual([]);
    expect(children("bank")).toEqual([]);
  });

  it("needs the same model and refuses a context view scoped to the system", () => {
    const containers = views.find((v) => v.id === "containers")!.c4!;
    expect(isChildView(containers, null, { file: null, id: "other" }, entity("shop"))).toBe(false);
    expect(
      isChildView(containers, null, { file: "/p/m.meltemi", id: "commerce" }, entity("shop")),
    ).toBe(false);
    expect(
      isChildView(
        containers,
        "/p/m.meltemi",
        { file: "/p/m.meltemi", id: "commerce" },
        entity("shop"),
      ),
    ).toBe(true);
    const scoped = compile(
      `${commerce}\ndiagram ctx: c4 using commerce {\n  level context\n  scope shop\n}\n`,
    );
    const ctx = scoped.document.diagrams.find((d) => d.id === "ctx")!.c4!;
    expect(isChildView(ctx, null, { file: null, id: "commerce" }, entity("shop"))).toBe(false);
  });
});

describe("links to model entities", () => {
  it("ties a participant to an entity and reuses its label", () => {
    const { diagnostics, document } = compile(
      `${MODEL}\ndiagram s: sequence {\n  participant api { link m.shop.api }\n  participant web "Front" { link m.shop.web }\n  web -> api\n}\n`,
    );
    expect(diagnostics).toEqual([]);
    const diagram = document.diagrams[0]!;
    expect(diagram.elementsById.get("api")!.label).toBe("API");
    expect(diagram.elementsById.get("web")!.label).toBe("Front");
    expect(diagram.links[0]).toMatchObject({ target: "model", diagram: "m", element: "shop.api" });
    expect(diagram.entityReferences.map((r) => r.path)).toEqual([
      "shop",
      "shop.api",
      "shop",
      "shop.web",
    ]);
  });

  it("reports unknown entities", () => {
    const { diagnostics } = compile(
      `${MODEL}\ndiagram f: free {\n  box a { link m.shop.apix }\n  placement { place a at (0, 0) }\n}\n`,
    );
    expect(diagnostics[0]).toMatchObject({ code: "ref.unknown-link" });
    expect(diagnostics[0]!.hints![0]).toMatch(/shop\.api/);
  });
});
