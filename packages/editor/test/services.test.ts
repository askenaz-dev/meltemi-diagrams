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

/** A whiteboard: a column of stickies, a pen of 24 points in a group, a line and a box. */
const ARROW = Array.from({ length: 24 }, (_, i) => `(${10 + i * 5}, ${20 + (i % 3) * 2.5})`).join(
  ", ",
);
const board = `diagram w: free {
  preset board
  group todo "To do" {
    layout column
    spacing 12
    sticky idea "Cache the\\ncatalogue"
    sticky plain "Plain"
  }
  group notes "Notes" {
    pen arrow [${ARROW}]
  }
  pen title [(40, 40), (90.5, 38), (140, 50)]
  line rule from (40, 400) to (400, 400)
  box api "API"
  api -> idea as asks
  placement {
    place todo at (200, 200)
    place notes at (600, 200)
    size notes (240, 120)
    place api at (900, 200)
  }
  style idea { fill "#f8bbd0" }
}
story tour for w {
  scene one {
    draw title, arrow over 2s
  }
}
`;

describe("whiteboard language services", () => {
  const labels = (source: string) => {
    const { analysis, offset } = at(source);
    return completions(analysis, offset).map((i) => i.label);
  };
  const details = (source: string) => {
    const { analysis, offset } = at(source);
    return new Map(completions(analysis, offset).map((i) => [i.label, i.detail]));
  };
  const hovered = (source: string) => {
    const { analysis, offset } = at(source);
    return hover(analysis, offset)?.markdown ?? "";
  };

  it("compiles the whiteboard the tests use", () => {
    const analysis = analyzeDocument({ text: board });
    expect(analysis.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

  it("offers pen and sticky among the declarations of a free diagram, and not of a flow", () => {
    const free = details("diagram s: free {\n  |\n}\n");
    expect([...free.keys()]).toEqual(expect.arrayContaining(["pen", "sticky", "line", "group"]));
    expect(free.get("pen")).toMatch(/^A freehand stroke of a free diagram/);
    expect(free.get("sticky")).toMatch(/^A sticky note of a free diagram/);
    expect(labels('diagram s: free {\n  group g "G" {\n    |\n  }\n}\n')).toEqual(
      expect.arrayContaining(["pen", "sticky"]),
    );
    const flow = labels("diagram d: flow {\n  |\n}\n");
    expect(flow).not.toContain("pen");
    expect(flow).not.toContain("sticky");
  });

  it("completes a group block with the list's layout, spacing and align and their values", () => {
    const block = (inner: string) => `diagram s: free {\n  group todo "To do" { ${inner} }\n}\n`;
    expect(labels(block("la|"))).toContain("layout");
    // While the block is still being typed, unclosed.
    expect(labels('diagram s: free {\n  group todo "To do" { la|')).toContain("layout");
    const words = details(block("|"));
    expect([...words.keys()]).toEqual(expect.arrayContaining(["layout", "spacing", "align"]));
    expect(words.get("layout")).toMatch(/^Makes the group a list/);
    expect(labels(block("layout |"))).toEqual(["column", "row"]);
    expect(details(block("layout |")).get("column")).toBe(
      "The children one under the other, the list growing downwards.",
    );
    expect(labels(block("layout column; align |"))).toEqual(["start", "center", "end", "stretch"]);
    expect(labels(block("layout column; spacing |"))).toEqual([]);
    // The diagram's own `layout` keeps its modes.
    expect(labels("diagram s: free {\n  layout |\n}\n")).toEqual(["auto", "assisted", "manual"]);
  });

  it("offers no list words in element blocks or in flow diagrams", () => {
    const none = (items: readonly string[]) => {
      expect(items).not.toContain("layout");
      expect(items).not.toContain("spacing");
      expect(items).not.toContain("align");
    };
    none(labels('diagram s: free {\n  box a "A" { | }\n}\n'));
    const sticky = labels('diagram s: free {\n  sticky a "A" { | }\n}\n');
    none(sticky);
    expect(sticky).toEqual(expect.arrayContaining(["description", "layer", "port"]));
    const pen = labels("diagram s: free {\n  pen p [(0, 0), (10, 10)] { | }\n}\n");
    none(pen);
    expect(pen).toContain("layer");
    expect(pen).not.toContain("port");
    none(labels('diagram d: flow {\n  group g "G" { | }\n}\n'));
    expect(labels('diagram d: flow {\n  group g "G" { layout | }\n}\n')).toEqual([]);
  });

  it("offers opacity in the style blocks of free diagrams only, and board after preset", () => {
    expect(labels("diagram s: free {\n  pen p [(0, 0)]\n  style p { | }\n}\n")).toContain(
      "opacity",
    );
    expect(labels("diagram s: free {\n  rule pen { | }\n}\n")).toContain("opacity");
    expect(labels('diagram d: flow {\n  a["A"]\n  style a { | }\n}\n')).not.toContain("opacity");
    expect(labels("diagram s: free {\n  preset |\n}\n")).toEqual(["document", "slide", "board"]);
    expect(details("diagram s: free {\n  preset |\n}\n").get("board")).toMatch(
      /^A whiteboard canvas that grows/,
    );
  });

  it("offers draw in a scene with the view's pens, lines and named relations", () => {
    const scene = (inner: string) => board.replace("    draw title, arrow over 2s", inner);
    expect(labels(scene("    |"))).toContain("draw");
    expect(details(scene("    |")).get("draw")).toMatch(/^Draws pens, free lines and named/);
    const targets = labels(scene("    draw |"));
    expect(targets).toEqual(["arrow", "title", "rule", "asks"]);
    expect(targets).not.toContain("api");
    expect(targets).not.toContain("idea");
    expect(labels(scene("    draw title, |"))).toEqual(["arrow", "rule", "asks"]);
    expect(labels(scene("    draw title, arrow |"))).toEqual(["over"]);
    expect(details(scene("    draw |")).get("arrow")).toBe("pen");
  });

  it("offers the targets of draw in the scenario of the spec", () => {
    const text = `diagram s: free {
  pen title [(0, 0), (10, 10)]
  pen arrow [(0, 20), (40, 20)]
  line rule from (0, 40) to (40, 40)
  box api "API"
  placement { place api at (200, 200) }
}
story t for s {
  scene one {
    draw |
  }
}
`;
    const offered = labels(text);
    expect(offered).toEqual(expect.arrayContaining(["title", "arrow", "rule"]));
    expect(offered).not.toContain("api");
  });

  it("describes a pen by its points, its group and its layer", () => {
    const markdown = hovered(board.replace("pen arrow [", "pen |arrow ["));
    expect(markdown.split("\n")[0]).toBe("**pen** `arrow` — 24 points");
    expect(markdown).toContain("in `notes`");
    expect(markdown).toContain("layer `main`");
    expect(markdown).not.toContain("place");
    expect(markdown).not.toContain("size");
    // A story target is described the same way, with its view.
    const target = hovered(board.replace("draw title, arrow", "draw title, |arrow"));
    expect(target).toContain("**pen** `arrow` — 24 points");
    expect(target).toContain("in `w`");
  });

  it("describes a sticky by its text and its colour, and a list group by its arrangement", () => {
    const sticky = hovered(board.replace("sticky idea", "sticky |idea"));
    expect(sticky.split("\n")[0]).toBe("**sticky** `idea` — Cache the  ");
    expect(sticky).toContain("catalogue");
    expect(sticky).toContain("colour `#f8bbd0`");
    expect(sticky).toContain("placed by the list `todo`");
    const plain = hovered(board.replace("sticky plain", "sticky |plain"));
    expect(plain).toMatch(/colour `#[0-9a-fA-F]{6}` \(the theme's `sticky`\)/);
    const list = hovered(board.replace('group todo "To do"', 'group |todo "To do"'));
    expect(list).toContain("list `layout column` · `spacing 12` · `align start` (default)");
    const row = hovered(
      'diagram s: free {\n  group |b "" { layout row }\n  placement { place b at (100, 100) }\n}\n',
    );
    expect(row).toMatch(
      /list `layout row` · `spacing \d+` \(default\) · `align start` \(default\)/,
    );
  });

  it("describes the whiteboard keywords, and the list words in a group block", () => {
    expect(hovered(board.replace("  pen title", "  p|en title"))).toMatch(
      /^\*\*pen\*\* — A freehand stroke/,
    );
    expect(hovered(board.replace("sticky plain", "stic|ky plain"))).toMatch(
      /^\*\*sticky\*\* — A sticky note/,
    );
    expect(hovered(board.replace("draw title", "dr|aw title"))).toMatch(
      /^\*\*draw\*\* — Draws pens, free lines and named relations[^]*From 0 s for 2 s\.$/,
    );
    expect(hovered(board.replace("preset board", "preset bo|ard"))).toMatch(
      /^\*\*board\*\* — A whiteboard canvas/,
    );
    expect(hovered(board.replace("    layout column", "    lay|out column"))).toMatch(
      /^\*\*layout\*\* — Makes the group a list/,
    );
    expect(hovered(board.replace("    layout column", "    layout col|umn"))).toBe(
      "**column** — The children one under the other, the list growing downwards.",
    );
    expect(hovered(board.replace("    spacing 12", "    spac|ing 12"))).toMatch(
      /^\*\*spacing\*\* — The distance between the children of a list, 0 to 400/,
    );
    expect(hovered(board.replace("    spacing 12", "    spacing 12\n    al|ign stretch"))).toMatch(
      /^\*\*align\*\* — Where the children of a list sit across it/,
    );
    // The diagram's `layout` and the placement's `column` keep their meanings.
    expect(hovered("diagram s: free {\n  lay|out manual\n}\n")).toMatch(/^\*\*layout\*\* — `auto`/);
    expect(
      hovered(
        'diagram s: free {\n  box a "A"\n  box b "B"\n  placement {\n    col|umn a, b\n  }\n}\n',
      ),
    ).toMatch(/^\*\*column\*\* — Equal horizontal centres/);
    expect(
      hovered(board.replace('style idea { fill "#f8bbd0" }', "style title { opa|city 0.5 }")),
    ).toMatch(/^\*\*opacity\*\* — How opaque an element, group, line or pen/);
    expect(
      hovered(board.replace('style idea { fill "#f8bbd0" }', "style title { wid|th 4 }")),
    ).toContain("0 to 64");
  });

  it("lists pens and stickies in the outline with their kind word", () => {
    const [diagram] = documentSymbols(analyzeDocument({ text: board }));
    const symbols = new Map(diagram!.children.map((c) => [c.name, c]));
    expect(symbols.get("title")).toMatchObject({ kind: "element", detail: "pen" });
    expect(symbols.get("rule")).toMatchObject({ kind: "element", detail: "line" });
    const todo = symbols.get("todo")!;
    expect(todo.kind).toBe("group");
    expect(todo.children.map((c) => [c.name, c.kind, c.detail])).toEqual([
      ["idea", "element", "sticky · Cache the"],
      ["plain", "element", "sticky · Plain"],
    ]);
    expect(symbols.get("notes")!.children.map((c) => [c.name, c.detail])).toEqual([
      ["arrow", "pen"],
    ]);
  });
});

describe("whiteboard quick fixes", () => {
  /** The fixes offered for the first diagnostic with `code`, and the text each one leaves. */
  const fixesFor = (text: string, code: string) => {
    const analysis = analyzeDocument({ text });
    const diagnostic = analysis.diagnostics.find((d) => d.code === code);
    if (!diagnostic) throw new Error(`no ${code} in the text`);
    const offset = diagnostic.range.start.offset;
    return codeActions(analysis, { start: offset, end: offset })
      .filter((a) => a.diagnostic === diagnostic)
      .map((a) => ({ ...a, after: applyTextEdits(text, a.edits) }));
  };
  /** The diagnostics of a text other than information. */
  const reported = (text: string) =>
    analyzeDocument({ text })
      .diagnostics.filter((d) => d.severity !== "info")
      .map((d) => d.code);

  it("removes the place of a list's child", () => {
    const text = board.replace("    place api at", "    place idea at (40, 40)\n    place api at");
    const [fix, ...others] = fixesFor(text, "layout.place-ignored");
    expect(others).toEqual([]);
    expect(fix!.title).toBe("Remove `place idea` (the list `todo` places it)");
    expect(fix!.preferred).toBe(true);
    expect(fix!.after).toBe(board);
    expect(reported(fix!.after)).toEqual([]);
  });

  it("adds layout column to a group that writes spacing or align without one", () => {
    for (const word of ["spacing 12", "align stretch"]) {
      const text = board.replace("    layout column\n    spacing 12\n", `    ${word}\n`);
      expect(reported(text), word).toContain("prop.invalid-value");
      const [fix, ...others] = fixesFor(text, "prop.invalid-value");
      expect(others, word).toEqual([]);
      expect(fix!.title, word).toBe("Add `layout column` to `todo`");
      expect(fix!.after, word).toContain(`    ${word}\n    layout column\n`);
      expect(reported(fix!.after), word).toEqual([]);
    }
    // Another invalid value of the group block is not the missing layout's.
    const range = board.replace("    spacing 12", "    spacing 900");
    expect(fixesFor(range, "prop.invalid-value")).toEqual([]);
  });

  it("writes preset board for a document that grew too wide", () => {
    const wide = board
      .replace("preset board", "preset document")
      .replace("place api at (900, 200)", "place api at (1900, 200)");
    const [fix, ...others] = fixesFor(wide, "layout.too-large");
    expect(others).toEqual([]);
    expect(fix!.title).toBe("Switch to `preset board`");
    expect(fix!.after).toContain("  preset board\n");
    expect(reported(fix!.after)).toEqual([]);
    // A written canvas is a size someone chose: no fix.
    const canvas = wide.replace("preset document", "canvas (800, 600)");
    expect(fixesFor(canvas, "layout.too-large")).toEqual([]);
  });
});
