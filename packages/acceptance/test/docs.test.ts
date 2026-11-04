import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MERMAID_COVERAGE, PLANTUML_COVERAGE } from "@meltemi/diagrams-import";
import { REPO_ROOT } from "../src/corpus.js";

/** Folders whose Markdown is not documentation: dependencies, history and generated output. */
const SKIPPED = new Set([
  "node_modules",
  ".git",
  "dist",
  "release",
  ".test-output",
  ".vscode-test",
  "archive",
  ".claude",
  ".codex",
  ".agents",
]);

function markdownFiles(folder: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(path));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** The text outside fenced code blocks and inline code, line by line. */
function proseLines(text: string): string[] {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return "";
    }
    return fenced ? "" : line.replace(/`[^`]*`/g, "");
  });
}

/** GitHub's anchors of a Markdown file's headings. */
function anchors(text: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const line of proseLines(text.replace(/`([^`]*)`/g, "$1"))) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const slug = heading[1]!
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    out.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return out;
}

const documents = markdownFiles(REPO_ROOT);

describe("documentation links", () => {
  it("covers the documentation", () => {
    const names = documents.map((d) => relative(REPO_ROOT, d).replaceAll("\\", "/"));
    for (const doc of ["README.md", "docs/README.md", "docs/getting-started.md", "RELEASING.md"]) {
      expect(names).toContain(doc);
    }
  });

  it("resolves every relative link and heading anchor", () => {
    const broken: string[] = [];
    for (const document of documents) {
      const text = readFileSync(document, "utf8");
      proseLines(text).forEach((line, i) => {
        for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const target = match[1]!;
          if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
          const [pathPart, anchor] = target.split("#") as [string, string | undefined];
          const file = pathPart === "" ? document : resolve(dirname(document), decodeURI(pathPart));
          const where = `${relative(REPO_ROOT, document).replaceAll("\\", "/")}:${i + 1}`;
          if (!existsSync(file)) {
            broken.push(`${where}: ${target} does not exist`);
            continue;
          }
          if (anchor && file.endsWith(".md") && statSync(file).isFile()) {
            if (!anchors(readFileSync(file, "utf8")).has(anchor)) {
              broken.push(`${where}: ${target} names no heading`);
            }
          }
        }
      });
    }
    expect(broken).toEqual([]);
  });
});

/** The pages people read to learn and use the product: each has a Spanish version. */
const TRANSLATED = [
  "README.md",
  ...[
    "README",
    "getting-started",
    "features",
    "editor",
    "playground",
    "cloud",
    "cli",
    "player",
    "catalog",
    "assist",
    "plugins",
    "security",
    "compatibility",
    "performance",
    "agents",
  ].map((name) => `docs/${name}.md`),
  ...["language", "tracks", "import"].flatMap((folder) =>
    readdirSync(join(REPO_ROOT, "docs", folder))
      .filter((name) => name.endsWith(".md"))
      .map((name) => `docs/${folder}/${name}`),
  ),
];

/** The Spanish version of a page. */
const spanishOf = (path: string) =>
  path === "README.md" ? "README.es.md" : `docs/es/${path.slice("docs/".length)}`;

/** The relative link from one page of the repository to another. */
const linkFrom = (from: string, to: string) =>
  relative(dirname(join(REPO_ROOT, from)), join(REPO_ROOT, to)).replaceAll("\\", "/");

/** The paragraph right under a page's title. */
function languageLine(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const title = lines.findIndex((line) => line.startsWith("# "));
  return lines.slice(title + 1).find((line) => line.trim() !== "");
}

/** The levels of a page's headings, in order. */
const headingLevels = (text: string) =>
  proseLines(text).flatMap((line) => {
    const heading = /^(#{1,6})\s/.exec(line);
    return heading ? [heading[1]!.length] : [];
  });

/** Comment syntax of the code blocks whose comments are translated. */
const LINE_COMMENTS: Readonly<Record<string, RegExp>> = {
  // `.meltemi` samples are fenced as `text` or without a language.
  "": /(^|\s)\/\/.*$/,
  text: /(^|\s)\/\/.*$/,
  meltemi: /(^|\s)\/\/.*$/,
  ts: /(^|\s)\/\/.*$/,
  js: /(^|\s)\/\/.*$/,
  bash: /(^|\s)#.*$/,
  sh: /(^|\s)#.*$/,
  powershell: /(^|\s)#.*$/,
  yaml: /(^|\s)#.*$/,
};

/** The fenced code blocks of a page, without comments and blank lines. */
function codeBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  let comment: RegExp | undefined;
  for (const line of text.split(/\r?\n/)) {
    const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      if (current === null) {
        current = [];
        comment = LINE_COMMENTS[fence[2]!];
      } else {
        blocks.push(current.join("\n"));
        current = null;
      }
      continue;
    }
    if (current === null) continue;
    const code = (comment ? line.replace(comment, "") : line).trimEnd();
    if (code.trim() !== "") current.push(code);
  }
  return blocks;
}

