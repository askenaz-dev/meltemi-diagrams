import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { installedText, skillCommand } from "../src/skill-command.js";

const SKILL = fileURLToPath(new URL("../skills/meltemi-diagrams/", import.meta.url));

const scratch = mkdtempSync(join(tmpdir(), "mdg-skill-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function mdg(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
  });
  return { code, stdout, stderr };
}

/** Relative paths of every file under a folder, sorted. */
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

const fresh = (name: string) => {
  const folder = join(scratch, name);
  return folder;
};

describe("skill install", () => {
  it("writes the skill for Claude Code and Codex into the working folder", () => {
    const project = fresh("both");
    mdg(scratch, "init", "both");
    const { code, stdout } = mdg(project, "skill", "install");
    expect(code).toBe(0);
    expect(stdout).toBe(
      "Wrote .claude/skills/meltemi-diagrams\nWrote .codex/skills/meltemi-diagrams\n",
    );
    for (const agent of [".claude", ".codex"]) {
      const installed = join(project, agent, "skills", "meltemi-diagrams");
      expect(tree(installed)).toEqual(tree(SKILL));
      const skill = readFileSync(join(installed, "SKILL.md"), "utf8");
      expect(skill).toContain("mdg validate path/to/sheet.meltemi");
      expect(skill).toContain("`mdg preview` serves the folder");
      // The examples keep their diagrams; only the commands their comments name change.
      for (const file of tree(join(SKILL, "examples"))) {
        expect(readFileSync(join(installed, "examples", file), "utf8")).toBe(
          installedText(readFileSync(join(SKILL, "examples", file), "utf8")),
        );
      }
    }
  });

  it("leaves no repository command in any installed file", () => {
    const project = fresh("rewritten");
    expect(mdg(scratch, "skill", "install", "rewritten", "--agent", "codex").code).toBe(0);
    const installed = join(project, ".codex", "skills", "meltemi-diagrams");
    for (const file of tree(installed)) {
      const lines = readFileSync(join(installed, file), "utf8").split("\n");
      const left = lines.filter((line) => line.includes("pnpm"));
      expect(left, `${file} still names pnpm`).toEqual([]);
    }
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  it("installs into the person's own folders with --user", () => {
    const home = fresh("home");
    let stdout = "";
    const code = skillCommand(["install", "--agent", "claude", "--user"], {
      name: "meltemi-diagrams",
      stdout: (t) => (stdout += t),
      stderr: () => undefined,
      cwd: scratch,
      display: (path) => relative(scratch, path).split("\\").join("/"),
      home,
    });
    expect(code).toBe(0);
    expect(stdout).toBe("Wrote home/.claude/skills/meltemi-diagrams\n");
    expect(existsSync(join(home, ".claude", "skills", "meltemi-diagrams", "SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".codex"))).toBe(false);
  });

  it("keeps a copy already there, and replaces only it with --force", () => {
    const project = fresh("again");
    expect(mdg(scratch, "skill", "install", "again").code).toBe(0);
    const skill = join(project, ".claude", "skills", "meltemi-diagrams", "SKILL.md");
    writeFileSync(skill, "my own notes");
    const beside = join(project, ".claude", "skills", "mine.md");
    writeFileSync(beside, "a skill of mine");
    const refused = mdg(scratch, "skill", "install", "again");
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain(
      "again/.claude/skills/meltemi-diagrams already holds the skill",
    );
    expect(readFileSync(skill, "utf8")).toBe("my own notes");
    const forced = mdg(scratch, "skill", "install", "again", "--force");
    expect(forced.code).toBe(0);
    expect(readFileSync(skill, "utf8")).toContain("name: meltemi-diagrams");
    expect(readFileSync(beside, "utf8")).toBe("a skill of mine");
  });

  it("refuses an unknown agent, a folder with --user and an unknown subcommand", () => {
    const agent = mdg(scratch, "skill", "install", "--agent", "cursor");
    expect(agent.code).toBe(2);
    expect(agent.stderr).toContain("the agents are claude, codex, all");
    expect(mdg(scratch, "skill", "install", "x", "--user").code).toBe(2);
    const unknown = mdg(scratch, "skill", "remove");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("skill install [folder]");
    expect(mdg(scratch, "skill", "--help").stdout).toContain("Usage: skill install");
  });
});

describe("the installed text", () => {
  it("names the installed command", () => {
    expect(
      installedText("3. Validate: `pnpm mdg validate x.meltemi` (from the repository root)."),
    ).toBe("3. Validate: `mdg validate x.meltemi` (from the project's folder).");
  });

  it("catches a repository command no rule covers", () => {
    expect(installedText("Run `pnpm gallery`.")).toContain("pnpm");
  });
});
