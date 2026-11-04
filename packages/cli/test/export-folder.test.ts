import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-export-folder-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const project = join(scratch, "architecture");
cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), project, { recursive: true });

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

describe("export of a project folder", () => {
  it("exports every diagram of every file, keeping the folders under --out", () => {
    const { code, stdout } = mdg("export", "architecture", "--out", "site");
    expect(code).toBe(0);
    expect(stdout.trim().split("\n").sort()).toEqual([
      "Wrote site/diagrams/containers.svg",
      "Wrote site/diagrams/context.svg",
      "Wrote site/diagrams/purchase.svg",
    ]);
    expect(readFileSync(join(scratch, "site", "diagrams", "purchase.svg"), "utf8")).toMatch(
      /^<svg/,
    );
    expect(existsSync(join(scratch, "site", "models"))).toBe(false);
  });

  it("writes beside each file without --out, in any format", () => {
    const { code } = mdg("export", join("architecture", "diagrams"), "--format", "html");
    expect(code).toBe(0);
    expect(existsSync(join(project, "diagrams", "containers.html"))).toBe(true);
  });

  it("runs the profiles of every file, and refuses one-file options", () => {
    const sheet = join(project, "diagrams", "context.meltemi");
    writeFileSync(
      sheet,
      `${readFileSync(sheet, "utf8")}\nexport page for context {\n  format svg\n  file "out/context-page.svg"\n}\n`,
    );
    const profiles = mdg("export", "architecture", "--profiles");
    expect(profiles.code).toBe(0);
    expect(profiles.stdout).toContain("context-page.svg");
    expect(existsSync(join(project, "diagrams", "out", "context-page.svg"))).toBe(true);
    expect(mdg("export", "architecture", "--profile", "nope").stderr).toContain(
      'no file in architecture has a profile named "nope"',
    );
    for (const flag of [
      ["--diagram", "x"],
      ["--story", "tour"],
      ["--scenario", "a"],
      ["--stdout"],
    ]) {
      const refused = mdg("export", "architecture", ...flag);
      expect(refused.code, flag[0]).toBe(2);
      expect(refused.stderr).toContain("works on one file");
    }
  });
});
