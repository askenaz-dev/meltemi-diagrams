import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The agent setup prompt an agent reads and follows (decision 0063): served at
 * https://diagrams.meltemi.dev/agent-setup/prompt.md and printed by `skill prompt`.
 */
const PROMPT = readFileSync(
  fileURLToPath(new URL("../agent-setup/prompt.md", import.meta.url)),
  "utf8",
);

const HEADINGS = [
  "# Set up Meltemi Diagrams for a coding agent",
  "## What Meltemi Diagrams is",
  "## Before you start",
  "## Install the skill",
  "## Prove it",
  "## Never",
  "## Next",
];

/** What the agent must be told, each by a phrase no other sentence holds. */
const REQUIRED: Record<string, string> = {
  "the validation's last line": "Checked 1 file: 0 errors, 0 warnings.",
  "the install command": "npx @meltemi/diagrams-cli@latest skill install",
  "the version the prompt needs": "1.10.0",
  "the Node version": "Node 22.12",
  "stopping when Node is missing": "If it is missing or older",
  "the template when there is no code": "--template sequence",
  "the command that prints the prompt": "skill prompt",
};

/** The never-rules, each by its distinctive phrase, as the `## Never` section holds them. */
const NEVER: Record<string, string> = {
  "never a token": "mdg_",
  "never sign in unasked": "`login`",
  "never push unasked": "`push`",
  "never publish unasked": "`publish`",
  "never commit or stage without asking": "commit or stage",
  "never --force unasked": "`--force`",
  "never --user unasked": "`--user`",
  "never install Node": "install or download Node",
  "never draw by hand": "by hand",
  "never edit an exported SVG": "exported SVG",
  "import instead of retyping": "`mdg import`",
};

describe("the agent setup prompt", () => {
  it("has its seven headings, in order", () => {
    const headings = PROMPT.split("\n").filter((line) => /^#{1,2} /.test(line));
    expect(headings).toEqual(HEADINGS);
  });

  it("tells the agent what to check, install and prove", () => {
    const missing = Object.entries(REQUIRED)
      .filter(([, phrase]) => !PROMPT.includes(phrase))
      .map(([rule]) => rule);
    expect(missing, "the prompt lacks these").toEqual([]);
  });

  it("holds every never-rule in its Never section", () => {
    const never = PROMPT.slice(PROMPT.indexOf("## Never"), PROMPT.indexOf("## Next"));
    const missing = Object.entries(NEVER)
      .filter(([, phrase]) => !never.includes(phrase))
      .map(([rule]) => rule);
    expect(missing, "the Never section lacks these rules").toEqual([]);
  });

  it("is 500 to 1,000 words", () => {
    const words = PROMPT.split(/\s+/).filter((word) => word !== "").length;
    expect(words).toBeGreaterThanOrEqual(500);
    expect(words).toBeLessThanOrEqual(1000);
  });

  it("names the installed command only, and no retired folder", () => {
    const lines = PROMPT.split("\n");
    expect(lines.filter((line) => line.includes("pnpm"))).toEqual([]);
    expect(lines.filter((line) => line.includes(".codex"))).toEqual([]);
  });
});
