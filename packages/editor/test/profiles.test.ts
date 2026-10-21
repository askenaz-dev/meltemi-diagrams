import { describe, expect, it } from "vitest";
import {
  analyzeDocument,
  completions,
  definition,
  documentSymbols,
  hover,
  semanticTokens,
} from "../src/index.js";

const TEXT = [
  'language "0.2"',
  "diagram checkout: flow {",
  '  api["API"] { url "https://docs.example.com" }',
  "}",
  "story tour for checkout {",
  "  scene one { reveal api }",
  "}",
  "export slide for checkout {",
  "  format png",
  "  scale 2",
  "}",
  "",
].join("\n");
const analysis = analyzeDocument({ text: TEXT });

/** Completion labels after inserting `line` as a new statement of the profile. */
function completeIn(line: string): string[] {
  const at = TEXT.indexOf("  scale 2\n") + "  scale 2\n".length;
  const text = TEXT.slice(0, at) + line + TEXT.slice(at);
  return completions(analyzeDocument({ text }), at + line.length).map((i) => i.label);
}

describe("export profile services", () => {
  it("offers the options of the format, and their values", () => {
    const options = completeIn("  ");
    expect(options).toEqual(expect.arrayContaining(["size", "background", "at", "theme", "file"]));
    // Written already, or not for PNG.
    expect(options).not.toContain("scale");
    expect(options).not.toContain("link");
    expect(completeIn("  background ")).toEqual(expect.arrayContaining(["transparent", "accent"]));
    const text = `${TEXT}export other for `;
    expect(completions(analyzeDocument({ text }), text.length).map((i) => i.label)).toEqual(
      expect.arrayContaining(["checkout", "tour"]),
    );
  });

  it("explains profiles and their options", () => {
    expect(hover(analysis, TEXT.indexOf("slide") + 1)!.markdown).toContain(
      "**export profile** `slide` — PNG, of the diagram `checkout`, scale 2",
    );
    expect(hover(analysis, TEXT.indexOf("scale 2") + 1)!.markdown).toContain("PNG pixels per unit");
    expect(hover(analysis, TEXT.indexOf('url "') + 1)!.markdown).toContain(
      "A hyperlink for exports",
    );
  });

  it("lists profiles, leads to their target and colours them", () => {
    expect(documentSymbols(analysis).find((s) => s.kind === "export")).toMatchObject({
      name: "slide",
      detail: "png of checkout",
    });
    const target = TEXT.indexOf("for checkout {\n  format") + 5;
    expect(definition(analysis, target)!.start.offset).toBe(TEXT.indexOf("checkout"));
    expect(semanticTokens(analysis).find((t) => t.start === TEXT.indexOf("slide"))).toMatchObject({
      type: "type",
      declaration: true,
    });
  });
});
