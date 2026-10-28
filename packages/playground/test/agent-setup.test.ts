import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The agent setup page (decision 0063): two static twins whose commands are the documentation's,
 * whose agents are the command line's table, and which carry no script, inline style or resource
 * from another origin.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const PAGES = {
  "packages/playground/agent-setup/en.html": read("../agent-setup/en.html"),
  "packages/playground/agent-setup/es.html": read("../agent-setup/es.html"),
};
const [EN, ES] = Object.keys(PAGES) as [keyof typeof PAGES, keyof typeof PAGES];
const DOCS = read("../../../docs/agents.md");

/** The one link to another origin the pages hold: the documentation for agents. */
const DOCS_LINK = "https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/agents.md";

const decode = (html: string) =>
  html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

/** The text of every `pre > code` block of a page. */
const codeBlocks = (html: string) =>
  [...html.matchAll(/<pre[^>]*>\s*<code>([\s\S]*?)<\/code>\s*<\/pre>/g)].map((m) =>
    decode(m[1]!).trim(),
  );

/** The fenced blocks of a Markdown page, as written. */
const fencedBlocks = (markdown: string) =>
  [...markdown.matchAll(/^```[\w-]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]!.trim());

/** Every address in a `href` or `src` that names another origin. */
const externalLinks = (html: string) =>
  [...html.matchAll(/\b(?:href|src)="(https?:[^"]*)"/g)].map((m) => m[1]!).sort();

/** The agents table's rows: the name and the folder, the first and last `code` of each row. */
const agentRows = (html: string) => {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => {
    const codes = [...row[1]!.matchAll(/<code>([^<]*)<\/code>/g)].map((m) => m[1]!);
    return [codes[0], codes.at(-1)];
  });
};

describe("the agent setup page", () => {
  it.each(Object.entries(PAGES))(
    "%s has no script, inline style or foreign resource",
    (_, html) => {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\sstyle=/i);
      expect(externalLinks(html)).toEqual([DOCS_LINK]);
      expect(html).toContain('content="{{policy}}"');
      expect(html).toContain('content="Meltemi Diagrams {{version}}"');
    },
  );

  it("holds the same code blocks and links to another origin in both languages", () => {
    expect(codeBlocks(PAGES[ES]), `${ES} against ${EN}`).toEqual(codeBlocks(PAGES[EN]));
    expect(externalLinks(PAGES[ES]), `${ES} against ${EN}`).toEqual(externalLinks(PAGES[EN]));
  });

  it("shows only commands the documentation for agents has", () => {
    const fenced = new Set(fencedBlocks(DOCS));
    const blocks = codeBlocks(PAGES[EN]);
    const missing = blocks.filter((block) => !fenced.has(block));
    expect(missing, `blocks of ${EN} that docs/agents.md does not fence`).toEqual([]);
    expect(blocks).toContain("npx @meltemi/diagrams-cli@latest skill install --agent <names>");
    const prompt = blocks.find((block) => block.startsWith("Set up Meltemi Diagrams"));
    expect(prompt, "the one-line prompt").toBeDefined();
    expect(prompt).toContain("https://diagrams.meltemi.dev/agent-setup/prompt.md");
  });

  it.each(Object.entries(PAGES))(
    "%s lists the command line's agents and folders",
    async (_, html) => {
      const { SKILL_AGENTS } = (await import(
        /* @vite-ignore */ new URL("../../cli/src/skill-command.ts", import.meta.url).href
      )) as { SKILL_AGENTS: Record<string, string> };
      expect(agentRows(html)).toEqual(Object.entries(SKILL_AGENTS));
    },
  );

  it("links the prompt, the stylesheet and its twin relatively", () => {
    const en = PAGES[EN];
    const es = PAGES[ES];
    expect(en).toContain('href="prompt.md"');
    expect(en).toContain('href="agent-setup.css"');
    expect(en).toContain('hreflang="es" href="../es/agent-setup/"');
    expect(es).toContain('href="../../agent-setup/prompt.md"');
    expect(es).toContain('href="../../agent-setup/agent-setup.css"');
    expect(es).toContain('hreflang="en" href="../../agent-setup/"');
    expect(en).toMatch(/<html lang="en">/);
    expect(es).toMatch(/<html lang="es">/);
  });
});
