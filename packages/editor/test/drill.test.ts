import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { toProjectPath } from "@meltemi/diagrams-project/node";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { layoutIn } from "../src/layouts.js";
import { ProjectSessions, viewClosure, viewRefKey, type ViewRef } from "../src/node.js";

const temp = mkdtempSync(join(tmpdir(), "meltemi-drill-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** The closure of a diagram of a project folder, laid out by the project's sessions. */
function closure(folder: string, file: string, id: string) {
  const projects = new ProjectSessions({ toolVersion: "1.0.0" });
  const workspace = projects.forFolder(toProjectPath(folder));
  const program = workspace.compileProject();
  const sources = workspace.sources();
  const path = sources.find((p) => p.endsWith(file))!;
  const owner = program.files.get(path)!;
  const diagram = owner.compilation.document.diagrams.find((d) => d.id === id)!;
  // The same layout the exports use: the file's themes, the project's fonts and engine.
  const lay = (view: ViewRef) =>
    layoutIn(workspace, projects, view.owner, view.diagram, null, undefined);
  const root = { owner, diagram };
  const result = viewClosure(program, sources, root, lay(root)!, lay);
  const name = (key: string) => key.slice(key.lastIndexOf("/") + 1);
  return {
    root: name(result.root),
    views: [...result.views.keys()].map(name),
    opens: Object.fromEntries(
      [...result.opens].map(([key, targets]) => [
        name(key),
        Object.fromEntries(
          Object.entries(targets).map(([element, t]) => [element, { ...t, view: name(t.view) }]),
        ),
      ]),
    ),
  };
}

function project(name: string, files: Record<string, string>): string {
  const folder = join(temp, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

describe("the views a drill-down reaches", () => {
  it("opens the container view of a system and the component view of a container", () => {
    const result = closure(join(CORPUS_ROOT, "valid", "c4"), "commerce.meltemi", "context");
    expect(result.root).toBe("commerce.meltemi#context");
    expect(result.views).toEqual(["commerce.meltemi#containers", "commerce.meltemi#components"]);
    expect(result.opens["commerce.meltemi#context"]).toEqual({
      shop: { view: "commerce.meltemi#containers", element: null, transition: "morph" },
    });
    expect(result.opens["commerce.meltemi#containers"]).toEqual({
      "shop.api": { view: "commerce.meltemi#components", element: null, transition: "morph" },
    });
  });

  it("finds child views in other files through the model's imports", () => {
    const folder = join(CORPUS_ROOT, "projects", "valid", "architecture");
    const result = closure(folder, "context.meltemi", "context");
    expect(result.views).toEqual(["containers.meltemi#containers"]);
    expect(result.opens["context.meltemi#context"]).toEqual({
      shop: { view: "containers.meltemi#containers", element: null, transition: "morph" },
    });
    // Participants linked to entities without a child view open nothing.
    expect(closure(folder, "purchase.meltemi", "purchase").views).toEqual([]);
  });

  it("follows links between diagrams, cycles included, and skips views with errors", () => {
    const folder = project("cycle", {
      "project.json": '{ "name": "cycle", "language": "0.2" }',
      "a.meltemi": `language "0.2"

diagram a: flow {
  api["API"] { link b.gateway }
}

diagram b: flow {
  gateway["Gateway"] { link a.api }
  db["DB"] { link broken.db }
}

diagram broken: flow {
  db["DB"] { colour nope }
}
`,
    });
    const result = closure(folder, "a.meltemi", "a");
    expect(result.views).toEqual(["a.meltemi#b"]);
    expect(result.opens["a.meltemi#a"]).toEqual({
      api: { view: "a.meltemi#b", element: "gateway", transition: "fade" },
    });
    expect(result.opens["a.meltemi#b"]).toEqual({
      gateway: { view: "a.meltemi#a", element: "api", transition: "fade" },
    });
  });

  it("keys views by file and id, and gives the same closure twice", () => {
    const first = closure(join(CORPUS_ROOT, "valid", "c4"), "commerce.meltemi", "context");
    const second = closure(join(CORPUS_ROOT, "valid", "c4"), "commerce.meltemi", "context");
    expect(second).toEqual(first);
    expect(viewRefKey({ owner: { path: "/p/a.meltemi" }, diagram: { id: "x" } } as ViewRef)).toBe(
      "/p/a.meltemi#x",
    );
  });
});
