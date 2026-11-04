import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";

const CODE = /"((?:syntax|language|profile|block|ref|prop|placement|edit)\.[a-z-]+)"/g;

function codesInSources(): Set<string> {
  const codes = new Set<string>();
  for (const pkg of readdirSync(join(REPO_ROOT, "packages"))) {
    const src = join(REPO_ROOT, "packages", pkg, "src");
    for (const file of readdirSync(src).filter((f) => f.endsWith(".ts"))) {
      for (const match of readFileSync(join(src, file), "utf8").matchAll(CODE))
        codes.add(match[1]!);
    }
  }
  return codes;
}

describe("documentation", () => {
  it("lists every diagnostic and rejection code used in the sources", () => {
    const doc = readFileSync(join(REPO_ROOT, "docs", "language", "diagnostics.md"), "utf8");
    const codes = codesInSources();
    expect(codes.size).toBeGreaterThan(25);
    for (const code of codes)
      expect(doc, `docs/language/diagnostics.md lists ${code}`).toContain(`\`${code}\``);
  });

  it("has a corpus example for every source diagnostic code", () => {
    const examples = new Set(
      readdirSync(join(REPO_ROOT, "corpus", "invalid"))
        .filter((f) => f.endsWith(".meltemi"))
        .map((f) => f.replace(/\.meltemi$/, "")),
    );
    for (const code of codesInSources()) {
      if (!code.startsWith("edit."))
        expect(examples, `corpus/invalid/${code}.meltemi`).toContain(code);
    }
  });
});
