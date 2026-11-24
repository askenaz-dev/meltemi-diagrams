// `repository-readme`: the README's first screen, its agents' section, the gallery near the top,
// the comparison, and one structure in English and in Spanish. It holds order, commands, pictures
// and structure, never sentences.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8").replace(/\r\n/g, "\n");
const english = read("README.md");
const spanish = read("README.es.md");

/** The `##` sections of a README, with their bodies, in order. */
function sections(text: string): { heading: string; body: string }[] {
  return text
    .split(/\n(?=## )/)
    .slice(1)
    .map((part) => {
      const [heading, ...rest] = part.split("\n");
      return { heading: heading!.slice(3), body: rest.join("\n") };
    });
}

/** The lines of a text's fenced blocks. */
const fenced = (text: string) =>
  [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)]
    .flatMap((m) => m[1]!.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** The pictures of a text, by their file. */
const pictures = (text: string) => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!);

describe.each([
  ["README.md", english, "docs/agents.md"],
  ["README.es.md", spanish, "docs/es/agents.md"],
])("%s", (_file, text, guide) => {
  const top = text.split("\n## ")[0]!;
  const all = sections(text);

  it("opens with the sentence, three badges, four links and the demo", () => {
    expect(top).toMatch(/^# Meltemi Diagrams\n/);
    expect(top).toContain("actions/workflows/ci.yml/badge.svg");
    expect(top).toContain("img.shields.io/npm/v/@meltemi/diagrams-cli");
    expect(top).toContain("(LICENSE)");
    for (const link of [
      "https://diagrams.meltemi.dev",
      "README.md)",
      "gallery/README.md",
      "CHANGELOG.md",
    ]) {
      expect(top, link).toContain(link);
    }
    expect(top).toContain("(docs/media/editing-demo.gif)");
  });

  it("gives the agents' section first and the install without an agent second", () => {
    expect(all[0]!.body, `the first section is "${all[0]!.heading}"`).toContain(
      "/plugin marketplace add askenaz-dev/meltemi-diagrams",
    );
    expect(fenced(all[1]!.body), `the second section is "${all[1]!.heading}"`).toContain(
      "npm install --global @meltemi/diagrams-cli",
    );
  });

  it("holds the agents' commands, each held by the agents guide, and four requests", () => {
    const agents = all[0]!.body;
    const commands = fenced(agents);
    expect(commands).toContain("/plugin marketplace add askenaz-dev/meltemi-diagrams");
    expect(commands).toContain(
      "npx skills add askenaz-dev/meltemi-diagrams --skill meltemi-diagrams",
    );
    const inGuide = fenced(read(guide));
    for (const command of commands) expect(inGuide, `${command} in ${guide}`).toContain(command);
    expect(agents.match(/^- "[^"]+"$/gm) ?? []).toHaveLength(4);
    expect(agents).toContain(`(${guide})`);
  });

  it("shows the gallery third, with a picture of each profile that exists", () => {
    const gallery = all[2]!.body;
    const files = pictures(gallery);
    for (const profile of ["flow", "sequence", "c4", "gantt", "free"]) {
      expect(
        files.some((file) => file.startsWith(`gallery/${profile}/`)),
        profile,
      ).toBe(true);
    }
    for (const file of files) expect(existsSync(join(REPO_ROOT, file)), file).toBe(true);
  });

  it("compares four ways by six rows, and says what the others do better", () => {
    const index = all.findIndex((section) => /compar/i.test(section.heading));
    expect(index, "a comparison section").toBeGreaterThan(2);
    const body = all[index]!.body;
    const rows = body.split("\n").filter((line) => line.startsWith("|"));
    const header = rows[0]!.split("|").map((cell) => cell.trim());
    expect(header.filter((cell) => cell !== "")).toHaveLength(4);
    expect(rows.slice(2)).toHaveLength(6);
    const after = body.slice(body.lastIndexOf("|") + 1);
    expect(after).toContain("GitHub");
    expect(after).toContain("Mermaid");
    expect(after).toContain("draw.io");
    expect(after).toContain("Excalidraw");
  });
});

describe("the two READMEs", () => {
  it("keep the same sections in the same order, with the same commands, badges and pictures", () => {
    const a = sections(english);
    const b = sections(spanish);
    expect(b.length, "README.es.md has the sections of README.md").toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      const commandsA = fenced(a[i]!.body);
      const commandsB = fenced(b[i]!.body);
      expect(commandsB, `the commands of "${a[i]!.heading}" in README.es.md`).toEqual(commandsA);
      expect(pictures(b[i]!.body), `the pictures of "${a[i]!.heading}"`).toEqual(
        pictures(a[i]!.body),
      );
    }
    const badges = (text: string) =>
      [...text.matchAll(/\[!\[[^\]]*\]\(([^)]+)\)\]/g)].map((m) => m[1]);
    expect(badges(spanish.split("\n## ")[0]!)).toEqual(badges(english.split("\n## ")[0]!));
  });
});
