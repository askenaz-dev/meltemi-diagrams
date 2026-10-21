import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

async function mdg(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
  });
  return { code, stdout, stderr };
}

const CANONICAL = "diagram a: flow {\n  x -> y\n}\n";
const BADLY_INDENTED = "diagram b: flow {\n      x -> y\n}\n";

let scratch: string | undefined;
function project(files: Record<string, string>): string {
  scratch = mkdtempSync(join(tmpdir(), "mdg-format-"));
  writeFileSync(join(scratch, "project.json"), '{ "name": "f", "language": "0.2" }\n');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(scratch, name), text);
  return scratch;
}
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("meltemi-diagrams format", () => {
  it("rewrites only files that change", async () => {
    const dir = project({ "a.meltemi": CANONICAL, "b.meltemi": BADLY_INDENTED });
    const { code, stdout } = await mdg(dir, "format", ".");
    expect(code).toBe(0);
    expect(stdout).toBe("Formatted b.meltemi\nFormatted 1 of 2 files.\n");
    expect(readFileSync(join(dir, "b.meltemi"), "utf8")).toBe("diagram b: flow {\n  x -> y\n}\n");
    expect(readFileSync(join(dir, "a.meltemi"), "utf8")).toBe(CANONICAL);
  });

  it("uses the project's indentation", async () => {
    const dir = project({ "b.meltemi": BADLY_INDENTED });
    writeFileSync(
      join(dir, "project.json"),
      '{ "name": "f", "language": "0.2", "format": { "indent": 4 } }\n',
    );
    await mdg(dir, "format", ".");
    expect(readFileSync(join(dir, "b.meltemi"), "utf8")).toBe("diagram b: flow {\n    x -> y\n}\n");
  });

  it("refuses a file with syntax errors and leaves it unchanged", async () => {
    const broken = 'diagram c: flow {\n  x -> y: "open\n}\n';
    const dir = project({ "c.meltemi": broken });
    const { code, stdout } = await mdg(dir, "format", "c.meltemi");
    expect(code).toBe(1);
    expect(stdout).toContain("syntax.unterminated-string");
    expect(stdout).toContain("c.meltemi:1:1: error format.syntax-errors");
    expect(readFileSync(join(dir, "c.meltemi"), "utf8")).toBe(broken);
  });

  it("rejects a missing path", async () => {
    const { code, stderr } = await mdg(REPO_ROOT, "format", "nope.meltemi");
    expect(code).toBe(2);
    expect(stderr).toContain("nope.meltemi");
  });

  it("checks a canonical project without writing", async () => {
    const { code, stdout } = await mdg(
      REPO_ROOT,
      "format",
      "--check",
      "corpus/projects/valid/commerce",
    );
    expect(code).toBe(0);
    expect(stdout).toBe("Checked 4 files: all formatted.\n");
  });

  it("reports files that would change in check mode", async () => {
    const dir = project({ "a.meltemi": CANONICAL, "b.meltemi": BADLY_INDENTED });
    const { code, stdout } = await mdg(dir, "format", "--check", ".");
    expect(code).toBe(1);
    expect(stdout).toContain("Would format b.meltemi");
    expect(readFileSync(join(dir, "b.meltemi"), "utf8")).toBe(BADLY_INDENTED);
  });

  it("prints one file with --stdout and refuses two", async () => {
    const dir = project({ "a.meltemi": CANONICAL, "b.meltemi": BADLY_INDENTED });
    const one = await mdg(dir, "format", "--stdout", "b.meltemi");
    expect(one).toMatchObject({ code: 0, stdout: "diagram b: flow {\n  x -> y\n}\n" });
    expect(readFileSync(join(dir, "b.meltemi"), "utf8")).toBe(BADLY_INDENTED);
    const two = await mdg(dir, "format", "--stdout", "a.meltemi", "b.meltemi");
    expect(two.code).toBe(2);
  });
});
