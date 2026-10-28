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
import { SKILL_AGENTS, installedText, skillCommand, skillFolders } from "../src/skill-command.js";

const SKILL = fileURLToPath(new URL("../skills/meltemi-diagrams/", import.meta.url));
const PROMPT = fileURLToPath(new URL("../agent-setup/prompt.md", import.meta.url));

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
  it("writes the skill into the two folders the agents read, and nothing else", () => {
    const project = fresh("both");
    mdg(scratch, "init", "both");
    const before = tree(project);
    const { code, stdout } = mdg(project, "skill", "install");
    expect(code).toBe(0);
    expect(stdout).toBe(
      "Wrote .claude/skills/meltemi-diagrams\nWrote .agents/skills/meltemi-diagrams\n",
    );
    const skillFiles = tree(SKILL);
    expect(tree(project)).toEqual(
      [
        ...before,
        ...skillFiles.map((file) => `.agents/skills/meltemi-diagrams/${file}`),
        ...skillFiles.map((file) => `.claude/skills/meltemi-diagrams/${file}`),
      ].sort(),
    );
    for (const agent of [".claude", ".agents"]) {
      const installed = join(project, agent, "skills", "meltemi-diagrams");
      expect(tree(installed)).toEqual(skillFiles);
      const skill = readFileSync(join(installed, "SKILL.md"), "utf8");
      expect(skill).toContain("mdg validate path/to/sheet.meltemi");
      expect(skill).toContain("`mdg preview` serves the folder");
      expect(skill).toContain("`mdg --version`");
      const cloud = readFileSync(join(installed, "reference", "cloud.md"), "utf8");
      expect(cloud).toContain("`mdg login`");
      expect(cloud).toContain("`mdg push <folder> --create`");
      // The examples keep their diagrams; only the commands their comments name change.
      for (const file of tree(join(SKILL, "examples"))) {
        expect(readFileSync(join(installed, "examples", file), "utf8")).toBe(
          installedText(readFileSync(join(SKILL, "examples", file), "utf8")),
        );
      }
    }
  });

  it("writes a folder shared by several agents once", () => {
    const project = fresh("shared");
    const { code, stdout } = mdg(
      scratch,
      "skill",
      "install",
      "shared",
      "--agent",
      "codex,cursor,copilot",
    );
    expect(code).toBe(0);
    expect(stdout).toBe("Wrote shared/.agents/skills/meltemi-diagrams\n");
    expect(readdirSync(project)).toEqual([".agents"]);
  });

  it("takes --agent more than once, writing in the table's order", () => {
    const project = fresh("repeated");
    const { code, stdout } = mdg(
      scratch,
      "skill",
      "install",
      "repeated",
      "--agent",
      "gemini",
      "--agent",
      "claude",
    );
    expect(code).toBe(0);
    expect(stdout).toBe(
      "Wrote repeated/.claude/skills/meltemi-diagrams\n" +
        "Wrote repeated/.agents/skills/meltemi-diagrams\n",
    );
    expect(readdirSync(project).sort()).toEqual([".agents", ".claude"]);
  });

  it("names every agent's folder in the table", () => {
    expect(SKILL_AGENTS).toEqual({
      claude: ".claude/skills",
      codex: ".agents/skills",
      cursor: ".agents/skills",
      copilot: ".agents/skills",
      gemini: ".agents/skills",
      windsurf: ".agents/skills",
      devin: ".agents/skills",
      agents: ".agents/skills",
    });
    expect(skillFolders(["all"])).toEqual({ folders: [".claude/skills", ".agents/skills"] });
    expect(skillFolders(["devin", "windsurf"])).toEqual({ folders: [".agents/skills"] });
    expect(skillFolders(["claude", ""])).toEqual({ unknown: "" });
  });

  it("leaves no repository command in any installed file", () => {
    const project = fresh("rewritten");
    expect(mdg(scratch, "skill", "install", "rewritten", "--agent", "codex").code).toBe(0);
    const installed = join(project, ".agents", "skills", "meltemi-diagrams");
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
    const code = skillCommand(["install", "--agent", "gemini", "--user"], {
      name: "meltemi-diagrams",
      stdout: (t) => (stdout += t),
      stderr: () => undefined,
      cwd: scratch,
      display: (path) => relative(scratch, path).split("\\").join("/"),
      home,
    });
    expect(code).toBe(0);
    expect(stdout).toBe("Wrote home/.agents/skills/meltemi-diagrams\n");
    expect(existsSync(join(home, ".agents", "skills", "meltemi-diagrams", "SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".claude"))).toBe(false);
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

  it("refuses an unknown or an empty agent, writing nothing", () => {
    const listed =
      "the agents are claude, codex, cursor, copilot, gemini, windsurf, devin, agents, all.";
    const project = fresh("refused");
    const unknown = mdg(scratch, "skill", "install", "refused", "--agent", "cline");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain(`There is no agent \`cline\`; ${listed}`);
    const empty = mdg(scratch, "skill", "install", "refused", "--agent", "claude,");
    expect(empty.code).toBe(2);
    expect(empty.stderr).toContain(`An agent's name is empty; ${listed}`);
    expect(existsSync(project)).toBe(false);
  });

  it("refuses a folder with --user and an unknown subcommand", () => {
    expect(mdg(scratch, "skill", "install", "x", "--user").code).toBe(2);
    const unknown = mdg(scratch, "skill", "remove");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("skill install [folder], skill prompt");
    const help = mdg(scratch, "skill", "--help").stdout;
    expect(help).toContain("Usage: skill install");
    expect(help).toContain("skill prompt");
  });
});

describe("skill prompt", () => {
  it("prints the agent setup prompt byte for byte", () => {
    const { code, stdout, stderr } = mdg(scratch, "skill", "prompt");
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(readFileSync(PROMPT, "utf8"));
  });

  it("takes no argument", () => {
    for (const args of [["es"], ["--agent", "claude"], ["--force"]]) {
      const refused = mdg(scratch, "skill", "prompt", ...args);
      expect(refused.code).toBe(2);
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toContain("skill prompt takes no argument");
    }
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
