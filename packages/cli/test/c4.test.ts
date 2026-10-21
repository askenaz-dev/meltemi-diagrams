import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

const scratch = mkdtempSync(join(tmpdir(), "mdg-c4-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("C4 views on the command line", () => {
  it("validates models and views", () => {
    expect(mdg("validate", "corpus/valid/c4/commerce.meltemi").code).toBe(0);
    expect(mdg("validate", "corpus/projects/valid/architecture").stdout).toContain(
      "Checked 5 files: 0 errors, 0 warnings.",
    );
  });

  it("exports every view of a file, and a view of an imported model, without warnings", () => {
    const { code, stdout } = mdg("export", "corpus/valid/c4/commerce.meltemi", "--out", scratch);
    expect(code).toBe(0);
    expect(stdout).not.toContain("warning");
    for (const id of ["context", "containers", "components"]) {
      expect(existsSync(join(scratch, `commerce.${id}.svg`))).toBe(true);
    }
    const svg = readFileSync(join(scratch, "commerce.containers.svg"), "utf8");
    expect(svg).toContain("[Container: React]");
    const imported = mdg(
      "export",
      "corpus/projects/valid/architecture/diagrams/containers.meltemi",
      "--stdout",
    );
    expect(imported.code).toBe(0);
    expect(imported.stdout).toContain("API de pedidos");
  });

  it("writes the positions of a view and skips sequence diagrams", () => {
    const file = join(scratch, "commerce.meltemi");
    copyFileSync(join(REPO_ROOT, "corpus/valid/c4/commerce.meltemi"), file);
    const { code, stdout } = mdg("layout", file, "--diagram", "containers");
    expect(code).toBe(0);
    expect(stdout).toContain('Arranged "containers"');
    expect(readFileSync(file, "utf8")).toMatch(/place shop\.api at \(-?\d+, -?\d+\)/);
    const sequence = mdg(
      "layout",
      "corpus/valid/sequence/payment.meltemi",
      "--diagram",
      "payment",
      "--check",
    );
    expect(sequence.code).toBe(2);
    expect(sequence.stderr).toContain("no positions to write");
  });
});

describe("the language of exported drawings", () => {
  const exportTo = (folder: string, ...extra: string[]) => {
    const out = join(scratch, folder);
    mkdirSync(out, { recursive: true });
    const result = mdg("export", "corpus/valid/c4/commerce.meltemi", "--out", out, ...extra);
    expect(result.code).toBe(0);
    return readFileSync(join(out, "commerce.containers.svg"), "utf8");
  };

  it("draws the type lines in Spanish with --lang es, and in English otherwise", () => {
    const spanish = exportTo("es", "--lang", "es");
    expect(spanish).toContain("[Contenedor: React]");
    expect(spanish).not.toContain("[Container: React]");
    expect(exportTo("en")).toContain("[Container: React]");
  });

  it("never takes the language of the machine for files", () => {
    let stdout = "";
    mkdirSync(join(scratch, "env"), { recursive: true });
    const code = run(
      ["export", "corpus/valid/c4/commerce.meltemi", "--out", join(scratch, "env")],
      {
        stdout: (t) => (stdout += t),
        stderr: () => undefined,
        cwd: REPO_ROOT,
        env: { LANG: "es_CL.UTF-8" },
        locale: "es-CL",
      },
    );
    expect(code).toBe(0);
    expect(readFileSync(join(scratch, "env", "commerce.containers.svg"), "utf8")).toBe(
      exportTo("en2"),
    );
  });

  it("refuses an unknown language", () => {
    const result = mdg("export", "corpus/valid/c4/commerce.meltemi", "--lang", "fr");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--lang must be en or es.");
  });
});
