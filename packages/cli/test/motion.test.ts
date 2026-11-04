import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-motion-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

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

const SHEET = [
  'language "0.2"',
  "diagram checkout: flow {",
  "  layout manual",
  "  node api",
  "  node db",
  "  api -> db as save",
  "  animate save { effect flow }",
  "  animate db { effect pulse; duration 1s }",
  "  placement {",
  "    place api at (100, 100)",
  "    place db at (400, 100)",
  "  }",
  "}",
  "",
].join("\n");

describe("export with effects", () => {
  writeFileSync(join(scratch, "sheet.meltemi"), SHEET);
  writeFileSync(join(scratch, "still.meltemi"), SHEET.replace(/ {2}animate.*\n/g, ""));

  it("draws no effects by default", () => {
    const { code, stdout } = mdg("export", "sheet.meltemi", "--stdout", "--fonts", "system");
    expect(code).toBe(0);
    expect(stdout).not.toContain("<style><![CDATA[");
    expect(stdout).not.toContain('data-role="motion"');
  });

  it("writes the animated profile", () => {
    const { code } = mdg("export", "sheet.meltemi", "--motion", "animated", "--fonts", "system");
    expect(code).toBe(0);
    const svg = readFileSync(join(scratch, "sheet.svg"), "utf8");
    expect(svg).toContain("@keyframes mdg-flow");
    expect(svg).toContain("@keyframes mdg-halo");
    expect(svg).toContain('data-role="motion"');
  });

  it("writes one frame", () => {
    const { code, stdout } = mdg(
      "export",
      "sheet.meltemi",
      "--at",
      "600ms",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout).toContain('data-role="motion"');
    // The pulse halo at phase 0.6: opacity 0.7 × 0.4.
    expect(stdout).toContain('opacity="0.28"');
    expect(stdout).not.toContain("@keyframes");
  });

  it("exports diagrams without effects identically in every mode", () => {
    const plain = mdg("export", "still.meltemi", "--stdout", "--fonts", "system").stdout;
    expect(
      mdg("export", "still.meltemi", "--stdout", "--motion", "animated", "--fonts", "system")
        .stdout,
    ).toBe(plain);
    expect(
      mdg("export", "still.meltemi", "--stdout", "--at", "1s", "--fonts", "system").stdout,
    ).toBe(plain);
  });

  it("refuses bad options", () => {
    expect(mdg("export", "sheet.meltemi", "--motion", "video").code).toBe(2);
    expect(mdg("export", "sheet.meltemi", "--at", "soon").code).toBe(2);
    expect(mdg("export", "sheet.meltemi", "--at", "-1s").code).toBe(2);
    const both = mdg("export", "sheet.meltemi", "--at", "1s", "--motion", "animated");
    expect(both.code).toBe(2);
    expect(both.stderr).toContain("cannot be combined");
  });
});
