import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
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

const scratch = mkdtempSync(join(tmpdir(), "mdg-export-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const annotations = "corpus/valid/edge/annotations.meltemi";

describe("meltemi-diagrams export", () => {
  it("writes one SVG per diagram into a directory", () => {
    const { code, stdout } = mdg("export", annotations, "--out", scratch);
    expect(code).toBe(0);
    const target = join(scratch, "annotations.svg");
    expect(existsSync(target)).toBe(true);
    expect(stdout).toContain("Wrote ");
    expect(stdout).toContain("annotations.svg");
    expect(readFileSync(target, "utf8").startsWith("<svg")).toBe(true);
  });

  it("writes to a named file", () => {
    const target = join(scratch, "custom.svg");
    const { code } = mdg("export", annotations, "--out", target);
    expect(code).toBe(0);
    expect(existsSync(target)).toBe(true);
  });

  it("prints to stdout without writing", () => {
    const before = readdirSync(scratch).length;
    const { code, stdout } = mdg("export", annotations, "--stdout");
    expect(code).toBe(0);
    expect(stdout.startsWith("<svg")).toBe(true);
    expect(readdirSync(scratch).length).toBe(before);
  });

  it("arranges an assisted diagram with ELK", () => {
    const { code, stdout, stderr } = mdg("export", "corpus/valid/checkout.meltemi", "--stdout");
    expect(code).toBe(0);
    expect(stderr).not.toContain("error");
    expect(stdout.startsWith("<svg")).toBe(true);
    for (const id of ["client", "api", "orders", "db"]) expect(stdout).toContain(`data-id="${id}"`);
    // The placed boxes keep their places: `orders` stays 340 px right of `api`.
    const x = (id: string) =>
      Number(new RegExp(String.raw`data-id="${id}"[^>]*>\s*<rect x="([\d.]+)"`).exec(stdout)?.[1]);
    expect(x("orders") - x("api")).toBe(340);
  });

  it("rejects an unknown diagram", () => {
    const { code, stderr } = mdg("export", annotations, "--diagram", "nope");
    expect(code).toBe(2);
    expect(stderr).toContain("nope");
    expect(stderr).toContain("annotations");
  });

  it("reports a file without a compiled diagram", () => {
    const { code, stdout } = mdg(
      "export",
      "corpus/invalid/export.unknown-target.meltemi",
      "--out",
      scratch,
    );
    expect(code).toBe(1);
    expect(stdout).toContain("export.no-diagram");
  });

  it("exports a sequence diagram and one of its scenarios", () => {
    const all = mdg("export", "corpus/valid/sequence/payment.meltemi", "--out", scratch);
    expect(all.code).toBe(0);
    const full = readFileSync(join(scratch, "payment.svg"), "utf8");
    expect(full).toContain("Rechazo");
    const one = mdg(
      "export",
      "corpus/valid/sequence/payment.meltemi",
      "--scenario",
      "approved",
      "--out",
      scratch,
    );
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("payment.approved.svg");
    const approved = readFileSync(join(scratch, "payment.approved.svg"), "utf8");
    expect(approved).toContain("Pago aprobado");
    expect(approved).not.toContain("Rechazo");
  });

  it("refuses an unknown scenario with the available ones", () => {
    const { code, stderr } = mdg(
      "export",
      "corpus/valid/sequence/payment.meltemi",
      "--scenario",
      "lost",
      "--stdout",
    );
    expect(code).toBe(2);
    expect(stderr).toContain('no scenario named "lost"');
    expect(stderr).toContain("available: approved, rejected");
  });

  it("reports export.no-diagram for the corpus example", () => {
    const { code, stdout, stderr } = mdg(
      "export",
      "corpus/invalid/export.no-diagram.meltemi",
      "--stdout",
    );
    expect(code).toBe(1);
    // With --stdout, diagnostics go to stderr.
    expect(stdout).toBe("");
    expect(stderr).toContain("error export.no-diagram");
  });

  it("rejects unsupported formats and missing arguments", () => {
    const tiff = mdg("export", annotations, "--format", "tiff");
    expect(tiff.code).toBe(2);
    expect(tiff.stderr).toContain("use svg, png, pdf, html");
    expect(mdg("export").code).toBe(2);
    expect(mdg("export", "a.meltemi", "b.meltemi").code).toBe(2);
    expect(mdg("export", "missing.meltemi").code).toBe(2);
  });

  it("prints warnings and still exports", () => {
    const { code, stdout } = mdg(
      "export",
      "corpus/invalid/layout.unknown-theme.meltemi",
      "--out",
      scratch,
    );
    expect(code).toBe(0);
    expect(stdout).toContain("warning layout.unknown-theme");
    expect(existsSync(join(scratch, "layout.unknown-theme.svg"))).toBe(true);
  });
});
