import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  codeActions,
  completions,
  definition,
  documentSymbols,
  exportFileName,
  formatDocument,
  highlights,
  hover,
  prepareRename,
  references,
  rename,
  semanticTokens,
} from "../src/index.js";
import { ProjectSessions } from "../src/node.js";

const sessions = new ProjectSessions({ toolVersion: "1.0.0" });

/** Analysis of a text with the cursor at `|`, and the offset of the cursor. */
function at(source: string) {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  return { analysis: analyzeDocument({ text }), offset, text };
}

const checkout = `diagram d: flow {
  layout manual
  api["API Gateway"]
  bus["Bus"] {
    port in west 30%
  }
  db[("DB")]
  cache["Cache"]
  api -> bus as publish
  api -> db: "save" as save
  placement {
    place api at (360, 180)
    place bus at (700, 180)
    place db at (700, 320)
    place cache at (360, 320)
    route publish from api.east to bus.in
    row api, bus
  }
  style api { fill accent }
}
`;

describe("document analysis", () => {
  it("analyses unsaved text inside its project", () => {
    const path = join(
      REPO_ROOT,
      "corpus/projects/valid/commerce/diagrams/checkout.meltemi",
    ).replace(/\\/g, "/");
    const onDisk = readFileSync(path, "utf8");
    const text = onDisk
      .replace("layout manual", "layout assisted")
      .replace(
        '  data orders "Orders"',
        '  data orders "Orders"\n  audit["Audit"]\n  orders -> audit',
      );
    const analysis = sessions.analyze(path, text, 3);
    sessions.close(path);
    expect(analysis.revision).toBe(3);
    expect(analysis.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    const view = analysis.diagrams[0]!;
    expect(view.layout?.boxes?.has("audit")).toBe(true);
    // The imported theme is used: its background differs from the default.
    expect(view.layout?.scene?.background).not.toBe("#F7FBFF");
    expect(readFileSync(path, "utf8")).toBe(onDisk);
  });

  it("merges compile and layout diagnostics once each", () => {
    const { analysis } = at(`diagram a: flow {
  layout manual
  x["X"] { colour red }
  placement { place x at (0, 0) }
}
diagram b: flow {
  layout manual
  p["P"]
  q["Q"]
  placement { place p at (0, 0); place q at (20, 10) }
}|`);
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(["prop.unknown", "layout.overlap"]);
  });
});

describe("completion", () => {
  const labels = (source: string) => {
    const { analysis, offset } = at(source);
    return completions(analysis, offset).map((i) => i.label);
  };

  it("offers the ports of an element after a dot", () => {
    expect(labels(checkout.replace("to bus.in", "to bus.|"))).toEqual([
      "in",
      "north",
      "south",
      "east",
      "west",
      "auto",
    ]);
  });

  it("offers the values of a property", () => {
    expect(labels(checkout.replace("layout manual", "layout |"))).toEqual([
      "auto",
      "assisted",
      "manual",
    ]);
  });

  it("offers relation targets, placement statements and constraint values", () => {
    expect(labels(checkout.replace("api -> db:", "api -> |db:"))).toEqual(
      expect.arrayContaining(["db", "cache", "bus"]),
    );
    expect(labels(checkout.replace("    row api, bus", "    |"))).toContain("distance");
    expect(labels(checkout.replace("    row api, bus", "    align api, bus |"))).toEqual([
      "top",
      "middle",
      "bottom",
      "left",
      "center",
      "right",
    ]);
    expect(labels(checkout.replace("fill accent", "fill |"))).toContain("accent");
    expect(labels(checkout.replace("fill accent", "|"))).toContain("routing");
    expect(labels(checkout.replace("  layout manual", '  theme "|"'))).toContain("technical.dark");
  });

  it("offers verticalAlign and its values in a free style, and neither on a flow node", () => {
    const free = (style: string) => `diagram s: free {\n  box a "A"\n  style a { ${style} }\n}\n`;
    expect(labels(free("|"))).toEqual(expect.arrayContaining(["verticalAlign", "textAlign"]));
    expect(labels(free("verticalAlign |"))).toEqual(["top", "middle", "bottom"]);
    const flow = labels(checkout.replace("fill accent", "|"));
    expect(flow).not.toContain("verticalAlign");
    expect(flow).not.toContain("textAlign");
    const word = at(free("vertical|Align top"));
    expect(hover(word.analysis, word.offset)!.markdown).toContain("text band");
  });

  it("offers the sketch token and its levels in a theme block, and the sketch themes", () => {
    expect(labels(`theme t {\n  |\n}\n`)).toContain("sketch");
    expect(labels(`theme t {\n  sketch |\n}\n`)).toEqual(["none", "light", "rough"]);
    expect(labels(checkout.replace("  layout manual", '  theme "|"'))).toEqual(
      expect.arrayContaining(["sketch.light", "sketch.dark"]),
    );
  });

  it("completes icons in quotes", () => {
    const icons = sessions.analyze(
      join(REPO_ROOT, "corpus/valid/checkout.meltemi").replace(/\\/g, "/"),
      readFileSync(join(REPO_ROOT, "corpus/valid/checkout.meltemi"), "utf8").replace(
        'icon "tabler:server"',
        'icon "tabler:serv"',
      ),
    );
    const offset = icons.text.indexOf('tabler:serv"') + "tabler:serv".length;
    const items = completions(icons, offset).map((i) => i.label);
    expect(items).toContain("tabler:server");
    expect(items.length).toBeLessThanOrEqual(200);
  });
});

describe("hover and navigation", () => {
  it("describes an element", () => {
    const { analysis, offset } = at(checkout.replace("api -> db", "|api -> db"));
    const markdown = hover(analysis, offset)!.markdown;
    expect(markdown).toContain("**node** `api` — API Gateway");
    expect(markdown).toContain("place (360, 180)");
    expect(markdown).toContain("size 160 × 56 (default)");
  });

  it("describes ports and keywords", () => {
    const port = at(checkout.replace("to bus.in", "to bus.|in"));
    expect(hover(port.analysis, port.offset)!.markdown).toContain("west side, 30%");
    const keyword = at(checkout.replace("    row api", "    |row api"));
    expect(hover(keyword.analysis, keyword.offset)!.markdown).toContain("Equal vertical centres");
  });

  it("finds the declaration and every use", () => {
    const { analysis, offset } = at(checkout.replace("place api at", "place |api at"));
    const declaration = definition(analysis, offset)!;
    expect(analysis.text.slice(declaration.start.offset, declaration.end.offset)).toBe("api");
    expect(declaration.start.line).toBe(3);
    // The declaration, two relations, a place, a route end, a constraint and a style.
    expect(references(analysis, offset)).toHaveLength(7);
    expect(highlights(analysis, offset).filter((h) => h.kind === "write")).toHaveLength(1);
  });

  it("lists symbols nested as written", () => {
    const { analysis } = at(
      `diagram d: flow {\n  group g "G" {\n    a["A"]\n  }\n  b["B"]\n  a -> b as ab\n}\n|`,
    );
    const [diagram] = documentSymbols(analysis);
    expect(diagram!.children.map((c) => [c.name, c.kind])).toEqual([
      ["g", "group"],
      ["b", "element"],
      ["ab", "relation"],
    ]);
    expect(diagram!.children[0]!.children.map((c) => c.name)).toEqual(["a"]);
  });

  it("names relations by the token as written: lines and two-way arrows", () => {
    const line = at(checkout.replace("  api -> bus", "  api -- cache as |link\n  api -> bus"));
    expect(hover(line.analysis, line.offset)!.markdown.split("\n")[0]).toBe(
      "**relation** `api -- cache` as `link`",
    );
    const { analysis } = at(`diagram d: flow {\n  api <-> cache\n  a --- b\n}\n|`);
    const [diagram] = documentSymbols(analysis);
    expect(diagram!.children.filter((c) => c.kind === "relation").map((c) => c.name)).toEqual([
      "api <-> cache",
      "a --- b",
    ]);
    // A relation with no target is no relation: no hover for it, and the missing target stands.
    const broken = at(`diagram d: flow {\n  api -|-\n}\n`);
    const shown = hover(broken.analysis, broken.offset);
    expect(shown?.markdown ?? "").not.toContain("**relation**");
    expect(broken.analysis.compilation.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("offers the elements after every relation token", () => {
    for (const token of ["->", "-->", "<->", "<-->", "--", "---"]) {
      const { analysis, offset } = at(
        checkout.replace("  api -> bus", `  api ${token} |\n  api -> bus`),
      );
      const labels = completions(analysis, offset).map((i) => i.label);
      expect(labels, token).toContain("db");
      expect(labels, token).toContain("cache");
    }
  });

  it("renames relations and refuses anonymous ones", () => {
    const styled = checkout.replace("  style api", "  style save { line dashed }\n  style api");
    const { analysis, offset } = at(styled.replace("as save", "as |save"));
    const result = rename(analysis, offset, "persist");
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(analysis.text, result.plan.edits);
    expect(after).toContain("as persist");
    expect(after).toContain("style persist {");
    const anonymous = at(`diagram d: flow {\n  a -> b\n  |a -> c\n}\n`);
    expect(prepareRename(anonymous.analysis, anonymous.offset)).toMatchObject({ ok: true });
    expect(prepareRename(anonymous.analysis, anonymous.offset + 3)).toMatchObject({ ok: false });
  });
});

describe("formatting and semantic tokens", () => {
  it("returns no edit for a formatted file and one edit otherwise", () => {
    const formatted = readFileSync(join(REPO_ROOT, "corpus/valid/checkout.meltemi"), "utf8");
    expect(formatDocument(analyzeDocument({ text: formatted }))).toEqual([]);
    const messy = formatted.replace("  direction LR", "      direction    LR");
    const edits = formatDocument(analyzeDocument({ text: messy }));
    expect(edits).toHaveLength(1);
    expect(applyTextEdits(messy, edits)).toBe(formatted);
  });

  it("marks declarations and uses", () => {
    const { analysis, text } = at(`diagram d: flow {\n  api["API"]\n  api -> db\n}\n|`);
    const tokens = semanticTokens(analysis).filter(
      (t) => text.slice(t.start, t.start + t.length) === "api",
    );
    expect(tokens.map((t) => [t.type, t.declaration])).toEqual([
      ["variable", true],
      ["variable", false],
    ]);
  });
});

describe("quick fixes", () => {
  it("declares or reuses a port", () => {
    const { analysis, offset } = at(checkout.replace("to bus.in", "to bus.|inbox"));
    const actions = codeActions(analysis, { start: offset, end: offset });
    expect(actions.map((a) => a.title)).toEqual(
      expect.arrayContaining(["Declare port `inbox` on `bus`", "Use `bus.in`"]),
    );
    const declare = actions.find((a) => a.title.startsWith("Declare port"))!;
    expect(applyTextEdits(analysis.text, declare.edits)).toContain("    port inbox west\n");
  });

  it("switches an automatic diagram with places to assisted", () => {
    const { analysis, offset } = at(
      checkout.replace("layout manual", "layout auto").replace("    place api", "    |place api"),
    );
    const action = codeActions(analysis, { start: offset, end: offset }).find(
      (a) => a.title === "Switch to `layout assisted`",
    )!;
    const after = applyTextEdits(analysis.text, action.edits);
    expect(after).toContain("layout assisted");
    expect(analyzeDocument({ text: after }).diagnostics.map((d) => d.code)).not.toContain(
      "layout.placement-ignored",
    );
  });

  it("arranges unplaced elements and fixes typos", () => {
    const missing = at(checkout.replace("    place cache at (360, 320)\n", "") + "|");
    const arrange = codeActions(missing.analysis, {
      start: missing.text.indexOf('cache["Cache"]'),
      end: missing.text.indexOf('cache["Cache"]'),
    }).find((a) => a.title === "Arrange the unplaced elements with ELK")!;
    expect(applyTextEdits(missing.text, arrange.edits)).toMatch(/place cache at \(-?\d+, -?\d+\)/);
    const typo = at(checkout.replace("fill accent", "fil| accent"));
    const change = codeActions(typo.analysis, { start: typo.offset, end: typo.offset }).find((a) =>
      a.title.startsWith("Change to"),
    )!;
    expect(change.title).toBe("Change to `fill`");
  });

  it("reads what it needs from the diagnostic's data, whatever its words", () => {
    // Messages and hints follow the interface language; fixes must not depend on them.
    const titles = (source: string) => {
      const { analysis, offset } = at(source);
      const reworded = analysis.diagnostics.map((d) => ({
        ...d,
        message: "§",
        hints: d.hints?.map(() => "§"),
      }));
      return codeActions(
        { ...analysis, diagnostics: reworded },
        { start: offset, end: offset },
      ).map((a) => a.title);
    };
    expect(titles(checkout.replace("to bus.in", "to bus.|inbox"))).toEqual(
      expect.arrayContaining(["Declare port `inbox` on `bus`", "Use `bus.in`"]),
    );
    expect(titles(checkout.replace("fill accent", "fil| accent"))).toContain("Change to `fill`");
    expect(
      titles(checkout.replace("    row api, bus\n", "    place |ghost at (10, 20)\n")),
    ).toContain("Declare `ghost` as a node");
    expect(
      titles(checkout.replace("  layout manual\n", '  layout manual\n  theme "|tecnical.light"\n')),
    ).toContain("Change to `technical.light`");
    // The unknown theme's range is its whole statement; the fix rewrites the value only.
    const theme = at(
      checkout.replace("  layout manual\n", '  layout manual\n  theme "|tecnical.light"\n'),
    );
    const fix = codeActions(theme.analysis, { start: theme.offset, end: theme.offset }).find(
      (a) => a.title === "Change to `technical.light`",
    )!;
    expect(applyTextEdits(theme.text, fix.edits)).toContain('  theme "technical.light"\n');
    const narrow = titles(checkout.replace("    row api, bus\n", "    size |api (40, 60)\n")).find(
      (t) => t.startsWith("Set the size"),
    );
    expect(narrow).toMatch(/^Set the size of `api` to \d+ × 60$/);
  });
});

describe("rendering", () => {
  it("names export files", () => {
    expect(exportFileName("sheet", "main", 1)).toBe("sheet.svg");
    expect(exportFileName("sheet", "main", 2)).toBe("sheet.main.svg");
  });
});
