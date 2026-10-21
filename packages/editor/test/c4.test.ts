import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    const refused = canvas.act({ kind: "create", elementKind: "container", at: { x: 0, y: 0 } });
    expect(refused.messages[0]).toMatchObject({ type: "rejected" });
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
