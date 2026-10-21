import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { formatSource, parse, type Token } from "@meltemi/diagrams-language";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { compile, toJson } from "../src/index.js";

/** Every `.meltemi` file under the given repository folders, sorted. */
function sources(...folders: string[]): [string, string][] {
  const found: [string, string][] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry.endsWith(".meltemi")) {
        found.push([relative(REPO_ROOT, path).split("\\").join("/"), readFileSync(path, "utf8")]);
      }
    }
  };
  for (const folder of folders) visit(join(REPO_ROOT, folder));
  return found;
}

const significant = (text: string) =>
  parse(text)
    .tokens.filter((t: Token) => t.kind !== "Newline" && t.kind !== "EOF")
    .map((t) => `${t.kind}:${t.text}`);

const comments = (text: string) =>
  parse(text).tokens.flatMap((t) =>
    t.leadingTrivia
      .filter((trivia) => trivia.kind === "LineComment" || trivia.kind === "BlockComment")
      .map((trivia) => trivia.text),
  );

/** The model JSON without source positions, which formatting is allowed to change. */
function withoutRanges(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRanges);
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const isRange =
      inner !== null && typeof inner === "object" && "start" in inner && "end" in inner;
    if (!isRange) result[key] = withoutRanges(inner);
  }
  return result;
}

const FILES = sources(
  "corpus/valid",
  "corpus/edits",
  "corpus/projects/valid",
  "examples",
  "skills",
);

describe("formatter on the corpus", () => {
  it("covers a meaningful corpus", () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it.each(FILES)("%s keeps meaning, comments and is idempotent", (_name, text) => {
    const result = formatSource(text);
    const hasSyntaxErrors = parse(text).diagnostics.some((d) => d.severity === "error");
    // Fixtures that hold syntax errors on purpose must be refused, never rewritten.
    expect(result.ok).toBe(!hasSyntaxErrors);
    if (!result.ok) return;
    expect(significant(result.text)).toEqual(significant(text));
    expect(comments(result.text)).toEqual(comments(text));
    const again = formatSource(result.text);
    expect(again.ok && again.text).toBe(result.text);
    expect(withoutRanges(toJson(compile(result.text)))).toEqual(
      withoutRanges(toJson(compile(text))),
    );
  });
});
