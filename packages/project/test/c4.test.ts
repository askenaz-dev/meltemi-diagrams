import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  Workspace,
  createMemoryHost,
  renameEntityInProject,
  type FileCompilation,
} from "../src/index.js";

const TOOL = { toolVersion: "1.0.0" };
const project = join(CORPUS_ROOT, "projects", "valid", "architecture");
const read = (path: string) => readFileSync(join(project, path), "utf8");

const FILES: Record<string, string> = {
  "models/commerce.meltemi": read("models/commerce.meltemi"),
  "diagrams/containers.meltemi": read("diagrams/containers.meltemi"),
  "diagrams/context.meltemi": read("diagrams/context.meltemi"),
  "diagrams/purchase.meltemi": read("diagrams/purchase.meltemi"),
};

function workspace(files: Record<string, string>): Workspace {
  const manifest = JSON.stringify({ name: "test", language: "0.2" });
  const entries = Object.entries(files).map(([path, content]) => [`/p/${path}`, content]);
  const host = createMemoryHost({ "/p/project.json": manifest, ...Object.fromEntries(entries) });
  return new Workspace(host, "/p", TOOL);
}

function file(ws: Workspace, path: string): FileCompilation {
  return ws.compileFile(`/p/${path}`).files.get(`/p/${path}`)!;
}

describe("views of imported models", () => {
  it("compiles a view in another file against the model", () => {
    const ws = workspace(FILES);
    const containers = file(ws, "diagrams/containers.meltemi");
    expect(containers.diagnostics).toEqual([]);
    const view = containers.compilation.document.diagrams[0]!;
    expect(view.hasErrors).toBe(false);
    expect(view.elements.map((e) => e.id)).toEqual([
      "shop",
      "customer",
      "shop.web",
      "shop.api",
      "shop.db",
      "bank",
    ]);
    expect(view.elementsById.get("shop.api")!.entity).toEqual({
      model: "commerce",
      path: "shop.api",
      file: "/p/models/commerce.meltemi",
    });
    const context = file(ws, "diagrams/context.meltemi").compilation.document.diagrams[0]!;
    expect(context.relationsByKey.get("buys")!.sources).toEqual(["visit"]);
  });

  it("reports problems of the view in its own file", () => {
    const ws = workspace({
      ...FILES,
      "diagrams/containers.meltemi": FILES["diagrams/containers.meltemi"]!.replace(
        "  direction TB\n",
        "  direction TB\n  include shop.apx\n",
      ),
    });
    const containers = file(ws, "diagrams/containers.meltemi");
    expect(containers.diagnostics.map((d) => d.code)).toContain("ref.unknown-entity");
  });

  it("reports an imported name that is not a model", () => {
    const ws = workspace({
      ...FILES,
      "diagrams/context.meltemi": FILES["diagrams/context.meltemi"]!.replace(
        "using models.commerce",
        "using models.shop",
      ),
    });
    const context = file(ws, "diagrams/context.meltemi");
    expect(context.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-model"]);
    expect(context.diagnostics[0]!.hints![0]).toMatch(/models\.commerce/);
  });

  it("gives participants linked to entities the entities' labels", () => {
    const purchase = file(workspace(FILES), "diagrams/purchase.meltemi");
    expect(purchase.diagnostics).toEqual([]);
    const diagram = purchase.compilation.document.diagrams[0]!;
    expect(diagram.elements.map((e) => e.label)).toEqual(["Cliente", "API", "Banco"]);
  });
});

describe("renames across the project", () => {
  it("renames an entity in the model, the views and the links of every file", () => {
    const all = workspace(FILES).compileProject();
    const result = renameEntityInProject(
      all,
      { file: "/p/models/commerce.meltemi", id: "commerce" },
      "shop.api",
      "orders",
    );
    if (!result.ok) throw new Error(result.reason);
    const edited = new Map<string, string>();
    for (const [path, edits] of result.edits) {
      edited.set(path.slice(3), applyTextEdits(FILES[path.slice(3)]!, edits));
    }
    expect([...edited.keys()].sort()).toEqual([
      "diagrams/containers.meltemi",
      "diagrams/purchase.meltemi",
      "models/commerce.meltemi",
    ]);
    expect(edited.get("models/commerce.meltemi")).toContain('container orders "API"');
    expect(edited.get("models/commerce.meltemi")).toContain("shop.web -> shop.orders");
    expect(edited.get("diagrams/containers.meltemi")).toContain(
      'label shop.orders "API de pedidos"',
    );
    expect(edited.get("diagrams/purchase.meltemi")).toContain("link commerce.shop.orders");
    const after = workspace({ ...FILES, ...Object.fromEntries(edited) });
    for (const path of Object.keys(FILES)) expect(file(after, path).diagnostics).toEqual([]);
  });

  it("refuses a conflicting id", () => {
    const all = workspace(FILES).compileProject();
    const result = renameEntityInProject(
      all,
      { file: "/p/models/commerce.meltemi", id: "commerce" },
      "shop.api",
      "web",
    );
    expect(result.ok).toBe(false);
  });
});
