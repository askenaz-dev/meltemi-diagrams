import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";

const SPECS = join(REPO_ROOT, "openspec", "specs");

describe("repository hygiene", () => {
  it("leaves no main spec with a pending purpose", () => {
    const pending = readdirSync(SPECS)
      .filter((name) => statSync(join(SPECS, name)).isDirectory())
      .filter((name) => /\bTBD\b/.test(readFileSync(join(SPECS, name, "spec.md"), "utf8")));
    expect(pending, "fill the Purpose section after archiving a change").toEqual([]);
  });

  it("lists the bundled fonts and their tooling in the license inventory", () => {
    const rows = readFileSync(join(REPO_ROOT, "THIRD_PARTY_LICENSES.md"), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .map((line) => line.split("|").map((cell) => cell.trim()));
    const row = (name: string) => rows.find((cells) => cells[1] === name);
    for (const font of [
      "@fontsource/inter",
      "@fontsource/ibm-plex-sans",
      "@fontsource/cascadia-mono",
      "inter-ui",
      "@ibm/plex-sans",
    ]) {
      expect(row(font)?.slice(3, 5), font).toEqual(["OFL-1.1", "embedded"]);
    }
    expect(row("fontkit")?.[3]).toBe("MIT");
  });

  it("lists every roadmap change with a status column", () => {
    const roadmap = readFileSync(join(REPO_ROOT, "docs", "roadmap-1.0.md"), "utf8");
    const rows = roadmap.split("\n").filter((line) => /^\| \d+ /.test(line));
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) expect(row.trim().endsWith("|")).toBe(true);
  });
});
