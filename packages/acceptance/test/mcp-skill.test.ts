// The skill's MCP reference against the endpoint's catalogue (change agent-mcp, `agent-skill` "The
// MCP in the skill and the agents guide"): every tool the endpoint lists is named in the reference,
// and the reference names no tool the endpoint does not have; SKILL.md names the reference within
// its size rule, and the agents guide in both languages says the same for people.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const SKILL = join(REPO_ROOT, "skills", "meltemi-diagrams");
const reference = readFileSync(join(SKILL, "reference", "mcp.md"), "utf8");

/** The names of the endpoint's tools, from the catalogue the server registers. */
async function catalogue(): Promise<string[]> {
  const server = pathToFileURL(
    join(REPO_ROOT, "packages", "cloud", "src", "mcp", "server.ts"),
  ).href;
  const { CATALOGUE } = (await import(/* @vite-ignore */ server)) as {
    CATALOGUE: readonly { name: string }[];
  };
  return CATALOGUE.map((tool) => tool.name);
}

/** The tools a text names: snake_case words in backticks that look like a tool's name. */
function namedTools(text: string): Set<string> {
  return new Set(
    [
      ...text.matchAll(/`([a-z]+(?:_[a-z]+)+|whoami|invite|validate|preview|publish|unpublish)`/g),
    ].map((m) => m[1]!),
  );
}

describe("the skill's MCP reference", () => {
  it("names every tool of the endpoint's catalogue, and only those", async () => {
    const tools = await catalogue();
    expect(tools.length).toBe(27);
    const section = reference.split("## The tools")[1]?.split("\n## ")[0] ?? "";
    const named = namedTools(section);
    const missing = tools.filter((tool) => !named.has(tool));
    expect(
      missing,
      `tools of the endpoint the reference does not name: ${missing.join(", ")}`,
    ).toEqual([]);
    const unknown = [...named].filter((name) => !tools.includes(name));
    expect(
      unknown,
      `tools the reference names that the endpoint does not have: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("teaches the connection, the workflow and the rules", () => {
    for (const phrase of [
      "codex mcp add meltemi --url https://diagrams.meltemi.dev/mcp",
      "codex mcp login meltemi",
      'bearer_token_env_var = "MELTEMI_TOKEN"',
      "`ifRevision`",
      "`idempotencyKey`",
      "`revision.mismatch`",
      "`diagram.invalid`",
      "`open_url`",
      "`emailSent: false`",
    ]) {
      expect(reference, phrase).toContain(phrase);
    }
    expect(reference).toMatch(/Never ask for, print, read, copy or write the token/);
    expect(reference).toMatch(/No email is sent: never\s+say one was\./);
    // The workflow's order: read, write, validate, preview, then the address.
    const order = [
      "1. Read before you write",
      "2. Write with `write_files`",
      "5. `validate`",
      "6. Give the person `open_url`",
    ];
    const at = order.map((step) => reference.indexOf(step));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("is named by SKILL.md, which keeps its size rule", () => {
    const skill = readFileSync(join(SKILL, "SKILL.md"), "utf8");
    expect(skill).toContain("[reference/mcp.md](reference/mcp.md)");
    expect(skill.split("\n").length).toBeLessThanOrEqual(500);
    const token = skill.split("\n").findIndex((line) => line.includes("`mdg_…`"));
    expect(token).toBeGreaterThanOrEqual(0);
    expect(token).toBeLessThan(40);
  });

  it.each(["docs/agents.md", "docs/es/agents.md"])(
    "%s tells people how to connect an agent",
    (path) => {
      const text = readFileSync(join(REPO_ROOT, path), "utf8");
      expect(text).toContain("codex mcp add meltemi --url https://diagrams.meltemi.dev/mcp");
      expect(text).toContain("codex mcp login meltemi");
      expect(text).toContain('bearer_token_env_var = "MELTEMI_TOKEN"');
      expect(text).toContain("emailSent");
    },
  );

  it.each([
    ["skills/meltemi-diagrams/reference/mcp.md", reference],
    ["docs/agents.md", readFileSync(join(REPO_ROOT, "docs/agents.md"), "utf8")],
    ["docs/es/agents.md", readFileSync(join(REPO_ROOT, "docs/es/agents.md"), "utf8")],
  ])("%s says how to start and connect the local server", (path, text) => {
    for (const phrase of [
      "npx -y @meltemi/diagrams-cli@latest mcp",
      "http://127.0.0.1:7373/mcp",
      "--folder",
    ]) {
      expect(text, `${path} lacks ${phrase}`).toContain(phrase);
    }
  });
});
