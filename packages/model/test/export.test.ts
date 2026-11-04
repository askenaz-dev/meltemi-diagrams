import { describe, expect, it } from "vitest";
import { compile, effectsEnd, isSafeUrl, toJson } from "../src/index.js";

const BASE = [
  'language "0.2"',
  "diagram checkout: flow {",
  '  api["API"] { url "https://docs.example.com/api" }',
  "  node db",
  "  api -> db as save",
  "}",
  "story tour for checkout {",
  "  scene one { reveal api, db over 800ms }",
  "}",
  "",
].join("\n");
const withProfile = (body: string, target = "checkout") =>
  compile(`${BASE}export p for ${target} {\n${body}\n}\n`);
const codes = (c: ReturnType<typeof compile>) => c.diagnostics.map((d) => d.code);

describe("export profiles", () => {
  it("compiles every option of a PNG profile", () => {
    const compilation = withProfile(
      '  format png\n  scale 2\n  size (1920, 1080)\n  background transparent\n  at 1.5s\n  theme "stage.dark"\n  file "out/checkout.png"',
    );
    expect(codes(compilation)).toEqual([]);
    expect(compilation.document.exports[0]).toMatchObject({
      id: "p",
      target: { name: "checkout", kind: "diagram" },
      format: "png",
      scale: 2,
      size: { width: 1920, height: 1080 },
      background: "transparent",
      atMs: 1500,
      theme: "stage.dark",
      file: "out/checkout.png",
    });
    expect(toJson(compilation).exports[0]).toMatchObject({
      id: "p",
      targetKind: "diagram",
      format: "png",
    });
  });

  it("targets stories, with their own rules", () => {
    const fine = withProfile('  format pdf\n  at 500ms\n  link "tour.html"', "tour");
    expect(codes(fine)).toEqual([]);
    expect(fine.document.exports[0]!.target.kind).toBe("story");
    expect(codes(withProfile("  format svg\n  motion animated", "tour"))).toEqual([
      "export.invalid-option",
    ]);
    expect(codes(withProfile("  format png\n  at 2s", "tour"))).toEqual(["export.invalid-option"]);
    // A story's video lasts as long as the story.
    expect(codes(withProfile("  format mp4", "tour"))).toEqual([]);
  });

  it("refuses options of other formats and unsafe values", () => {
    expect(codes(withProfile("  format pdf\n  scale 2"))).toEqual(["export.invalid-option"]);
    expect(codes(withProfile('  format png\n  file "out/x.pdf"'))).toEqual([
      "export.invalid-option",
    ]);
    expect(codes(withProfile('  format png\n  file "../x.png"'))).toEqual(["prop.invalid-value"]);
    expect(codes(withProfile('  format svg\n  link "javascript:alert(1)"'))).toEqual([
      "prop.invalid-value",
    ]);
    expect(codes(withProfile("  format gif\n  fps 12.5\n  duration 2s"))).toEqual([
      "prop.invalid-value",
    ]);
    expect(codes(withProfile("  format html\n  autoplay\n  loop\n  embed"))).toEqual([]);
    expect(codes(withProfile("  format png\n  colour red"))).toEqual(["prop.unknown"]);
    expect(codes(withProfile("  format png\n  format pdf"))).toEqual(["prop.duplicate"]);
  });

  it("needs a format and a known target, and leaves a video's length and background to the export", () => {
    expect(codes(withProfile("  scale 2"))).toEqual(["export.missing-format"]);
    expect(codes(withProfile("  format png", "nowhere"))).toEqual(["export.unknown-target"]);
    // A video without `duration` takes the effects' default when it runs; MP4 draws over the
    // theme's background.
    expect(codes(withProfile("  format webm"))).toEqual([]);
    expect(codes(withProfile("  format webm\n  duration 4s"))).toEqual([]);
    expect(codes(withProfile("  format mp4\n  background transparent"))).toEqual([]);
    // Shares the file namespace.
    expect(codes(compile(`${BASE}export checkout for checkout { format png }\n`))).toEqual([
      "ref.duplicate-id",
    ]);
  });

  it("times the effects of a diagram", () => {
    const finite = compile(
      "diagram d: flow {\n  a -> b as r\n  animate r { effect flow; duration 1s; repeat 3; delay 500ms }\n}\n",
    ).document.diagrams[0]!;
    expect(effectsEnd(finite)).toBe(3500);
    const endless = compile("diagram d: flow {\n  a -> b as r\n  animate r { effect dash }\n}\n")
      .document.diagrams[0]!;
    expect(effectsEnd(endless)).toBeNull();
  });
});

describe("urls", () => {
  it("are read on elements, groups and model entities", () => {
    const compilation = compile(BASE);
    expect(compilation.document.diagrams[0]!.elementsById.get("api")!.url).toBe(
      "https://docs.example.com/api",
    );
    const group = compile(
      'diagram d: flow {\n  group g "G" {\n    url "/docs/g"\n    node a\n  }\n}\n',
    );
    expect(group.diagnostics).toEqual([]);
    expect(group.document.diagrams[0]!.elementsById.get("g")!.url).toBe("/docs/g");
    const model = compile(
      'model m {\n  system s "S" { url "mailto:team@example.com" }\n}\ndiagram v: c4 using m {\n  level context\n}\n',
    );
    expect(model.diagnostics).toEqual([]);
    expect(model.document.models[0]!.entitiesByPath.get("s")!.url).toBe("mailto:team@example.com");
    expect(model.document.diagrams[0]!.elementsById.get("s")!.url).toBe("mailto:team@example.com");
  });

  it("refuse other schemes", () => {
    expect(isSafeUrl("https://example.com/a?b")).toBe(true);
    expect(isSafeUrl("docs/page.html")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("//evil.example")).toBe(false);
    expect(isSafeUrl("https://a b")).toBe(false);
    const bad = compile('diagram d: flow {\n  node a { url "javascript:x" }\n}\n');
    expect(bad.diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
  });
});
