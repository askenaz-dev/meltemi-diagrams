import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  CanvasSession,
  codeActions,
  completions,
  definition,
  documentSymbols,
  hover,
  references,
  rename,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";
import { ProjectSessions } from "../src/node.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");

function open(text: string, diagram: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let messages = session.update(analyzeDocument({ text: current, revision: rev }));
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      messages = session.update(analyzeDocument({ text: current, revision: rev }));
    } else if (result.messages.length > 0) {
      messages = [...result.messages];
    }
    return result;
  };
  send({ type: "pickDiagram", diagram });
  return {
    session,
    send,
    apply: (action: CanvasAction) => {
      const result = send({ type: "action", revision: rev, action });
      if (!result.plan) throw new Error(JSON.stringify(result.messages));
      return current;
    },
    act: (action: CanvasAction) => session.receive({ type: "action", revision: rev, action }),
    render: () => messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")!,
    inspector: () =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const at = (text: string, marker = "|") => ({
  text: text.replace(marker, ""),
  offset: text.indexOf(marker),
});
const labels = (text: string) => {
  const { text: t, offset } = at(text);
  return completions(analyzeDocument({ text: t }), offset).map((i) => i.label);
};

describe("C4 language services", () => {
  it("completes kinds by nesting, endpoints, levels, scopes and allowed entities", () => {
    expect(
      labels(commerce.replace('  person customer "Cliente"', '  |\n  person customer "Cliente"')),
    ).toEqual(expect.arrayContaining(["person", "system", "shop.api"]));
    const inSystem = labels(
      commerce.replace('    datastore db "Pedidos"', '    |\n    datastore db "Pedidos"'),
    );
    expect(inSystem).toEqual(
      expect.arrayContaining(["container", "datastore", "technology", "description"]),
    );
    expect(inSystem).not.toContain("component");
    expect(labels(commerce.replace("  level context\n", "  level |\n"))).toEqual([
      "context",
      "container",
      "component",
    ]);
    expect(labels(commerce.replace("  scope shop\n", "  scope |\n"))).toEqual(["shop", "bank"]);
    const include = labels(
      commerce.replace(
        "  include customer, shop.web, shop.api, shop.db\n",
        "  include customer, |\n",
      ),
    );
    expect(include).toEqual(["shop.web", "shop.api", "shop.db", "bank"]);
    expect(
      labels(commerce.replace("diagram context: c4 using commerce", "diagram context: c4 using |")),
    ).toEqual(["commerce"]);
  });

  it("hovers entities, leads from views to the model and finds every use", () => {
    const analysis = analyzeDocument({ text: commerce });
    const inInclude =
      commerce.indexOf("include customer, shop.web, shop.api") +
      "include customer, shop.web, shop.".length +
      1;
    expect(hover(analysis, inInclude)!.markdown).toMatch(
      /^\*\*container\*\* `shop.api` — API\n\n\[Container: HTTP\]/,
    );
    expect(hover(analysis, inInclude)!.markdown).toMatch(/drawn in `containers`, `components`/);
    const target = definition(analysis, inInclude)!;
    expect(target.start.offset).toBe(commerce.indexOf('api "API"'));
    expect(references(analysis, inInclude).length).toBeGreaterThanOrEqual(8);
  });

  it("renames an entity across views and lists models as symbols", () => {
    const analysis = analyzeDocument({ text: commerce });
    const offset = commerce.indexOf("scope shop.api") + "scope shop.".length + 1;
    const result = rename(analysis, offset, "orders");
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(commerce, result.plan.edits);
    expect(after).toContain("scope shop.orders");
    expect(after).toContain('container orders "API"');
    const symbols = documentSymbols(analysis);
    expect(symbols[0]).toMatchObject({ name: "commerce", kind: "model" });
    expect(symbols[0]!.children.map((c) => c.name)).toEqual(
      expect.arrayContaining(["customer", "shop", "bank", "visit"]),
    );
  });

  it("removes an entity out of level and adds a missing scope", () => {
    const text = commerce.replace(
      "  include customer, shop.web, shop.api, shop.db\n",
      "  include customer, shop.api.orders, shop.web\n",
    );
    const analysis = analyzeDocument({ text });
    const out = analysis.diagnostics.find((d) => d.code === "c4.out-of-level")!;
    const fix = codeActions(
      analysis,
      { start: out.range.start.offset, end: out.range.start.offset },
      [out],
    )[0]!;
    expect(fix.title).toBe("Remove `shop.api.orders` from include");
    expect(applyTextEdits(text, fix.edits)).toContain("  include customer, shop.web\n");
    const noScope = commerce.replace("  scope shop\n", "");
    const missing = analyzeDocument({ text: noScope });
    const required = missing.diagnostics.find((d) => d.code === "c4.scope-required")!;
    const add = codeActions(
      missing,
      { start: required.range.start.offset, end: required.range.start.offset },
      [required],
    );
    expect(add[0]!.title).toBe("Add `scope shop`");
  });
});

describe("C4 canvas", () => {
  it("renders the view with the entities it can add", () => {
    const canvas = open(commerce, "containers");
    const render = canvas.render();
    expect(render.profile).toBe("c4");
    expect(render.entities.map((e) => e.path)).toEqual(["bank"]);
    expect(render.elements.find((e) => e.id === "shop.api")!.label).toBe("API de pedidos");
    // The palette offers the entity kinds the level draws.
    const tools = (diagram: string) =>
      open(commerce, diagram)
        .render()
        .tools?.map((t) => `${t.kind}:${t.label}`);
    expect(tools("context")).toEqual(["person:Person", "system:Software system"]);
    expect(tools("containers")).toEqual([
      "container:Container",
      "datastore:Data store",
      "person:Person",
      "system:Software system",
    ]);
    expect(tools("components")).toEqual([
      "component:Component",
      "person:Person",
      "system:Software system",
    ]);
  });

  it("adds from the model, removes by excluding, and labels locally", () => {
    const canvas = open(commerce, "containers");
    const added = canvas.apply({ kind: "includeEntity", entity: "bank" });
    expect(added).toContain("  include customer, shop.web, shop.api, shop.db, bank\n");
    const removed = canvas.apply({ kind: "remove", ids: ["shop.db"], cascade: true });
    expect(removed).toContain("  include customer, shop.web, shop.api, bank\n");
    expect(removed).toContain('datastore db "Pedidos"');
    const labelled = canvas.apply({ kind: "setLabel", id: "shop.web", label: "Tienda web" });
    expect(labelled).toContain('  label shop.web "Tienda web"');
  });

  it("declares a new entity in the model where the view's level puts it, and draws it", () => {
    // A container inside the scope of a container view that lists what it draws.
    const containers = open(commerce, "containers");
    const created = containers.apply({
      kind: "create",
      elementKind: "container",
      at: { x: 300, y: 420 },
    });
    expect(created).toContain(
      '    datastore db "Pedidos" { technology "PostgreSQL" }\n    container container1 ""\n',
    );
    expect(created).toContain("  include customer, shop.web, shop.api, shop.db, shop.container1\n");
    expect(created).toMatch(/place shop\.container1 at \(\d+, \d+\)/);
    expect(containers.render().elements.map((e) => e.id)).toContain("shop.container1");
    // The new element is selected and its label editor opens.
    expect(containers.session.selected).toEqual(["shop.container1"]);
    // A person on a context view, which draws every person: no `include` to write.
    const context = open(commerce, "context");
    const person = context.apply({ kind: "create", elementKind: "person", at: { x: 80, y: 80 } });
    expect(person).toContain('  person person1 ""\n');
    expect(person).not.toMatch(/diagram context[^}]*include/);
    expect(context.render().elements.map((e) => e.id)).toContain("person1");
    // A kind the level does not draw is refused, naming the ones it does.
    const refused = context.act({ kind: "create", elementKind: "container", at: { x: 0, y: 0 } });
    expect(refused.messages[0]).toMatchObject({
      type: "rejected",
      code: "edit.invalid-value",
      reason: "This view draws no `container`; it draws `person`, `system`.",
    });
    // A component on a component view goes inside its container.
    const components = open(commerce, "components");
    const component = components.apply({
      kind: "create",
      elementKind: "component",
      at: { x: 200, y: 200 },
    });
    expect(component).toContain('      component component1 ""\n');
    expect(components.render().elements.map((e) => e.id)).toContain("shop.api.component1");
  });

  it("pastes and duplicates entities as copies declared in the model, without their relations", () => {
    const canvas = open(commerce, "containers");
    const copied = canvas.session.receive({ type: "copy", ids: ["shop.web"] });
    // A container is declared in a system: the copy sits in a holder the paste leaves out.
    expect(copied.clipboard).toContain(
      'model clipboard {\n  system meltemi_clipboard "" {\n    container web "Web" { technology "React" }\n  }\n}',
    );
    const pasted = canvas.session.paste(copied.clipboard!, { x: 600, y: 400 });
    expect(pasted.plan).toBeDefined();
    const text = applyTextEdits(commerce, pasted.plan!.edits);
    expect(text).toContain('    container web_2 "Web" { technology "React" }\n');
    expect(text).toContain("  include customer, shop.web, shop.api, shop.db, shop.web_2\n");
    expect(text).toMatch(/place shop\.web_2 at \(\d+, \d+\)/);
    // No relation of `web` is copied.
    expect(text).not.toMatch(/shop\.web_2 ->|-> shop\.web_2/);
    expect(analyzeDocument({ text }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Duplicate on the context view: the person with its description, two grid steps off.
    const context = open(commerce, "context");
    const duplicated = context.apply({ kind: "duplicate", ids: ["customer"] });
    expect(duplicated).toContain(
      '  person customer_2 "Cliente" { description "Compra en línea" }\n',
    );
    expect(context.session.selected).toEqual(["customer_2"]);
    // A flow fragment on the clipboard does not paste into a C4 view, and says why.
    const flow = canvas.session.paste(
      'language "0.2"\n\ndiagram clipboard: flow {\n  api["API"]\n}\n',
    );
    expect(flow.plan).toBeUndefined();
    expect(flow.messages[0]).toMatchObject({ type: "status" });
  });

  it("moves in one view and writes entity fields into the model", () => {
    const canvas = open(commerce, "containers");
    const moved = canvas.apply({ kind: "move", ids: ["shop.api"], delta: { x: 28, y: 0 } });
    expect(moved).toMatch(/place shop\.api at \(/);
    canvas.send({ type: "select", ids: ["shop.web"] });
    const model = canvas.inspector();
    expect(model.fields.find((f) => f.name === "entity.technology")!.value).toBe("React");
    const written = canvas.apply({
      kind: "setField",
      ids: ["shop.web"],
      field: "entity.technology",
      value: "Vue",
    });
    expect(written).toContain('container web "Web" { technology "Vue" }');
    canvas.send({ type: "select", ids: ["request"] });
    expect(canvas.inspector().fields.find((f) => f.name === "sources")!.value).toBe("request");
  });

  it("styles and animates an anonymous relation by naming it in the model", () => {
    const canvas = open(commerce.replace(" as persist", ""), "containers");
    canvas.send({ type: "select", ids: ["shop.api->shop.db#1"] });
    const names = canvas.inspector().fields.map((f) => f.name);
    expect(names).toContain("effect.flow");
    expect(names).toContain("style.width");
    const flow: CanvasAction = {
      kind: "setField",
      ids: ["shop.api->shop.db#1"],
      field: "effect.flow",
      value: "on",
    };
    const result = canvas.act(flow);
    expect(result.plan).toBeDefined();
    expect(result.messages).toContainEqual({
      type: "status",
      message: "Named `shop_api_shop_db`.",
    });
    const flowed = canvas.apply(flow);
    expect(flowed).toContain('  shop.api -> shop.db: "SQL" as shop_api_shop_db\n');
    expect(flowed).toContain("  animate shop_api_shop_db { effect flow }\n");
    const widened = canvas.apply({
      kind: "setField",
      ids: ["shop_api_shop_db"],
      field: "style.width",
      value: 2,
    });
    expect(widened).toContain("  style shop_api_shop_db { width 2 }\n");
    // The view an imported Mermaid C4 diagram makes has no relation ids at all.
    const imported = readFileSync(
      join(CORPUS_ROOT, "import", "mermaid", "c4-context.meltemi"),
      "utf8",
    );
    const view = open(imported, "system_context_diagram_for_internet");
    const animated = view.apply({
      kind: "setField",
      ids: ["customerA->SystemAA#1"],
      field: "effect.flow",
      value: "on",
    });
    expect(animated).toContain('  customerA -> SystemAA: "Uses" as customerA_SystemAA\n');
    expect(animated).toContain("  animate customerA_SystemAA { effect flow }\n");
  });

  it("draws a relation into the model, pinned or not", () => {
    const canvas = open(commerce, "containers");
    const plain = canvas.apply({ kind: "connect", from: "customer", to: "shop.db", line: "solid" });
    expect(plain).toContain(
      '  shop.web -> shop.api.orders: "Pedidos" as orders\n  customer -> shop.db\n',
    );
    expect(canvas.inspector().target.ids).toEqual(["customer->shop.db#1"]);
    const pinned = canvas.apply({
      kind: "connect",
      from: "customer",
      to: "shop.api",
      line: "dashed",
      pinned: { fromPort: "east", toPort: "west", toPosition: 25 },
    });
    expect(pinned).toContain("  customer -> shop.api as customer_shop_api\n");
    expect(pinned).toMatch(/route customer_shop_api from customer\.east to shop\.api\.west 25%/);
    expect(canvas.inspector().target.ids).toEqual(["customer_shop_api"]);
  });

  it("moves the end of a drawn relation in the model, routing it when dropped on a port", () => {
    // `visit` is drawn from `customer` to `shop` in the context view, lifted from `shop.web`.
    const context = open(commerce, "context");
    const lifted = context.apply({
      kind: "setEnd",
      relation: "visit",
      end: "to",
      element: "bank",
      port: null,
    });
    expect(lifted).toContain('  customer -> bank: "Compra" as visit\n');
    const canvas = open(commerce.replace(" as persist", ""), "containers");
    const moved = canvas.apply({
      kind: "setEnd",
      relation: "shop.api->shop.db#1",
      end: "from",
      element: "shop.web",
      port: null,
    });
    expect(moved).toContain('  shop.web -> shop.db: "SQL"\n');
    expect(canvas.inspector().target.ids).toEqual(["shop.web->shop.db#1"]);
    const ported = canvas.apply({
      kind: "setEnd",
      relation: "shop.web->shop.db#1",
      end: "to",
      element: "shop.api",
      port: "north",
      position: 25,
    });
    expect(ported).toContain('  shop.web -> shop.api: "SQL" as shop_web_shop_api\n');
    expect(ported).toMatch(/route shop_web_shop_api from shop\.web\.auto to shop\.api\.north 25%/);
    // The same entity: the end pinned to a side of its border.
    const pinned = canvas.apply({
      kind: "setEnd",
      relation: "visit",
      end: "to",
      element: "shop.web",
      port: "south",
    });
    expect(pinned).toMatch(/route visit from customer\.auto to shop\.web\.south/);
    // A combination stands for model relations: its ends do not move.
    const components = open(commerce, "components");
    const refused = components.act({
      kind: "setEnd",
      relation: "uses",
      end: "to",
      element: "shop.api.payments",
      port: null,
    });
    expect(refused.messages[0]).toMatchObject({
      type: "rejected",
      reason: "`uses` stands for `orders`; change them in the model.",
    });
  });

  it("names an anonymous combination in the view for a style or an effect", () => {
    const anonymous = commerce.replace(" as uses", "");
    const canvas = open(anonymous, "components");
    const key = canvas
      .render()
      .relations.find((r) => r.key.startsWith("shop.web->shop.api.orders"))!.key;
    const width: CanvasAction = { kind: "setField", ids: [key], field: "style.width", value: 2 };
    expect(canvas.act(width).messages).toContainEqual({
      type: "status",
      message: "Named `shop_web_shop_api_orders`.",
    });
    const styled = canvas.apply(width);
    expect(styled).toContain('  shop.web -> shop.api.orders: "Usa" as shop_web_shop_api_orders\n');
    expect(styled).toContain("style shop_web_shop_api_orders { width 2 }");
    expect(canvas.inspector().target.ids).toEqual(["shop_web_shop_api_orders"]);
    // The fresh id stays clear of the model's relation ids.
    const clash = open(anonymous.replace("as orders", "as shop_web_shop_api_orders"), "components");
    const flowed = clash.apply({ kind: "setField", ids: [key], field: "effect.flow", value: "on" });
    expect(flowed).toContain(
      '  shop.web -> shop.api.orders: "Usa" as shop_web_shop_api_orders_2\n',
    );
    expect(flowed).toContain("animate shop_web_shop_api_orders_2 { effect flow }");
    // Its ends still do not move: they stand for model relations.
    const refused = open(anonymous, "components").act({
      kind: "setEnd",
      relation: key,
      end: "to",
      element: "shop.api.payments",
      port: null,
    });
    expect(refused.messages[0]).toMatchObject({ type: "rejected" });
  });

  it("keeps a routed relation's route valid through two reconnects, and pins a dropped port", () => {
    // The container view draws the bank too and routes `visit`; Arrange writes such routes.
    const routed = commerce.replace(
      "  include customer, shop.web, shop.api, shop.db\n",
      "  include customer, shop.web, shop.api, shop.db, bank\n  placement {\n    route visit from customer.south to shop.web via [(200, 300)]\n  }\n",
    );
    const canvas = open(routed, "containers");
    const mismatches = (text: string) =>
      analyzeDocument({ text }).diagnostics.filter((d) => d.code === "placement.route-mismatch");
    // Dropped in the middle of a box: the route follows, with no port.
    const once = canvas.apply({
      kind: "setEnd",
      relation: "visit",
      end: "to",
      element: "shop.api",
      port: null,
    });
    expect(once).toContain('  customer -> shop.api: "Compra" as visit\n');
    expect(once).toContain("    route visit from customer.south to shop.api via [(200, 300)]\n");
    expect(mismatches(once)).toEqual([]);
    // Again, on a side of the bank: what failed with "The `route` statement … is invalid".
    const twice = canvas.apply({
      kind: "setEnd",
      relation: "visit",
      end: "to",
      element: "bank",
      port: "west",
      position: 40,
    });
    expect(twice).toContain('  customer -> bank: "Compra" as visit\n');
    expect(twice).toContain(
      "    route visit from customer.south to bank.west 40% via [(200, 300)]\n",
    );
    expect(mismatches(twice)).toEqual([]);
    expect(canvas.inspector().target.ids).toEqual(["visit"]);
  });

  it("deletes a drawn relation from the model, asking when other views draw it", () => {
    const canvas = open(commerce, "containers");
    const asked = canvas.act({ kind: "remove", ids: ["visit"], cascade: false });
    const message = asked.messages[0] as unknown as {
      type: string;
      code: string;
      dependents: { description: string }[];
      retry: CanvasAction;
    };
    expect(message).toMatchObject({ type: "rejected", code: "edit.has-dependents" });
    expect(message.dependents.map((d) => d.description)).toEqual([
      expect.stringMatching(/^`visit` drawn in the view `context` on line \d+$/),
    ]);
    const removed = canvas.apply(message.retry);
    expect(removed).not.toContain("as visit");
    // Only this view draws `request`, and nothing names it: it goes at once.
    const alone = canvas.apply({ kind: "remove", ids: ["request"], cascade: false });
    expect(alone).not.toContain("as request");
  });

  it("labels a drawn relation in the model when it has none, locally otherwise", () => {
    const canvas = open(commerce, "containers");
    canvas.apply({ kind: "connect", from: "customer", to: "shop.db", line: "solid" });
    const model = canvas.apply({ kind: "setLabel", id: "customer->shop.db#1", label: "Consulta" });
    expect(model).toContain('  customer -> shop.db: "Consulta"\n');
    const local = canvas.apply({ kind: "setLabel", id: "visit", label: "Entra" });
    expect(local).toContain('  label visit "Entra"\n');
    const anonymous = open(commerce.replace(" as persist", ""), "containers");
    const named = anonymous.apply({
      kind: "setLabel",
      id: "shop.api->shop.db#1",
      label: "Guarda",
    });
    expect(named).toContain('  shop.api -> shop.db: "SQL" as shop_api_shop_db\n');
    expect(named).toContain('  label shop_api_shop_db "Guarda"\n');
    // The inspector's id field names or renames the model relation, with what names it.
    anonymous.send({ type: "select", ids: ["shop_api_shop_db"] });
    expect(anonymous.inspector().fields.find((f) => f.name === "id")).toMatchObject({
      type: "id",
      value: "shop_api_shop_db",
    });
    const renamed = anonymous.apply({
      kind: "setField",
      ids: ["shop_api_shop_db"],
      field: "id",
      value: "persist",
    });
    expect(renamed).toContain('"SQL" as persist');
    expect(renamed).toContain('  label persist "Guarda"\n');
  });
});

describe("a model in another file of the project", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-c4-steps-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), root, { recursive: true });
  const slash = (path: string) => path.split(sep).join("/");
  const modelFile = slash(join(root, "models", "commerce.meltemi"));
  const containersFile = slash(join(root, "diagrams", "containers.meltemi"));
  const contextFile = slash(join(root, "diagrams", "context.meltemi"));
  // `persist` loses its id: the import of a Mermaid C4 diagram names no relation.
  writeFileSync(modelFile, readFileSync(modelFile, "utf8").replace(" as persist", ""));
  const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
  const text = (file: string) => readFileSync(file, "utf8");
  const errors = (file: string) =>
    sessions.analyze(file).diagnostics.filter((d) => d.severity === "error");

  function openIn(file: string, diagram: string) {
    const session = new CanvasSession({ path: file, project: () => true });
    let messages = session.update(sessions.analyze(file));
    session.receive({ type: "pickDiagram", diagram });
    const act = (action: CanvasAction) => session.receive({ type: "action", revision: 0, action });
    return {
      act,
      /** Acts, and applies the steps the session hands the host, as the hosts do. */
      apply: (action: CanvasAction) => {
        const result = act(action);
        if (result.plan) throw new Error("expected steps over files, not a plan");
        if (result.project?.kind !== "files") throw new Error(JSON.stringify(result.messages));
        const planned = sessions.planSteps(file, result.project.steps);
        if (!planned.ok) throw new Error(planned.reason);
        for (const [path, edits] of planned.edits) {
          writeFileSync(path, applyTextEdits(text(path), edits));
          sessions.forFile(path).invalidate(path);
        }
        messages = session.update(sessions.analyze(file));
        return result.project;
      },
      inspector: () =>
        messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!
          .model,
      send: (message: unknown) => {
        messages = [...session.receive(message).messages];
      },
    };
  }

  it("styles and animates an anonymous relation by naming it in the model's file", () => {
    const canvas = openIn(containersFile, "containers");
    canvas.send({ type: "select", ids: ["shop.api->shop.db#1"] });
    const fields = canvas.inspector().fields;
    expect(fields.map((f) => f.name)).toContain("effect.flow");
    expect(fields.find((f) => f.name === "relation.technology")).not.toHaveProperty("readonly");
    expect(fields.find((f) => f.name === "modelFile")).toMatchObject({ value: modelFile });
    const request = canvas.apply({
      kind: "setField",
      ids: ["shop.api->shop.db#1"],
      field: "effect.flow",
      value: "on",
    });
    expect(request.steps.map((s) => [s.file, s.operation.kind])).toEqual([
      [modelFile, "setModelRelationProperty"],
      [null, "setAnimation"],
    ]);
    expect(text(modelFile)).toContain('  shop.api -> shop.db: "SQL" as shop_api_shop_db\n');
    expect(text(containersFile)).toContain("  animate shop_api_shop_db { effect flow }\n");
    expect(errors(containersFile)).toEqual([]);
    expect(canvas.inspector().target.ids).toEqual(["shop_api_shop_db"]);
  });

  it("declares a container in the model's file from the view, in one request", () => {
    const canvas = openIn(containersFile, "containers");
    const request = canvas.apply({
      kind: "create",
      elementKind: "container",
      at: { x: 300, y: 420 },
    });
    expect(request.steps.map((s) => [s.file, s.operation.kind])).toEqual([
      [modelFile, "createEntity"],
      [null, "includeEntity"],
      [null, "setPosition"],
    ]);
    expect(text(modelFile)).toContain('    container container1 ""\n');
    // The view draws the scope's containers by default: nothing to include, a place to keep.
    expect(text(containersFile)).not.toContain("include");
    expect(text(containersFile)).toMatch(/place shop\.container1 at \(\d+, \d+\)/);
    for (const file of [modelFile, containersFile, contextFile]) expect(errors(file)).toEqual([]);
    expect(canvas.inspector().target.ids).toEqual(["shop.container1"]);
    // Taken out again, so the tests below see the project as they expect.
    writeFileSync(modelFile, text(modelFile).replace('    container container1 ""\n', ""));
    writeFileSync(
      containersFile,
      text(containersFile).replace(/\n {4}place shop\.container1 at \(\d+, \d+\)/, ""),
    );
    sessions.forFile(modelFile).invalidate(modelFile);
    sessions.forFile(containersFile).invalidate(containersFile);
  });

  it("moves an end, writes a model field and renames an entity in every file", () => {
    const canvas = openIn(containersFile, "containers");
    canvas.apply({ kind: "setEnd", relation: "visit", end: "to", element: "shop.api", port: null });
    expect(text(modelFile)).toContain('  customer -> shop.api: "Compra" as visit\n');
    canvas.apply({
      kind: "setField",
      ids: ["request"],
      field: "relation.technology",
      value: "gRPC",
    });
    expect(text(modelFile)).toContain('as request { technology "gRPC" }');
    // A note of the view attached to the entity follows the rename, in the view's own file.
    writeFileSync(
      containersFile,
      text(containersFile).replace(
        '  label shop.api "API de pedidos"\n',
        '  label shop.api "API de pedidos"\n  note why "Why" on shop.api\n',
      ),
    );
    sessions.forFile(containersFile).invalidate(containersFile);
    const renamer = openIn(containersFile, "containers");
    renamer.apply({ kind: "renameId", id: "shop.api", newId: "orders" });
    expect(text(modelFile)).toContain('    container orders "API"');
    expect(text(modelFile)).toContain("  shop.web -> shop.orders:");
    expect(text(containersFile)).toContain('  label shop.orders "API de pedidos"');
    expect(text(containersFile)).toContain('  note why "Why" on shop.orders\n');
    // Taken out again, so the tests below see the project as they expect.
    writeFileSync(
      containersFile,
      text(containersFile).replace('  note why "Why" on shop.orders\n', ""),
    );
    sessions.forFile(containersFile).invalidate(containersFile);
    for (const file of [modelFile, containersFile, contextFile]) expect(errors(file)).toEqual([]);
  });

  it("removes a relation from the model after listing what the other files lose", () => {
    const canvas = openIn(containersFile, "containers");
    // The context view combines `visit` as `buys`: it loses the combination and the arrow.
    const asked = canvas.act({ kind: "remove", ids: ["visit"], cascade: false });
    if (asked.project?.kind !== "files") throw new Error("expected steps over files");
    expect(asked.project.retry).toEqual({ kind: "remove", ids: ["visit"], cascade: true });
    const planned = sessions.planSteps(containersFile, asked.project.steps);
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.code).toBe("edit.has-dependents");
    // The containers view drew `customer` for `visit` alone: it leaves with its `place`.
    expect(planned.dependents!.map((d) => d.description).sort()).toEqual([
      "`customer` no longer drawn in the view `containers`",
      expect.stringMatching(/^`visit` drawn in the view `context` on line \d+$/),
      expect.stringMatching(/^place `customer` on line \d+$/),
      expect.stringMatching(/^relation `buys` on line \d+$/),
    ]);
    canvas.apply(asked.project.retry!);
    expect(text(modelFile)).not.toContain("as visit");
    expect(text(contextFile)).not.toContain("as buys");
    expect(text(containersFile)).not.toContain("place customer");
    for (const file of [modelFile, containersFile, contextFile]) expect(errors(file)).toEqual([]);
  });
});

