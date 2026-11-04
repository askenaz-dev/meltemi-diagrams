import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { CatalogData, DiagramEntry, StoryEntry } from "@meltemi/diagrams-catalog";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { CLI_VERSION, run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-catalog-cli-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ARCHITECTURE = join(CORPUS_ROOT, "projects", "valid", "architecture");

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: scratch,
  });
  return { code, stdout, stderr };
}

/** A copy of the architecture project under the scratch folder, with project.json changed. */
function copy(name: string, manifest: Record<string, unknown> = {}): string {
  const root = join(scratch, name);
  cpSync(ARCHITECTURE, root, { recursive: true });
  const path = join(root, "project.json");
  const current = JSON.parse(readFileSync(path, "utf8"));
  delete current.$schema;
  writeFileSync(path, JSON.stringify({ ...current, ...manifest }));
  return root;
}

function dataOf(html: string): CatalogData {
  const json = /<script type="application\/json" id="meltemi-catalog">(.*)<\/script>/.exec(html)!;
  return JSON.parse(json[1]!) as CatalogData;
}

describe("build catalog", () => {
  it("writes the catalog of a project with its views, story and entities", () => {
    const { code, stdout, stderr } = mdg("build", "catalog", ARCHITECTURE, "--out", "arch");
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toMatch(
      /^Wrote arch[\\/]index\.html \(3 diagrams, 1 story, 6 entities; \d+ KB\)\n$/,
    );
    const html = readFileSync(join(scratch, "arch", "index.html"), "utf8");
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
    const data = dataOf(html);
    expect(data.title).toBe("architecture");
    expect(data.generator).toBe(`Meltemi Diagrams ${CLI_VERSION}`);
    expect(data.entries.map((e) => e.key)).toEqual([
      "diagrams/containers/containers",
      "diagrams/context/context",
      "diagrams/purchase/purchase",
      "stories/tour/tour",
    ]);
    const tour = data.entries.find((e) => e.kind === "story") as StoryEntry;
    expect(tour.shows).toEqual(["diagrams/context/context", "diagrams/containers/containers"]);
    expect(Object.keys(tour.document.views)).toEqual(["context", "containers"]);
    const api = data.entities.find((e) => e.key === "models/commerce/commerce/shop.api")!;
    expect(api.shownIn).toEqual([
      { entry: "diagrams/containers/containers", element: "shop.api" },
      { entry: "diagrams/purchase/purchase", element: "api" },
    ]);
    const purchase = data.entries.find((e) => e.id === "purchase") as DiagramEntry;
    expect(purchase.elements.find((e) => e.id === "bank")!.target).toEqual({
      kind: "entity",
      entity: "models/commerce/commerce/bank",
    });
  });

  it("gives the same file for the same sources", () => {
    mdg("build", "catalog", ARCHITECTURE, "--out", "twice/a.html");
    mdg("build", "catalog", ARCHITECTURE, "--out", "twice/b.html");
    expect(readFileSync(join(scratch, "twice", "a.html"))).toEqual(
      readFileSync(join(scratch, "twice", "b.html")),
    );
  });

  it("keeps comments, source and local paths out unless the source is asked for", () => {
    const root = copy("private");
    const file = join(root, "diagrams", "context.meltemi");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        'language "0.2"',
        'language "0.2"\n\n// internal: rotate keys on Friday',
      ),
    );
    expect(mdg("build", "catalog", root).code).toBe(0);
    const html = readFileSync(join(root, "catalog", "index.html"), "utf8");
    expect(html).not.toContain("rotate keys");
    for (const local of [scratch, scratch.replace(/\\/g, "/"), tmpdir(), "Users"]) {
      expect(html).not.toContain(local);
    }
    expect(dataOf(html).sources).toBeNull();
    const shared = mdg("build", "catalog", root, "--source", "--out", "shared.html");
    expect(shared.code).toBe(0);
    const sources = dataOf(readFileSync(join(scratch, "shared.html"), "utf8")).sources!;
    expect(Object.keys(sources)).toEqual([
      "diagrams/containers.meltemi",
      "diagrams/context.meltemi",
      "diagrams/purchase.meltemi",
      "stories/tour.meltemi",
    ]);
    expect(sources["diagrams/context.meltemi"]).toContain("rotate keys on Friday");
  });

  it("follows the catalog settings and warns about excluded diagrams that stories show", () => {
    const root = copy("settings", {
      catalog: {
        title: "Shop",
        description: "Views of the shop.",
        out: "public/site.html",
        exclude: ["diagrams/purchase.meltemi", "diagrams/context.meltemi#context"],
      },
    });
    const { code, stdout, stderr } = mdg("build", "catalog", join(root, "stories", "tour.meltemi"));
    expect(code).toBe(0);
    expect(stdout).toMatch(/^Wrote settings[\\/]public[\\/]site\.html \(1 diagram, 1 story/);
    expect(stderr).toContain(
      "warning: stories/tour.meltemi#tour shows diagrams/context.meltemi#context, which is excluded; the story still draws it.",
    );
    const data = dataOf(readFileSync(join(root, "public", "site.html"), "utf8"));
    expect(data).toMatchObject({ title: "Shop", description: "Views of the shop." });
    expect(data.entries.map((e) => e.key)).toEqual([
      "diagrams/containers/containers",
      "stories/tour/tour",
    ]);
    expect(mdg("build", "catalog", root, "--title", "Other", "--out", "t.html").code).toBe(0);
    expect(dataOf(readFileSync(join(scratch, "t.html"), "utf8")).title).toBe("Other");
  });

  it("skips what cannot be drawn and exits 1", () => {
    const root = copy("broken");
    writeFileSync(
      join(root, "diagrams", "broken.meltemi"),
      'language "0.2"\n\ndiagram broken: flow {\n  a -> \n}\n',
    );
    const { code, stdout, stderr } = mdg("build", "catalog", root, "--out", "broken.html");
    expect(code).toBe(1);
    expect(stdout).toContain("broken.meltemi:");
    expect(stdout).toMatch(/Wrote broken\.html \(3 diagrams, 1 story/);
    expect(stderr).toMatch(
      /skipped broken[\\/]diagrams[\\/]broken\.meltemi#broken: it has errors\./,
    );
  });

  it("refuses usage errors and projects with nothing to catalog", () => {
    const empty = join(scratch, "empty");
    mkdirSync(empty);
    writeFileSync(join(empty, "project.json"), '{ "name": "empty", "language": "0.2" }');
    const nothing = mdg("build", "catalog", empty);
    expect(nothing.code).toBe(2);
    expect(nothing.stderr).toContain("has no diagram or story to catalog");
    expect(existsSync(join(empty, "catalog"))).toBe(false);
    expect(mdg("build", "site").stderr).toContain('unknown target "site"; the only one is catalog');
    expect(mdg("build", "catalog", "missing").code).toBe(2);
    expect(mdg("build", "catalog", "a", "b").code).toBe(2);
    expect(mdg("build", "catalog", empty, "--title", " ").code).toBe(2);
    expect(mdg("build").code).toBe(2);
    expect(mdg("build", "--help").stdout).toContain("Usage: build catalog [path]");
  });
});
