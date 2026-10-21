import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { compile, type FlowDiagram } from "@meltemi/diagrams-model";
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

const scratch = mkdtempSync(join(tmpdir(), "mdg-layout-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function copy(name: string, from = "corpus/valid/checkout.meltemi"): string {
  const target = join(scratch, name);
  copyFileSync(join(REPO_ROOT, from), target);
  return target;
}

/** Whether every diagram of a text renders without an engine, that is, is fully placed. */
function rendersWithoutEngine(text: string): boolean {
  const compilation = compile(text);
  return compilation.document.diagrams.every(
    (d) => layoutDiagram(compilation, d as FlowDiagram).scene !== null,
  );
}

describe("meltemi-diagrams layout", () => {
  it("writes places for the unplaced elements and keeps the others", () => {
    const file = copy("assisted.meltemi");
    const before = readFileSync(file, "utf8");
    const { code, stdout } = mdg("layout", file);
    expect(code).toBe(0);
    expect(stdout).toContain('Arranged "checkout"');
    const after = readFileSync(file, "utf8");
    expect(after).toMatch(/place client at \(-?\d+, -?\d+\)/);
    expect(after).toMatch(/place db at \(-?\d+, -?\d+\)/);
    expect(after).toContain("place api at (360, 180)");
    expect(after).toContain("place orders at (700, 180)");
    expect(after).toContain("via [(520, 180)]");
    expect(after).toContain("layout assisted");
    expect(after.length).toBeGreaterThan(before.length);
    expect(rendersWithoutEngine(after)).toBe(true);

    // A second run has nothing left to write.
    const again = mdg("layout", file, "--check");
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("every position is already written");
  });

  it("keeps an arranged box where the export draws it", () => {
    const file = copy("same.meltemi");
    const exported = mdg("export", file, "--stdout").stdout;
    mdg("layout", file);
    const placed = mdg("export", file, "--stdout").stdout;
    expect(placed).toBe(exported);
  });

  it("arranges everything anew with --all, letting the engine choose connection points", () => {
    const file = copy("all.meltemi");
    writeFileSync(file, readFileSync(file, "utf8").replace("layout assisted", "layout auto"));
    const { code } = mdg("layout", file, "--all");
    expect(code).toBe(0);
    const after = readFileSync(file, "utf8");
    expect(after).toContain("layout assisted");
    expect(after).not.toContain("place api at (360, 180)");
    expect(after).not.toContain("via");
    expect(after).not.toContain("route create");
    expect(rendersWithoutEngine(after)).toBe(true);
  });

  it("keeps the engine's connectors with --all, writing their bends", () => {
    const file = join(scratch, "bends.meltemi");
    writeFileSync(
      file,
      'diagram overview: flow {\n  direction LR\n  client["Client"]\n  api["API"] { description "Handles requests" }\n  db[("Database")]\n  client -> api: "HTTPS" as request\n  api -> db: "Reads and writes" as store\n  db -> client: "Back" as back\n}\n',
    );
    /** The bends of every connector of an exported SVG, between its ends. */
    const bends = (svg: string) =>
      new Map(
        [
          ...svg.matchAll(
            /<g data-id="([^"]+)" data-role="relation">\s*<polyline points="([^"]+)"/g,
          ),
        ].map((m) => [
          m[1]!,
          m[2]!
            .trim()
            .split(/\s+/)
            .slice(1, -1)
            .map((p) => p.split(",").map(Number) as [number, number]),
        ]),
      );
    const before = bends(mdg("export", file, "--stdout").stdout);
    expect(before.get("back")!.length).toBeGreaterThan(0);
    expect(mdg("layout", file, "--all").code).toBe(0);
    const text = readFileSync(file, "utf8");
    expect(text).toMatch(/route back from db to client via \[\(-?\d+, -?\d+\)/);
    expect(text).not.toContain("route request");
    const after = bends(mdg("export", file, "--stdout").stdout);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [id, points] of before) {
      const now = after.get(id)!;
      expect(now.length, id).toBe(points.length);
      points.forEach(([x, y], i) => {
        expect(Math.abs(now[i]![0] - x), `${id} x`).toBeLessThanOrEqual(1);
        expect(Math.abs(now[i]![1] - y), `${id} y`).toBeLessThanOrEqual(1);
      });
    }
  });

  it("checks without writing and prints to stdout", () => {
    const file = copy("check.meltemi");
    const before = readFileSync(file, "utf8");
    const check = mdg("layout", file, "--check");
    expect(check.code).toBe(1);
    expect(check.stdout).toContain('Would arrange "checkout"');
    const printed = mdg("layout", file, "--stdout");
    expect(printed.code).toBe(0);
    expect(printed.stdout).toContain("place client at");
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("follows the file's line endings", () => {
    const file = copy("crlf.meltemi");
    writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
    mdg("layout", file);
    const after = readFileSync(file, "utf8");
    expect(after).toMatch(/place client at \(-?\d+, -?\d+\)\r\n/);
    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("refreshes placed and sized groups with --all", () => {
    const file = join(scratch, "group.meltemi");
    writeFileSync(
      file,
      'diagram g: flow {\n  layout manual\n  group back "Back" {\n    api["API"]\n    db["DB"]\n  }\n  api -> db\n  placement {\n    place back at (0, 0)\n    size back (100, 100)\n    place api at (0, 0)\n    place db at (500, 500)\n  }\n}\n',
    );
    expect(mdg("layout", file, "--all").code).toBe(0);
    const after = readFileSync(file, "utf8");
    expect(after).toContain("layout manual");
    expect(after).not.toContain("size back (100, 100)");
    expect(after).toMatch(/size back \(\d+, \d+\)/);
    const compilation = compile(after);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0] as FlowDiagram);
    expect(result.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

  it("rejects bad arguments", () => {
    expect(mdg("layout").code).toBe(2);
    expect(mdg("layout", "corpus/valid/checkout.meltemi", "--stdout", "--check").code).toBe(2);
    const unknown = mdg("layout", "corpus/valid/checkout.meltemi", "--diagram", "nope");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("available: checkout");
  });

  it("is listed in the help", () => {
    expect(mdg("--help").stdout).toContain("layout <file.meltemi>");
  });
});