describe("routes of a model in another file of the project", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-c4-routes-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), root, { recursive: true });
  const slash = (path: string) => path.split(sep).join("/");
  const modelFile = slash(join(root, "models", "commerce.meltemi"));
  const containersFile = slash(join(root, "diagrams", "containers.meltemi"));
  const contextFile = slash(join(root, "diagrams", "context.meltemi"));
  const text = (file: string) => readFileSync(file, "utf8");
  // The container view lists what it draws and routes `visit`, as Arrange writes routes.
  writeFileSync(
    containersFile,
    text(containersFile)
      .replace(
        '  label shop.api "API de pedidos"\n',
        '  include customer, shop.web, shop.api, shop.db, bank\n  label shop.api "API de pedidos"\n',
      )
      .replace(
        "    place bank at (218, 1107)\n",
        "    place bank at (218, 1107)\n    route visit from customer.south to shop.web via [(141, 200)]\n",
      ),
  );
  const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
  const errors = (file: string) =>
    sessions.analyze(file).diagnostics.filter((d) => d.severity === "error");
  const canvas = new CanvasSession({ path: containersFile, project: () => true });
  canvas.update(sessions.analyze(containersFile));
  canvas.receive({ type: "pickDiagram", diagram: "containers" });
  const steps = (action: CanvasAction) => {
    const result = canvas.receive({ type: "action", revision: 0, action });
    if (result.project?.kind !== "files") throw new Error(JSON.stringify(result.messages));
    return sessions.planSteps(containersFile, result.project.steps);
  };
  const apply = (action: CanvasAction) => {
    const planned = steps(action);
    if (!planned.ok) throw new Error(planned.reason);
    for (const [path, edits] of planned.edits) {
      writeFileSync(path, applyTextEdits(text(path), edits));
      sessions.forFile(path).invalidate(path);
    }
    canvas.update(sessions.analyze(containersFile));
  };

  it("rewrites the route of the view's file when the end moves in the model's file", () => {
    apply({ kind: "setEnd", relation: "visit", end: "to", element: "shop.api", port: null });
    expect(text(modelFile)).toContain('  customer -> shop.api: "Compra" as visit\n');
    expect(text(containersFile)).toContain(
      "    route visit from customer.south to shop.api via [(141, 200)]\n",
    );
    apply({ kind: "setEnd", relation: "visit", end: "to", element: "shop.db", port: "west" });
    expect(text(containersFile)).toContain(
      "    route visit from customer.south to shop.db.west via [(141, 200)]\n",
    );
    for (const file of [modelFile, containersFile, contextFile]) expect(errors(file)).toEqual([]);
  });

  it("refuses a reconnect that would break a view of a file nobody wrote", () => {
    // The context view combines `customer -> shop` for `visit` alone: at the bank, it would
    // stand for nothing.
    const before = [modelFile, containersFile, contextFile].map(text);
    const planned = steps({
      kind: "setEnd",
      relation: "visit",
      end: "to",
      element: "bank",
      port: null,
    });
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toMatch(/No relation of the model goes from `customer` to `shop`/);
    expect([modelFile, containersFile, contextFile].map(text)).toEqual(before);
  });
});

describe("the language of a project", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-c4-locale-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "diagrams"));
  writeFileSync(
    join(root, "project.json"),
    JSON.stringify({ name: "p", language: "0.2", sources: ["diagrams"], locale: "es" }),
  );
  writeFileSync(join(root, "diagrams", "commerce.meltemi"), commerce);
  const file = join(root, "diagrams", "commerce.meltemi").split(sep).join("/");
  const drawn = (sessions: ProjectSessions) => {
    const analysis = sessions.analyze(file);
    const view = analysis.diagrams.find((d) => d.id === "containers")!;
    return JSON.stringify(view.layout);
  };

  it("draws the C4 type lines in the project's locale", () => {
    const text = drawn(new ProjectSessions({ toolVersion: "1.0.0" }));
    expect(text).toContain("[Contenedor: React]");
    expect(text).not.toContain("[Container: React]");
  });

  it("lets the sessions' own locale win, as --lang does", () => {
    const text = drawn(new ProjectSessions({ toolVersion: "1.0.0", locale: "en" }));
    expect(text).toContain("[Container: React]");
  });
});
