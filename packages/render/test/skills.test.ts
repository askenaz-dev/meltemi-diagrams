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
import { BUNDLED_FAMILIES } from "@meltemi/diagrams-fonts";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { DIAGRAM_TYPES, THEME_TOKENS, compile } from "@meltemi/diagrams-model";
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
// The agent folders, and the command line's package, which installs the skills elsewhere.
const agentDirs = [".claude", ".agents", "packages/cli"];
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

  it("meltemi-diagrams has the front matter and the size the Agent Skills specification allows", () => {
    const text = readFileSync(join(skillsRoot, "meltemi-diagrams", "SKILL.md"), "utf8");
    // The keys by regex, without a YAML parser: one line each, `version` under `metadata`.
    const front = text.split(/^---$/m)[1] ?? "";
    const key = (name: string) => front.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1];
    expect(key("name")).toBe("meltemi-diagrams");
    const description = key("description") ?? "";
    expect(
      description.length,
      `the description is ${description.length} characters; the limit is 1,024`,
    ).toBeLessThanOrEqual(1024);
    expect(description.startsWith("Use when")).toBe(true);
    expect(key("license")).toBe("MIT");
    const cli = readFileSync(join(REPO_ROOT, "packages", "cli", "src", "cli.ts"), "utf8");
    const version = cli.match(/export const CLI_VERSION = "([^"]+)";/)?.[1];
    expect(
      front.match(/^metadata:\r?\n {2}version: (\S+)$/m)?.[1],
      `metadata.version must be CLI_VERSION ${version} (pnpm release:version writes both)`,
    ).toBe(version);
    const lines = text.split("\n");
    expect(lines.length, "SKILL.md must stay under 500 lines").toBeLessThanOrEqual(500);
    // The token rule survives a compacted session, which keeps the start of a skill.
    const token = lines.findIndex((line) => line.includes("`mdg_…`"));
    expect(token, "the token rule within the first 40 lines").toBeGreaterThanOrEqual(0);
    expect(token).toBeLessThan(40);
    expect(text).toContain("`Checked 1 file: 0 errors, 0 warnings.`");
    // The cloud commands live in their reference, which only a person's request leads to.
    expect(existsSync(join(skillsRoot, "meltemi-diagrams", "reference", "cloud.md"))).toBe(true);
    expect(text).not.toMatch(/pnpm mdg (login|logout|whoami|push|pull|publish|projects)\b/);
  });

  // `agent-skill`, "Effects on a diagram or a story": the request's words decide between `animate`
  // on the diagram that exists and a `story`, in the workflow and where each form is read.
  describe("meltemi-diagrams tells effects on a diagram from a story", () => {
    const read = (file: string) =>
      readFileSync(join(skillsRoot, "meltemi-diagrams", file), "utf8").replace(/\s+/g, " ");
    const skill = read("SKILL.md");
    const section =
      readFileSync(join(skillsRoot, "meltemi-diagrams", "SKILL.md"), "utf8")
        .split("## Motion: effects or a story")[1]
        ?.split("\n## ")[0] ?? "";

    it("decides by the request in the workflow, before the template", () => {
      const rule = skill.indexOf('"Animate this arrow" or "animate the diagram" is `animate`');
      expect(rule, "the rule is in the workflow").toBeGreaterThan(0);
      expect(rule).toBeLessThan(skill.indexOf("## Template"));
      expect(skill).toContain("and no story");
      expect(skill).toContain('"Show me the flow step by step" is a `story`');
      expect(skill).toContain("[Motion: effects or a story](#motion-effects-or-a-story)");
    });

    it("gives a short example of each, and both compile together", () => {
      const blocks = [...section.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]!);
      expect(blocks).toHaveLength(2);
      const [effects, story] = blocks as [string, string];
      expect(effects).toContain("animate request, create { effect flow }");
      expect(effects).not.toContain("story");
      expect(story.startsWith("story purchase for checkout {")).toBe(true);
      expect(story).not.toContain("animate");
      const compilation = compile(
        `language "0.2"\n\ndiagram checkout: flow {\n  client["Client"]\n  api["API"]\n  orders["Orders"]\n${effects}}\n\n${story}`,
      );
      expect(compilation.diagnostics).toEqual([]);
      const diagram = compilation.document.diagrams[0]!;
      expect(diagram.animations.map((entry) => [entry.target, entry.effect])).toEqual([
        ["request", "flow"],
        ["create", "flow"],
      ]);
      expect(compilation.document.stories.map((entry) => entry.id)).toEqual(["purchase"]);
    });

    it("says how each is checked, and what to write when the request does not say", () => {
      const text = section.replace(/\s+/g, " ");
      for (const phrase of [
        "write only the one that was asked",
        "name an anonymous relation with `as <id>`",
        "Check effects on the diagram itself, never through a story",
        "--at 300ms",
        "`preview` with `at` and no `story`",
        "report's `motion`",
        "its compiled timeline and each scene's frame",
        "effects are the smaller change",
      ]) {
        expect(text, phrase).toContain(phrase);
      }
    });

    it("states the rule where each form is read", () => {
      const language = read("reference/language.md");
      expect(language).toContain('"Animate this arrow" or "animate the diagram" asks for these');
      expect(language).toContain("is [`animate`](#animate), not a story");
      expect(language).toContain("`preview` with `at` and no `story`");
      const stories = read("reference/stories.md");
      expect(stories).toContain('"Animate this arrow" or "animate the diagram" is not a story');
      expect(stories).toContain("[language.md](language.md#animate)");
      const mcp = read("reference/mcp.md");
      expect(mcp).toContain("## Effects in motion");
      expect(mcp).toContain("Give `at` and no `story`");
      for (const field of ["`motion`", "`phase`", "`marks`", "`along`", "`loopMs`"]) {
        expect(mcp, field).toContain(field);
      }
      expect(mcp).toContain("A story is for a walkthrough step by step, not for animating arrows");
    });
  });

  // `agent-skill`, "Choosing the profile from the request", "The design reference", "Looking at the
  // drawing before delivering" and "A theme from a brand".
  describe("meltemi-diagrams teaches design", () => {
    const root = join(skillsRoot, "meltemi-diagrams");
    const raw = (file: string) => readFileSync(join(root, file), "utf8");
    const flat = (file: string) => raw(file).replace(/\s+/g, " ");
    /** The fenced `text` blocks of a Markdown text. */
    const blocks = (markdown: string) =>
      [...markdown.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]!);
    /** The codes of the diagnostics of a sheet, compiled and laid out with ELK. */
    const engine = createElkEngine();
    const diagnosticsOf = (source: string) => {
      const compilation = compile(`language "0.2"\n\n${source}`);
      const codes = compilation.diagnostics.map((d) => d.code);
      for (const diagram of compilation.document.diagrams) {
        const layout = layoutDiagram(compilation, diagram, { engine });
        codes.push(...layout.diagnostics.map((d) => d.code));
      }
      return codes;
    };

    it("chooses the profile from a table with a row for every profile, before the template", () => {
      const workflow = raw("SKILL.md").split("## Template")[0]!;
      const rows = workflow
        .split("\n")
        .filter((line) => /^\s*\| [a-z]/.test(line))
        .map((line) => line.split("|").map((cell) => cell.trim()));
      for (const profile of DIAGRAM_TYPES) {
        const row = rows.find((cells) => cells[2]!.includes(`\`${profile}\``));
        expect(row, `a row of the table for the ${profile} profile`).toBeDefined();
        const links = [...row![3]!.matchAll(/\]\(([^)#]+)\)/g)].map((m) => m[1]!);
        expect(links.length, `${profile}: a reference and an example`).toBe(2);
        for (const path of links) {
          expect(existsSync(join(root, path)), `${profile}: ${path}`).toBe(true);
        }
      }
      const text = workflow.replace(/\s+/g, " ");
      expect(text).toContain("Do not draw what a table or a sentence says as well");
      expect(text).toContain("say the plan in one line");
      expect(text).toContain("continue without waiting for an answer");
    });

    it("links the design reference, which has its sections in order", () => {
      expect(raw("SKILL.md")).toContain("[reference/design.md](reference/design.md)");
      const headings = raw("reference/design.md")
        .split("\n")
        .filter((line) => line.startsWith("## "));
      expect(headings).toEqual([
        "## Focus",
        "## Density",
        "## Colour",
        "## Text",
        "## Arrangement",
        "## What to avoid",
        "## Before you deliver",
      ]);
      const design = flat("reference/design.md");
      for (const phrase of [
        "one or two elements that carry the message",
        "Up to twelve boxes read at a glance",
        "Beyond thirty, split it",
        "need a legend",
        "Dashed means one thing in a sheet",
        "Run the removal test",
      ]) {
        expect(design, phrase).toContain(phrase);
      }
    });

    it("gives examples in the design reference that draw without a diagnostic", () => {
      const examples = blocks(raw("reference/design.md"));
      expect(examples.length).toBeGreaterThanOrEqual(3);
      for (const example of examples) {
        expect(diagnosticsOf(example), example.split("\n")[0]).toEqual([]);
      }
    });

    it("has the agent look at a picture and name what it found before delivering", () => {
      const review = flat("SKILL.md").split("5. Look at the drawing")[1]!.split(" 6. ")[0]!;
      for (const phrase of [
        "never at the text of the SVG",
        "--format png --scale 1",
        "call `preview`",
        "cut or overlapping text",
        "a label away from its arrow",
        "an arrow through a box it does not join",
        "uneven gaps between peers",
        "a crowded part beside an empty one",
        "text too small to read",
        "in your report take them one by one",
        "name each defect you found and how you fixed it, or say why it does not apply",
        "stop after two rounds",
        "say that the sheet was validated and not looked at",
        "`pnpm preview` serves the repository",
      ]) {
        expect(review, phrase).toContain(phrase);
      }
      const mcp = flat("reference/mcp.md");
      expect(mcp).toContain("Look at the PNG, never at the SVG's text");
      expect(mcp).toContain("validated and not looked at");
    });

    it("makes a theme from a brand with tokens and bundled families of the language", () => {
      const section = raw("reference/themes.md")
        .split("## A theme from a brand")[1]
        ?.split("\n## ")[0];
      expect(section, "the section").toBeDefined();
      const rows = section!
        .split("\n")
        .filter((line) => /^\s*\| /.test(line) && !/^\s*\| -/.test(line))
        .map((line) => line.split("|").map((cell) => cell.trim()));
      const tokenRows = rows.filter((cells) => cells[2]!.startsWith("`") || cells[2] === "Token");
      const tokens = tokenRows.flatMap((cells) =>
        [...cells[2]!.matchAll(/`([A-Za-z]+)`/g)].map((m) => m[1]!),
      );
      expect(tokens.length).toBeGreaterThan(8);
      for (const token of tokens) expect(Object.keys(THEME_TOKENS), token).toContain(token);
      const bundled = BUNDLED_FAMILIES.map((f) => f.family);
      const families = rows
        .filter((cells) => !tokenRows.includes(cells) && cells[2] !== "Bundled family")
        .flatMap((cells) => cells[2]!.split(/, or |, /).map((name) => name.trim()));
      expect(families.length).toBeGreaterThan(8);
      for (const family of families) expect(bundled, family).toContain(family);
      const [theme] = blocks(section!);
      const sheet = `${theme}\ndiagram d: flow {\n  theme "brand"\n  a["API"]\n  tag t "Tag"\n}\n`;
      expect(diagnosticsOf(sheet)).toEqual([]);
      const text = section!.replace(/\s+/g, " ");
      expect(text).toContain("keep the brand's colour as the fill and change the text");
      expect(text).toContain("only when the person asks");
    });
  });

  it.each(skills)(
    "%s is copied unchanged to .claude/skills, .agents/skills and the CLI package",
    (name) => {
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
    },
  );

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
      write(".agents/skills/old/SKILL.md", "stale");
      write(".agents/skills/.skills-sync.json", JSON.stringify({ skills: ["old", "../outside"] }));
      write("outside/keep.txt", "outside the agent folder");

      execFileSync(process.execPath, [syncScript], { cwd: root, stdio: "pipe" });

      expect(readdirSync(join(root, ".claude", "skills")).sort()).toEqual([
        ".skills-sync.json",
        "fresh",
        "openspec-propose",
      ]);
      expect(readdirSync(join(root, ".agents", "skills")).sort()).toEqual([
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