describe("documentation in Spanish", () => {
  it.each(TRANSLATED)("%s has a Spanish version with a language line in both", (path) => {
    const spanish = spanishOf(path);
    expect(existsSync(join(REPO_ROOT, spanish)), `${spanish} exists`).toBe(true);
    const english = readFileSync(join(REPO_ROOT, path), "utf8");
    const translated = readFileSync(join(REPO_ROOT, spanish), "utf8");
    expect(languageLine(english), path).toBe(`[Español](${linkFrom(path, spanish)})`);
    expect(languageLine(translated), spanish).toBe(`[English](${linkFrom(spanish, path)})`);
  });

  it.each(TRANSLATED)("%s and its Spanish version have the same headings and code", (path) => {
    const english = readFileSync(join(REPO_ROOT, path), "utf8");
    const translated = readFileSync(join(REPO_ROOT, spanishOf(path)), "utf8");
    expect(headingLevels(translated), "headings").toEqual(headingLevels(english));
    const englishCode = codeBlocks(english);
    const spanishCode = codeBlocks(translated);
    expect(spanishCode.length, "code blocks").toBe(englishCode.length);
    englishCode.forEach((block, i) => expect(spanishCode[i], `code block ${i + 1}`).toBe(block));
  });
});

describe("documentation tracks", () => {
  const tables = [
    ["docs/tracks/from-mermaid.md", MERMAID_COVERAGE],
    ["docs/tracks/from-plantuml.md", PLANTUML_COVERAGE],
  ] as const;

  it.each(tables)("%s promises only what the importer maps", (path, coverage) => {
    const text = readFileSync(join(REPO_ROOT, path), "utf8");
    const claims = [...text.matchAll(/\b(mapped|approximated|dropped) \(`([^`]+)`\)/g)];
    expect(claims.length).toBeGreaterThan(10);
    for (const [, status, construct] of claims) {
      const entries = coverage.filter((e) => e.construct === construct);
      expect(entries.length, `${construct} is in the coverage table`).toBeGreaterThan(0);
      expect(
        entries.map((e) => e.status),
        construct,
      ).toContain(status);
      expect(status, construct).not.toBe("dropped");
    }
  });

  /** The statuses as the Spanish tracks write them. */
  const SPANISH_STATUS: Readonly<Record<string, string>> = {
    convertido: "mapped",
    aproximado: "approximated",
    descartado: "dropped",
  };

  it.each([
    ["docs/es/tracks/from-mermaid.md", MERMAID_COVERAGE],
    ["docs/es/tracks/from-plantuml.md", PLANTUML_COVERAGE],
  ] as const)("%s promises only what the importer maps", (path, coverage) => {
    const text = readFileSync(join(REPO_ROOT, path), "utf8");
    const claims = [...text.matchAll(/(convertido|aproximado|descartado) \(`([^`]+)`\)/g)];
    expect(claims.length).toBeGreaterThan(10);
    for (const [, word, construct] of claims) {
      const status = SPANISH_STATUS[word!]!;
      const entries = coverage.filter((e) => e.construct === construct);
      expect(entries.length, `${construct} is in the coverage table`).toBeGreaterThan(0);
      expect(
        entries.map((e) => e.status),
        construct,
      ).toContain(status);
      expect(status, construct).not.toBe("dropped");
    }
  });

  it("gives each Spanish track the same sections", () => {
    for (const track of ["from-mermaid", "from-plantuml", "from-visual-editors"]) {
      const text = readFileSync(join(REPO_ROOT, "docs", "es", "tracks", `${track}.md`), "utf8");
      for (const heading of [
        "## Lo que no cambia",
        "## Lo que es distinto",
        "## Primeras cosas que probar",
      ]) {
        expect(text, `${track}: ${heading}`).toContain(`\n${heading}\n`);
      }
    }
  });

  it("gives each track the same sections", () => {
    for (const track of ["from-mermaid", "from-plantuml", "from-visual-editors"]) {
      const text = readFileSync(join(REPO_ROOT, "docs", "tracks", `${track}.md`), "utf8");
      for (const heading of [
        "## What stays the same",
        "## What is different",
        "## First things to try",
      ]) {
        expect(text, `${track}: ${heading}`).toContain(`\n${heading}\n`);
      }
    }
  });
});
