import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

const scratch = mkdtempSync(join(tmpdir(), "mdg-convert-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function folder(name: string): string {
  const path = join(scratch, name);
  mkdirSync(path, { recursive: true });
  return path;
}

function copy(dir: string, name: string, from = "corpus/valid/checkout.meltemi"): string {
  const target = join(dir, name);
  copyFileSync(join(REPO_ROOT, from), target);
  return target;
}

function png(width: number, height: number): Buffer {
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
  for (const n of [width, height])
    out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  out.push(8, 6, 0, 0, 0);
  return Buffer.from(out);
}

describe("meltemi-diagrams convert", () => {
  it("adds a free copy that exports beside the source", () => {
    const dir = folder("checkout");
    const file = copy(dir, "sheet.meltemi");
    const { code, stdout } = mdg("convert", file, "--to", "free");
    expect(code).toBe(0);
    expect(stdout).toContain('Converted "checkout" to "checkout_free" in ');
    const after = readFileSync(file, "utf8");
    expect(after).toContain("diagram checkout_free: free {");
    expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const exported = mdg("export", file);
    expect(exported.code).toBe(0);
    expect(
      readdirSync(dir)
        .filter((f) => f.endsWith(".svg"))
        .sort(),
    ).toEqual(["sheet.checkout.svg", "sheet.checkout_free.svg"]);
  });

  it("prints with --stdout and writes nothing with --check", () => {
    const dir = folder("modes");
    const file = copy(dir, "sheet.meltemi");
    const before = readFileSync(file, "utf8");
    const printed = mdg("convert", file, "--to", "free", "--stdout", "--id", "slide");
    expect(printed.code).toBe(0);
    expect(printed.stdout).toContain("diagram slide: free {");
    const checked = mdg("convert", file, "--to", "free", "--check");
    expect(checked.code).toBe(1);
    expect(checked.stdout).toContain('Would convert "checkout" to "checkout_free"');
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("writes the model JSON with --to json, beside the file or where --out says", () => {
    const dir = folder("json");
    const file = copy(dir, "sheet.meltemi");
    const written = mdg("convert", file, "--to", "json");
    expect(written.code).toBe(0);
    expect(written.stdout).toMatch(
      /Wrote the model JSON of .*sheet\.meltemi to .*sheet\.model\.json\n$/,
    );
    const model = JSON.parse(readFileSync(join(dir, "sheet.model.json"), "utf8"));
    expect(model).toMatchObject({ format: "model-json", ok: true });
    expect(model.diagrams[0].id).toBe("checkout");
    const printed = mdg("convert", file, "--to", "json", "--stdout");
    expect(printed.code).toBe(0);
    expect(JSON.parse(printed.stdout)).toEqual(model);
    expect(mdg("convert", file, "--to", "json", "--out", join(dir, "out.json")).code).toBe(0);
    expect(readFileSync(join(dir, "out.json"), "utf8")).toBe(printed.stdout);
    const broken = join(dir, "broken.meltemi");
    writeFileSync(broken, 'diagram a: flow {\n  style missing { fill "#fff" }\n}\n');
    const failing = mdg("convert", broken, "--to", "json", "--stdout");
    expect(failing.code).toBe(1);
    expect(JSON.parse(failing.stdout).diagnostics[0].code).toBe("ref.unknown-element");
    expect(mdg("convert", file, "--to", "json", "--diagram", "checkout").code).toBe(2);
    expect(mdg("convert", file, "--to", "free", "--out", "x.json").code).toBe(2);
  });

  it("refuses usage errors", () => {
    const dir = folder("usage");
    const file = copy(dir, "sheet.meltemi");
    expect(mdg("convert", file).code).toBe(2);
    expect(mdg("convert", file, "--to", "sequence").code).toBe(2);
    expect(mdg("convert", file, "--to", "free", "--diagram", "nope").code).toBe(2);
    const two = join(dir, "two.meltemi");
    writeFileSync(two, "diagram a: flow {\n  x -> y\n}\n\ndiagram b: flow {\n  x -> y\n}\n");
    const several = mdg("convert", two, "--to", "free");
    expect(several.code).toBe(2);
    expect(several.stderr).toContain("choose one with --diagram");
    expect(mdg("convert", two, "--to", "free", "--diagram", "b").code).toBe(0);
    expect(readFileSync(two, "utf8")).toContain("diagram b_free: free {");
  });
});

describe("free diagrams on the command line", () => {
  it("embeds project images in the export", () => {
    const dir = folder("images");
    writeFileSync(join(dir, "project.json"), JSON.stringify({ name: "images", language: "0.2" }));
    writeFileSync(join(dir, "logo.png"), png(320, 80));
    const file = join(dir, "slide.meltemi");
    writeFileSync(
      file,
      'language "0.2"\n\ndiagram slide: free {\n  image logo "logo.png" { description "Logo" }\n  placement {\n    place logo at (200, 100)\n  }\n}\n',
    );
    const { code, stdout } = mdg("export", file, "--stdout", "--fonts", "system");
    expect(code).toBe(0);
    expect(stdout).toContain('<image x="');
    expect(stdout).toContain('width="320" height="80" href="data:image/png;base64,');
    expect(stdout).toContain("<title>Logo</title>");
    const missing = join(dir, "missing.meltemi");
    writeFileSync(
      missing,
      'diagram slide: free {\n  image logo "nope.png"\n  placement {\n    place logo at (200, 100)\n  }\n}\n',
    );
    const report = mdg("validate", missing);
    expect(report.code).toBe(1);
    expect(report.stdout).toContain("asset.unknown-image");
  });

  it("writes group places and interior positions with layout --all", () => {
    const dir = folder("layout");
    const file = join(dir, "free.meltemi");
    writeFileSync(
      file,
      'diagram s: free {\n  layout auto\n  group g "G" {\n    box a "A"\n    box b "B"\n    a -> b\n  }\n  box c "C"\n  b -> c\n}\n',
    );
    const { code } = mdg("layout", file, "--all");
    expect(code).toBe(0);
    const after = readFileSync(file, "utf8");
    expect(after).toMatch(/place g at \(-?\d+, -?\d+\)/);
    expect(after).toMatch(/size g \(\d+, \d+\)/);
    const compiled = compile(after);
    expect(compiled.diagnostics).toEqual([]);
    const place = (id: string) =>
      compiled.document.diagrams[0]!.placement.find(
        (p) => p.statement === "place" && p.target === id,
      ) as { x: number; y: number };
    // Children are written inside the group's interior, so near its origin.
    expect(place("a").x).toBeLessThan(300);
    expect(place("a").y).toBeLessThan(100);
  });
});
