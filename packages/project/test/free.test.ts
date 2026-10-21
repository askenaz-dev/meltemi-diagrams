import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import {
  Workspace,
  createMemoryHost,
  resolveImagePath,
  type FileCompilation,
} from "../src/index.js";

const TOOL = { toolVersion: "1.0.0" };

function png(width: number, height: number): Uint8Array {
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
  out.push(...[0x49, 0x48, 0x44, 0x52]);
  for (const n of [width, height])
    out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  out.push(8, 6, 0, 0, 0);
  return new Uint8Array(out);
}

function workspace(files: Record<string, string | Uint8Array>): Workspace {
  const manifest = JSON.stringify({ name: "test", language: "0.2" });
  const entries = Object.entries(files).map(([path, content]) => [`/p/${path}`, content]);
  const host = createMemoryHost({ "/p/project.json": manifest, ...Object.fromEntries(entries) });
  return new Workspace(host, "/p", TOOL);
}

function file(ws: Workspace, path: string): FileCompilation {
  return ws.compileFile(`/p/${path}`).files.get(`/p/${path}`)!;
}

const codes = (f: FileCompilation) => f.diagnostics.map((d) => d.code);

const sheet = (path: string) =>
  `diagram d: free {\n  image logo "${path}"\n  placement {\n    place logo at (200, 100)\n  }\n}\n`;

describe("project images", () => {
  it("reads an image relative to the file", () => {
    const ws = workspace({
      "diagrams/sheet.meltemi": sheet("logo.png"),
      "diagrams/logo.png": png(320, 80),
    });
    expect(codes(file(ws, "diagrams/sheet.meltemi"))).toEqual([]);
    const found = ws.image("/p/diagrams/logo.png");
    expect(found).toMatchObject({
      status: "found",
      image: { format: "png", width: 320, height: 80 },
    });
    if (found.status === "found") expect(found.image.href).toMatch(/^data:image\/png;base64,/);
  });

  it("reports a missing image on the path", () => {
    const ws = workspace({ "sheet.meltemi": sheet("missing.png") });
    const f = file(ws, "sheet.meltemi");
    expect(codes(f)).toEqual(["asset.unknown-image"]);
    const d = f.diagnostics[0]!;
    expect(f.compilation.text.slice(d.range.start.offset, d.range.end.offset)).toBe(
      '"missing.png"',
    );
  });

  it("reports a file that is not an image", () => {
    const ws = workspace({ "sheet.meltemi": sheet("notes.png"), "notes.png": "just text" });
    const f = file(ws, "sheet.meltemi");
    expect(codes(f)).toEqual(["asset.unsupported-image"]);
    expect(f.diagnostics[0]!.message).toContain("not a PNG");
  });

  it("reports a path that leaves the project", () => {
    const ws = workspace({ "sheet.meltemi": sheet("../../outside.png") });
    expect(codes(file(ws, "sheet.meltemi"))).toEqual(["asset.outside-project"]);
  });

  it("checks paths without reading them", () => {
    expect(resolveImagePath("/p", "/p/a/s.meltemi", "img/x.png")).toEqual({
      ok: true,
      path: "/p/a/img/x.png",
    });
    expect(resolveImagePath("/p", "/p/s.meltemi", "../x.png")).toMatchObject({ ok: false });
  });

  it("resolves images for the layout and sees changes after invalidation", () => {
    const host = createMemoryHost({
      "/p/project.json": JSON.stringify({ name: "t", language: "0.2" }),
      "/p/sheet.meltemi": sheet("logo.png"),
      "/p/logo.png": png(100, 50),
    });
    const ws = new Workspace(host, "/p", TOOL);
    const f = file(ws, "sheet.meltemi");
    const result = layoutDiagram(f.compilation, f.compilation.document.diagrams[0]!, {
      images: ws.imageResolver("/p/sheet.meltemi"),
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.boxes!.get("logo")).toMatchObject({ width: 100, height: 50 });
    expect(ws.image("/p/logo.png")).toMatchObject({ image: { width: 100 } });
    ws.invalidate("/p/logo.png");
    expect(ws.image("/p/logo.png")).toMatchObject({ status: "found" });
  });
});

describe("links through imports", () => {
  const views = 'diagram checkout: flow {\n  api["API"]\n  api -> db\n}\n';
  const orders = 'diagram checkout: flow {\n  db[("Orders")]\n}\n';

  it("resolves a namespace link and a member link", () => {
    const ws = workspace({
      "views.meltemi": views,
      "orders.meltemi": orders,
      "slide.meltemi":
        'import "./views.meltemi" as views\nimport checkout as co from "./orders.meltemi"\n\ndiagram s: free {\n  box a "A" { link views.checkout.api }\n  box b "B" { link co.db }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }\n}\n',
    });
    expect(codes(file(ws, "slide.meltemi"))).toEqual([]);
  });

  it("reports unknown diagrams and elements in imported files", () => {
    const ws = workspace({
      "views.meltemi": views,
      "orders.meltemi": orders,
      "slide.meltemi":
        'import "./views.meltemi" as views\nimport checkout as co from "./orders.meltemi"\n\ndiagram s: free {\n  box a "A" { link views.other.api }\n  box b "B" { link co.ghost }\n  box c "C" { link views.api }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n    place c at (700, 100)\n  }\n}\n',
    });
    const f = file(ws, "slide.meltemi");
    expect(codes(f)).toEqual(["ref.unknown-link", "ref.unknown-link", "ref.unknown-link"]);
    expect(f.diagnostics.map((d) => d.message)).toEqual([
      "`views.meltemi` has no diagram or model `other`.",
      "`checkout` in `orders.meltemi` has no element `ghost`.",
      "`views` is a namespace; write `link views.<diagram>.<element>` or `link views.<model>.<entity>`.",
    ]);
  });

  it("counts a link as a use of its import", () => {
    const ws = workspace({
      "views.meltemi": views,
      "slide.meltemi":
        'import "./views.meltemi" as views\n\ndiagram s: free {\n  box a "A" { link views.checkout.api }\n  placement {\n    place a at (100, 100)\n  }\n}\n',
    });
    expect(codes(file(ws, "slide.meltemi"))).toEqual([]);
  });
});
