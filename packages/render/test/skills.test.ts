import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { renderSvg } from "../src/index.js";

/** Relative paths of every file under a directory, sorted. */
function tree(dir: string): string[] {
  const found: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) visit(path);
      else found.push(relative(dir, path).split("\\").join("/"));
    }
  };
  visit(dir);
  return found;
}

const skillsRoot = join(REPO_ROOT, "skills");
const syncScript = join(REPO_ROOT, "scripts", "sync-skills.mjs");
const agentDirs = [".claude", ".codex"];
const skills = readdirSync(skillsRoot).filter((name) =>
  statSync(join(skillsRoot, name)).isDirectory(),
);

describe("agent skills", () => {
  it("include meltemi-diagrams with front matter", () => {
    expect(skills).toContain("meltemi-diagrams");
    const text = readFileSync(join(skillsRoot, "meltemi-diagrams", "SKILL.md"), "utf8");
    expect(text.startsWith("---\nname: meltemi-diagrams\ndescription: ")).toBe(true);
    expect(text).toContain(".meltemi");
    expect(text).not.toContain(".arch");
  });

  it.each(skills)("%s is copied unchanged to .claude/skills and .codex/skills", (name) => {
    const source = join(skillsRoot, name);
    const files = tree(source);
    expect(files.length).toBeGreaterThan(0);
    for (const agentDir of agentDirs) {
      const copy = join(REPO_ROOT, agentDir, "skills", name);
      expect(tree(copy), `${agentDir}/skills/${name} file list (run pnpm skills:sync)`).toEqual(
        files,
      );
      for (const file of files) {
        expect(
          readFileSync(join(copy, file), "utf8"),
          `${agentDir}/skills/${name}/${file} (run pnpm skills:sync)`,
        ).toBe(readFileSync(join(source, file), "utf8"));
      }
    }
  });

  it.each(agentDirs)("%s/skills lists exactly the synced skills", (agentDir) => {
    const target = join(REPO_ROOT, agentDir, "skills");
    const manifest = JSON.parse(readFileSync(join(target, ".skills-sync.json"), "utf8"));
    expect(manifest.skills, `${agentDir}/skills/.skills-sync.json (run pnpm skills:sync)`).toEqual(
      [...skills].sort(),
    );
  });

  it("sync removes skills it copied before but keeps foreign ones", () => {
    const root = mkdtempSync(join(tmpdir(), "skills-sync-"));
    try {
      const write = (path: string, text: string) => {
        mkdirSync(join(root, path, ".."), { recursive: true });
        writeFileSync(join(root, path), text);
      };
      write("skills/fresh/SKILL.md", "fresh");
      write(".claude/skills/openspec-propose/SKILL.md", "foreign");
      write(".codex/skills/old/SKILL.md", "stale");
      write(".codex/skills/.skills-sync.json", JSON.stringify({ skills: ["old", "../outside"] }));
      write("outside/keep.txt", "outside the agent folder");

      execFileSync(process.execPath, [syncScript], { cwd: root, stdio: "pipe" });

      expect(readdirSync(join(root, ".claude", "skills")).sort()).toEqual([
        ".skills-sync.json",
        "fresh",
        "openspec-propose",
      ]);
      expect(readdirSync(join(root, ".codex", "skills")).sort()).toEqual([
        ".skills-sync.json",
        "fresh",
      ]);
      expect(existsSync(join(root, "outside", "keep.txt"))).toBe(true);
      for (const agentDir of agentDirs) {
        const manifest = readFileSync(join(root, agentDir, "skills", ".skills-sync.json"), "utf8");
        expect(JSON.parse(manifest)).toEqual({ skills: ["fresh"] });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const examples = skills.flatMap((name) =>
    tree(join(skillsRoot, name))
      .filter((file) => file.endsWith(".meltemi"))
      .map((file) => [`${name}/${file}`, join(skillsRoot, name, file)] as const),
  );

  it.each(examples)("%s compiles and renders without diagnostics", (_name, path) => {
    const compilation = compile(readFileSync(path, "utf8"));
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.document.diagrams.length).toBeGreaterThan(0);
    for (const diagram of compilation.document.diagrams) {
      const result = layoutDiagram(compilation, diagram);
      expect(result.diagnostics).toEqual([]);
      expect(renderSvg(result.scene!)).toContain("<svg");
    }
  });
});
