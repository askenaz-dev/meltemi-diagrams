import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALIGN_EDGES,
  AXES,
  EXPORT_FORMATS,
  EXPORT_OPTIONS,
  SCENE_STATEMENTS,
  STORY_ACTIONS,
  STORY_STATEMENTS,
  STORY_TRANSITIONS,
  CONSTRAINTS,
  DIAGRAM_TYPES,
  FLOW_PROFILE,
  FREE_PROFILE,
  LIST_ALIGNS,
  LIST_LAYOUTS,
  MAIN_LAYER,
  PORTS,
  THEME_TOKENS,
} from "@meltemi/diagrams-model";
import { KEY_BINDINGS } from "@meltemi/diagrams-editor/canvas";
import { REPO_ROOT } from "../../../../test-support/corpus.js";
import { CanvasOpening, type OpenWithText } from "../../src/extension/remember.js";

const root = join(REPO_ROOT, "packages", "vscode");

interface Grammar {
  repository: Record<string, { match?: string; patterns?: { name?: string; match?: string }[] }>;
}

describe("grammar", () => {
  const grammar = JSON.parse(
    readFileSync(join(root, "syntaxes", "meltemi.tmLanguage.json"), "utf8"),
  ) as Grammar;
  const regexes = Object.values(grammar.repository)
    .flatMap((rule) => [rule.match, ...(rule.patterns ?? []).map((p) => p.match)])
    .filter((m): m is string => !!m)
    .map((m) => new RegExp(m));

  it("covers every keyword of the schema tables", () => {
    const enums = new Set<string>();
    const collect = (
      table: Readonly<Record<string, { kind: string; values?: readonly unknown[] }>>,
    ) => {
      for (const spec of Object.values(table))
        if (spec.kind === "enum") spec.values!.forEach((v) => enums.add(String(v)));
    };
    collect(FLOW_PROFILE.diagramProperties);
    collect(FLOW_PROFILE.styleProperties);
    collect(FLOW_PROFILE.animateProperties);
    collect(FREE_PROFILE.diagramProperties);
    collect(FREE_PROFILE.styleProperties);
    collect(THEME_TOKENS);
    const words = [
      "language",
      "import",
      "from",
      "as",
      "diagram",
      "theme",
      "model",
      "story",
      "export",
      "port",
      "at",
      "to",
      "via",
      "offset",
      "forever",
      ...Object.keys(FLOW_PROFILE.diagramProperties),
      ...FLOW_PROFILE.elementKinds,
      ...FLOW_PROFILE.diagramBlocks,
      ...FLOW_PROFILE.placementStatements,
      ...CONSTRAINTS,
      ...Object.keys(FLOW_PROFILE.styleProperties),
      ...Object.keys(FLOW_PROFILE.animateProperties),
      ...Object.keys(FREE_PROFILE.diagramProperties),
      ...FREE_PROFILE.elementKinds,
      ...Object.keys(FREE_PROFILE.elementProperties),
      ...Object.keys(FREE_PROFILE.groupProperties),
      ...Object.keys(FREE_PROFILE.styleProperties),
      MAIN_LAYER,
      ...PORTS,
      ...Object.keys(THEME_TOKENS),
      ...enums,
      ...DIAGRAM_TYPES,
      ...ALIGN_EDGES,
      ...AXES,
      ...STORY_STATEMENTS,
      ...SCENE_STATEMENTS,
      ...STORY_ACTIONS,
      ...STORY_TRANSITIONS,
      ...Object.keys(EXPORT_OPTIONS),
      ...EXPORT_FORMATS,
    ];
    const missing = words.filter((word) => !regexes.some((r) => r.test(` ${word} `)));
    expect(missing).toEqual([]);
  });

  it("colours the line tokens as arrows and `line` as a kind only where it declares a line", () => {
    const arrows = new RegExp(grammar.repository["arrows"]!.match!, "g");
    expect("a -- b".match(arrows)).toEqual(["--"]);
    expect("c --- d".match(arrows)).toEqual(["---"]);
    expect("e <--> f -> g".match(arrows)).toEqual(["<-->", "->"]);
    const kind = (grammar.repository["keywords"]!.patterns ?? []).find((p) =>
      p.match?.startsWith("\\b(line)"),
    );
    expect(kind).toBeDefined();
    const declares = new RegExp(kind!.match!);
    expect(declares.test("line l1 from (0, 0) to (100, 0)")).toBe(true);
    expect(declares.test('line l2 "Edge" from (0, 0) to (10, 10)')).toBe(true);
    expect(declares.test("style a { line dashed }")).toBe(false);
  });

  it("colours the whiteboard words: pens, stickies, `draw`, `preset board` and `opacity`", () => {
    const scopeOf = (word: string) =>
      (grammar.repository["keywords"]!.patterns ?? []).find(
        (p) => p.match && new RegExp(p.match).test(` ${word} `),
      ) as { name?: string } | undefined;
    expect(scopeOf("pen")?.name).toBe("storage.type.element.meltemi");
    expect(scopeOf("sticky")?.name).toBe("storage.type.element.meltemi");
    expect(scopeOf("draw")?.name).toBe("keyword.control.profile.meltemi");
    expect(scopeOf("board")?.name).toBe("constant.language.meltemi");
    expect(scopeOf("opacity")?.name).toBe("support.type.property-name.style.meltemi");
    // `spacing` is a list group's property and a sequence diagram's: one scope for both.
    expect(scopeOf("spacing")?.name).toBe("support.type.property-name.diagram.meltemi");
    expect(scopeOf("stickyText")?.name).toBe("support.type.property-name.theme.meltemi");
  });

  it("colours a list group's `layout` and `align` with their values, and leaves the constraint alone", () => {
    const patterns = grammar.repository["keywords"]!.patterns ?? [];
    const layout = patterns.find((p) => p.match?.startsWith("\\b(layout)\\s+"));
    const align = patterns.find((p) => p.match?.startsWith("\\b(align)\\s+"));
    expect(layout).toBeDefined();
    expect(align).toBeDefined();
    const layoutWords = new RegExp(layout!.match!);
    const alignWords = new RegExp(align!.match!);
    for (const value of LIST_LAYOUTS)
      expect(layoutWords.test(`  layout ${value}`), value).toBe(true);
    for (const value of LIST_ALIGNS) expect(alignWords.test(`  align ${value}`), value).toBe(true);
    // The diagram's `layout manual` and the constraint `align a, b top` are not list words.
    expect(layoutWords.test("  layout manual")).toBe(false);
    expect(alignWords.test("    align api, db top")).toBe(false);
    // Each comes before the patterns that would colour `layout` as a diagram property and
    // `column`, `row` or `align` as placement words.
    const index = (p: { match?: string } | undefined) => patterns.indexOf(p!);
    const placement = patterns.find((p) => p.match?.startsWith("\\b(place|size|route"));
    const diagram = patterns.find((p) => p.match?.startsWith("\\b(direction|layout"));
    expect(index(layout)).toBeLessThan(index(placement));
    expect(index(layout)).toBeLessThan(index(diagram));
    expect(index(align)).toBeLessThan(index(placement));
  });

  it("colours `return`, `spacing` and the sides of `space` and `gap`", () => {
    const patterns = grammar.repository["keywords"]!.patterns ?? [];
    const scopeOf = (word: string) =>
      patterns.find((p) => p.match !== undefined && new RegExp(p.match).test(` ${word} `))?.name;
    expect(scopeOf("return")).toBe("keyword.control.sequence.meltemi");
    expect(scopeOf("spacing")).toBe("support.type.property-name.diagram.meltemi");
    expect(scopeOf("before")).toBe("keyword.other.sequence.meltemi");
    expect(scopeOf("after")).toBe("keyword.other.sequence.meltemi");
  });

  it("colours the `on` of a note's attachment as a placement word", () => {
    const placement = (grammar.repository["keywords"]!.patterns ?? []).find((p) =>
      p.match?.startsWith("\\b(place|size|route"),
    );
    expect(placement).toBeDefined();
    const words = new RegExp(placement!.match!);
    expect(words.test(' note n "Text" on api')).toBe(true);
    expect(words.test("only")).toBe(false);
  });

  it("is referenced by the manifest with the language configuration and snippets", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const contributes = manifest.contributes;
    expect(contributes.languages[0].extensions).toEqual([".meltemi"]);
    expect(contributes.grammars[0].scopeName).toBe("source.meltemi");
    expect(contributes.customEditors[0]).toMatchObject({
      viewType: "meltemi.canvas",
      priority: "option",
    });
    expect(manifest.engines.vscode).toBe("^1.95.0");
    const commands = contributes.commands.map((c: { command: string }) => c.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        "meltemi.openCanvasToSide",
        "meltemi.openCanvas",
        "meltemi.exportSvg",
        "meltemi.arrangeUnplaced",
        "meltemi.recomputeLayout",
        "meltemi.formatDocument",
      ]),
    );
    expect(contributes.configuration.properties["meltemi.canvas.grid"].default).toBe(14);
    JSON.parse(readFileSync(join(root, "language-configuration.json"), "utf8"));
    JSON.parse(readFileSync(join(root, "snippets", "meltemi.json"), "utf8"));
  });
});

