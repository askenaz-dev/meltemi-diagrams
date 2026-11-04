import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  THEMES,
  c4TypeLine,
  c4TypeName,
  layoutDiagram,
  type GroupItem,
  type SceneItem,
} from "../src/index.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
const engine = gridEngine;

function view(id: string, text = commerce) {
  const compilation = compile(text);
  const diagram = compilation.document.diagrams.find((d) => d.id === id)!;
  const result = layoutDiagram(compilation, diagram, { engine });
  expect(result.scene).not.toBeNull();
  return result;
}

function group(items: readonly SceneItem[], id: string, role: string): GroupItem | undefined {
  for (const item of items) {
    if (item.kind !== "group") continue;
    if (item.id === id && item.role === role) return item;
    const inner = group(item.items, id, role);
    if (inner) return inner;
  }
  return undefined;
}

const texts = (item: GroupItem | undefined): string[] =>
  (item?.items ?? []).flatMap((i) =>
    i.kind === "text" ? [i.text] : i.kind === "group" ? texts(i) : [],
  );

describe("C4 views on the flow layout", () => {
  it("lays out the proposal's container view with the boundary around its containers", () => {
    const result = view("containers");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect([...result.boxes!.keys()]).toEqual(
      expect.arrayContaining(["shop", "shop.web", "shop.api", "shop.db"]),
    );
    const boundary = result.boxes!.get("shop")!;
    const web = result.boxes!.get("shop.web")!;
    expect(web.x).toBeGreaterThan(boundary.x);
    expect(web.x + web.width).toBeLessThan(boundary.x + boundary.width);
  });

  it("draws type lines, persons and the boundary title", () => {
    const scene = view("containers").scene!;
    expect(texts(group(scene.items, "shop.web", "element"))).toEqual(["Web", "[Container: React]"]);
    expect(texts(group(scene.items, "customer", "element"))).toEqual([
      "Cliente",
      "[Person]",
      "Compra en línea",
    ]);
    expect(texts(group(scene.items, "shop", "element"))[0]).toBe("Commerce [Software System]");
    const db = group(scene.items, "shop.db", "element")!;
    expect(db.items.filter((i) => i.kind === "path").length).toBeGreaterThanOrEqual(2);
    const context = view("context").scene!;
    expect(texts(group(context.items, "bank", "element"))).toEqual([
      "Banco",
      "[External Software System]",
      "Autoriza tarjetas",
    ]);
  });

  it("colours kinds from the theme, and a style wins", () => {
    const styled = commerce.replace(
      '  label shop.api "API de pedidos"\n',
      '  label shop.api "API de pedidos"\n  style shop.api { fill "#ffffff" }\n',
    );
    const scene = view("containers", styled).scene!;
    const fillOf = (id: string) => {
      const shape = group(scene.items, id, "element")!.items[0]!;
      return shape.kind === "rect" || shape.kind === "path" ? shape.fill : undefined;
    };
    const theme = THEMES["editorial.light"]!;
    expect(fillOf("shop.web")).toBe(theme.info);
    expect(fillOf("shop.api")).toBe("#ffffff");
  });

  it("shows a relation's technology on a second line", () => {
    const scene = view("containers").scene!;
    const label = group(scene.items, "request", "label");
    expect(texts(label)).toEqual(["HTTPS", "[JSON/HTTPS]"]);
  });

  it("checks persons, systems, containers and stores for overlaps like boxes", () => {
    const sheet = (bank: string) =>
      `language "0.2"\nmodel m {\n  person user "User"\n  system shop "Shop" {\n    container api "API"\n    datastore db "DB"\n  }\n  system bank "Bank" { external }\n  user -> shop.api: "Uses"\n  shop.api -> shop.db: "Reads"\n  shop.api -> bank: "Pays"\n}\ndiagram v: c4 using m {\n  level container\n  scope shop\n  include user, shop.api, shop.db, bank\n  layout manual\n  placement {\n    place user at (100, 200)\n    place shop.api at (400, 200)\n    place shop.db at (700, 200)\n    place bank at ${bank}\n  }\n}\n`;
    expect(view("v", sheet("(1000, 200)")).diagnostics).toEqual([]);
    // Over the boundary of the system it is not part of.
    expect(
      view("v", sheet("(550, 200)")).diagnostics.map((d) => [d.code, d.message]),
    ).toContainEqual([
      "layout.overlap",
      "`bank` overlaps the group `shop`, which does not declare it.",
    ]);
    // Over a person.
    expect(
      view("v", sheet("(150, 220)")).diagnostics.map((d) => [d.code, d.data?.ids]),
    ).toContainEqual(["layout.overlap", ["user", "bank"]]);
  });
});

describe("C4 type words", () => {
  const compilation = compile(commerce);
  const containers = compilation.document.diagrams.find((d) => d.id === "containers")!;
  const context = compilation.document.diagrams.find((d) => d.id === "context")!;
  const element = (diagram: typeof containers, id: string) => diagram.elementsById.get(id)!;

  it("names the kind in the content language, without brackets or technology", () => {
    expect(c4TypeName(element(containers, "shop.api"))).toBe("Container");
    expect(c4TypeName(element(containers, "shop.api"), "es")).toBe("Contenedor");
    expect(c4TypeName(element(containers, "shop.db"))).toBe("Container");
    expect(c4TypeName(element(context, "bank"))).toBe("External Software System");
    expect(c4TypeLine(element(containers, "shop.api"))).toBe("[Container: HTTP]");
  });

  it("has no word for the boundary or for elements that draw no entity", () => {
    expect(c4TypeName(element(containers, "shop"))).toBeNull();
    expect(c4TypeName({ entity: null, kind: "node", external: false })).toBeNull();
  });
});
