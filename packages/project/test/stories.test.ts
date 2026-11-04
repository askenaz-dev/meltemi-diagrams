import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  Workspace,
  createMemoryHost,
  renameEntityInProject,
  renameInImportingStories,
  type FileCompilation,
} from "../src/index.js";

const TOOL = { toolVersion: "1.0.0" };
const architecture = join(CORPUS_ROOT, "projects", "valid", "architecture");
const read = (path: string) => readFileSync(join(architecture, path), "utf8");

function workspace(files: Record<string, string>): Workspace {
  const manifest = JSON.stringify({ name: "test", language: "0.2" });
  const entries = Object.entries(files).map(([path, content]) => [`/p/${path}`, content]);
  const host = createMemoryHost({ "/p/project.json": manifest, ...Object.fromEntries(entries) });
  return new Workspace(host, "/p", TOOL);
}

function file(ws: Workspace, path: string): FileCompilation {
  return ws.compileFile(`/p/${path}`).files.get(`/p/${path}`)!;
}

function applied(
  files: Record<string, string>,
  edits: ReadonlyMap<string, readonly { start: number; end: number; newText: string }[]>,
) {
  const edited: Record<string, string> = {};
  for (const [path, list] of edits)
    edited[path.slice(3)] = applyTextEdits(files[path.slice(3)]!, list);
  return edited;
}

const FLOW: Record<string, string> = {
  "diagrams/checkout.meltemi": [
    'language "0.2"',
    "diagram checkout: flow {",
    "  node api",
    "  node db",
    "  api -> db as save",
    "}",
    "",
  ].join("\n"),
  "stories/tour.meltemi": [
    'language "0.2"',
    'import checkout from "../diagrams/checkout.meltemi"',
    "story tour for checkout {",
    "  scene one {",
    "    reveal api, db",
    "    trace save",
    "  }",
    "}",
    "",
  ].join("\n"),
};

describe("stories of imported diagrams", () => {
  it("resolve the diagram and keep its file in their references", () => {
    const tour = file(workspace(FLOW), "stories/tour.meltemi");
    expect(tour.diagnostics).toEqual([]);
    const story = tour.compilation.document.stories[0]!;
    expect(story.target.file).toBe("/p/diagrams/checkout.meltemi");
    expect(story.references.map((r) => [r.file, r.id])).toEqual([
      ["/p/diagrams/checkout.meltemi", "api"],
      ["/p/diagrams/checkout.meltemi", "db"],
      ["/p/diagrams/checkout.meltemi", "save"],
    ]);
  });

  it("report unknown targets of the imported view", () => {
    const tour = file(
      workspace({
        ...FLOW,
        "stories/tour.meltemi": FLOW["stories/tour.meltemi"]!.replace("api, db", "api, dv"),
      }),
      "stories/tour.meltemi",
    );
    expect(tour.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-element"]);
  });

  it("follow a rename of an element or relation of the diagram", () => {
    const program = workspace(FLOW).compileProject();
    const element = renameInImportingStories(
      program,
      "/p/diagrams/checkout.meltemi",
      "checkout",
      "db",
      "store",
    );
    expect(applied(FLOW, element)["stories/tour.meltemi"]).toContain("    reveal api, store\n");
    const relation = renameInImportingStories(
      program,
      "/p/diagrams/checkout.meltemi",
      "checkout",
      "save",
      "persist",
      "relation",
    );
    expect(applied(FLOW, relation)["stories/tour.meltemi"]).toContain("    trace persist\n");
    // The file of the diagram is left to the rename planned in it.
    expect(element.has("/p/diagrams/checkout.meltemi")).toBe(false);
  });

  it("follow a rename of an entity of the model of their views", () => {
    const files = {
      "models/commerce.meltemi": read("models/commerce.meltemi"),
      "diagrams/containers.meltemi": read("diagrams/containers.meltemi"),
      "diagrams/context.meltemi": read("diagrams/context.meltemi"),
      "stories/tour.meltemi": read("stories/tour.meltemi"),
    };
    expect(file(workspace(files), "stories/tour.meltemi").diagnostics).toEqual([]);
    const result = renameEntityInProject(
      workspace(files).compileProject(),
      { file: "/p/models/commerce.meltemi", id: "commerce" },
      "shop.api",
      "orders",
    );
    if (!result.ok) throw new Error(result.reason);
    const edited = applied(files, result.edits);
    expect(edited["stories/tour.meltemi"]).toContain("    reveal shop.web, shop.orders, shop.db\n");
    expect(edited["stories/tour.meltemi"]).toContain("    camera shop.orders, shop.db\n");
    const after = workspace({ ...files, ...edited });
    for (const path of Object.keys(files)) expect(file(after, path).diagnostics).toEqual([]);
  });
});