describe("remembered canvas", () => {
  function opening(mode: OpenWithText = "remember", initial = true) {
    let flag = initial;
    return {
      opening: new CanvasOpening({ get: () => flag, set: (v) => void (flag = v) }, () => mode),
      flag: () => flag,
    };
  }

  it("stays closed after the user closes it, until a canvas is opened again", () => {
    const { opening: o, flag } = opening();
    expect(o.shouldOpen("a")).toBe(true);
    o.userClosed("a");
    expect(flag()).toBe(false);
    expect(o.shouldOpen("b")).toBe(false);
    o.userOpened("b");
    expect(flag()).toBe(true);
    expect(o.shouldOpen("b")).toBe(true);
    // The document closed in this session stays closed until its text is reopened.
    expect(o.shouldOpen("a")).toBe(false);
    o.documentClosed("a");
    expect(o.shouldOpen("a")).toBe(true);
  });

  it("follows the setting", () => {
    expect(opening("always", false).opening.shouldOpen("a")).toBe(true);
    expect(opening("never", true).opening.shouldOpen("a")).toBe(false);
    const always = opening("always").opening;
    always.userClosed("a");
    expect(always.shouldOpen("a")).toBe(false);
    expect(always.shouldOpen("b")).toBe(true);
  });
});

describe("keys", () => {
  it("avoid VS Code's global keys", () => {
    const clashes = KEY_BINDINGS.filter(
      (b) =>
        (b.primary &&
          !b.alt &&
          !b.shift &&
          ["g", "k", "p", "s", "w", "z", "y", "o", "n", "b"].includes(b.key)) ||
        (b.primary && b.shift && !b.alt && ["g", "p", "e", "f", "x"].includes(b.key)) ||
        (b.primary && b.alt && b.key.startsWith("Arrow")) ||
        (b.alt && !b.shift && !b.primary && (b.key === "ArrowLeft" || b.key === "ArrowRight")),
    );
    expect(clashes.map((b) => b.command)).toEqual([]);
  });
});
