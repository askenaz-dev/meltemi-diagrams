import { describe, expect, it } from "vitest";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { syntheticFont } from "../../../test-support/synthetic-font.js";
import {
  analyzeDocument,
  CanvasSession,
  completions,
  hover,
  type CanvasAction,
  type HostMessage,
  type InspectorModel,
} from "../src/index.js";
import { commandFor } from "../src/canvas/keyboard.js";
import { FONT_SIZE_STEPS, stepFontSize } from "../src/fonts.js";

const fonts = createNodeFontLibrary();

function open(text: string, diagram: string, library = fonts) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  const analyze = () => analyzeDocument({ text: current, revision: rev, fonts: library });
  let messages: readonly HostMessage[] = session.update(analyze());
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      messages = session.update(analyze());
    } else if (result.messages.length > 0) {
      messages = [...result.messages];
    }
    return result;
  };
  send({ type: "pickDiagram", diagram });
  return {
    send,
    text: () => current,
    act: (action: CanvasAction) => send({ type: "action", revision: rev, action }),
    messages: () => messages,
    inspector: (): InspectorModel =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const field = (model: InspectorModel, name: string) => model.fields.find((f) => f.name === name);

const FLOW = `language "0.2"
diagram d: flow {
  layout manual
  api["API"]
  db["DB"]
  api -> db: "save" as save
  placement { place api at (100, 100); place db at (400, 100) }
}
`;

describe("the font picker's families", () => {
  it("answers listFonts with the bundled families by group, each with its row's faces", () => {
    const canvas = open(FLOW, "d");
    canvas.send({ type: "listFonts", token: 7 });
    const answer = canvas.messages().find((m) => m.type === "fonts") as HostMessage & {
      type: "fonts";
    };
    expect(answer.token).toBe(7);
    expect(answer.families).toHaveLength(17);
    expect(answer.families[0]).toMatchObject({ family: "Inter", group: "sans" });
    const roboto = answer.families.find((f) => f.family === "Roboto")!;
    expect(roboto.faces.length).toBeGreaterThan(0);
    expect(roboto.faces[0]).toMatch(/^@font-face\{font-family:"Roboto";font-weight:400;/);
    // A row needs the subset files of its own name's glyphs: the Latin one, tens of kilobytes.
    expect(roboto.faces).toHaveLength(1);
    expect(roboto.faces.join("").length).toBeLessThan(64 * 1024);
  });

  it("lists a project font last, and a restricted one without faces", () => {
    const library = createNodeFontLibrary();
    library.addFont(syntheticFont({ family: "Company Sans" }), "c.ttf");
    library.addFont(syntheticFont({ family: "Locked", fsType: 2 }), "l.ttf");
    const canvas = open(FLOW, "d", library);
    canvas.send({ type: "listFonts", token: 1 });
    const answer = canvas.messages().find((m) => m.type === "fonts") as HostMessage & {
      type: "fonts";
    };
    const [company, locked] = answer.families.slice(-2);
    expect(company).toMatchObject({ family: "Company Sans", group: "project" });
    expect(company!.faces.length).toBeGreaterThan(0);
    expect(locked).toMatchObject({
      family: "Locked",
      group: "project",
      restricted: true,
      faces: [],
    });
  });
});

describe("text fields in every profile", () => {
  it("shows a flow node's font, size and weight in the strip with the theme's greyed", () => {
    const canvas = open(FLOW, "d");
    canvas.send({ type: "select", ids: ["api"] });
    const model = canvas.inspector();
    expect(field(model, "style.font")).toMatchObject({
      type: "font",
      value: null,
      placeholder: "Inter",
      section: "strip",
    });
    expect(field(model, "style.fontSize")).toMatchObject({
      type: "number",
      placeholder: "13",
      list: FONT_SIZE_STEPS,
      section: "strip",
    });
    expect(field(model, "style.fontWeight")).toMatchObject({
      type: "enum",
      placeholder: "600",
      glyphs: "fontWeight",
      options: ["400", "500", "600", "700"],
    });
  });

  it("shows a relation's label weight of 500, and mixed sizes", () => {
    const canvas = open(FLOW, "d");
    canvas.send({ type: "select", ids: ["save"] });
    expect(field(canvas.inspector(), "style.fontWeight")).toMatchObject({ placeholder: "500" });
    canvas.act({ kind: "setField", ids: ["api"], field: "style.fontSize", value: 20 });
    canvas.send({ type: "select", ids: ["api", "db"] });
    expect(field(canvas.inspector(), "style.fontSize")).toMatchObject({ value: null, mixed: true });
  });

  it("shows them on a C4 entity and a sequence participant", () => {
    const c4 = `language "0.2"
model m {
  system shop "Shop" {
    container api "API"
  }
}
diagram v: c4 using m {
  level container
  scope shop
}
`;
    const view = open(c4, "v");
    view.send({ type: "select", ids: ["shop.api"] });
    expect(field(view.inspector(), "style.fontSize")).toMatchObject({ placeholder: "13" });
    expect(field(view.inspector(), "style.fontWeight")).toMatchObject({ placeholder: "600" });
    const sequence = `language "0.2"
diagram s: sequence {
  participant a "A"
  participant b "B"
  a -> b: "Pay"
}
`;
    const seq = open(sequence, "s");
    seq.send({ type: "select", ids: ["a"] });
    expect(field(seq.inspector(), "style.font")).toMatchObject({ placeholder: "Inter" });
    seq.act({ kind: "setField", ids: ["a"], field: "style.fontSize", value: 16 });
    expect(seq.text()).toContain("style a { fontSize 16 }");
  });

  it("shows none on an image", () => {
    const free = `language "0.2"
diagram f: free {
  image logo "logo.png"
  box a "A"
}
`;
    const canvas = open(free, "f");
    canvas.send({ type: "select", ids: ["logo"] });
    const model = canvas.inspector();
    expect(field(model, "style.font")).toBeUndefined();
    expect(field(model, "style.fontSize")).toBeUndefined();
    expect(field(model, "style.fontWeight")).toBeUndefined();
  });

  it("writes a font for a selection in one step", () => {
    const canvas = open(FLOW, "d");
    const result = canvas.act({
      kind: "setField",
      ids: ["api", "db"],
      field: "style.font",
      value: "Roboto",
    });
    expect(result.plan).toBeDefined();
    expect(canvas.text()).toContain('style api { font "Roboto" }');
    expect(canvas.text()).toContain('style db { font "Roboto" }');
  });
});

describe("text size keys", () => {
  it("binds Ctrl+Shift+. and Ctrl+Shift+, (Cmd on macOS)", () => {
    const key = (code: string, mac = false) =>
      commandFor(
        {
          key: code === "Period" ? ">" : "<",
          code,
          ctrlKey: !mac,
          metaKey: mac,
          shiftKey: true,
          altKey: false,
        },
        mac,
      );
    expect(key("Period")).toBe("growText");
    expect(key("Comma")).toBe("shrinkText");
    expect(key("Period", true)).toBe("growText");
  });

  it("steps along the common sizes", () => {
    expect(stepFontSize(13, 1)).toBe(14);
    expect(stepFontSize(14, -1)).toBe(12);
    expect(stepFontSize(15, -1)).toBe(14);
    expect(stepFontSize(15, 1)).toBe(16);
    expect(stepFontSize(96, 1)).toBeUndefined();
    expect(stepFontSize(8, -1)).toBeUndefined();
  });

  it("grows and shrinks a node one size at a time, announcing it", () => {
    const canvas = open(FLOW, "d");
    canvas.act({ kind: "stepTextSize", ids: ["api"], step: 1 });
    expect(canvas.text()).toContain("style api { fontSize 14 }");
    canvas.act({ kind: "stepTextSize", ids: ["api"], step: -1 });
    expect(canvas.text()).toContain("style api { fontSize 12 }");
    const result = canvas.act({ kind: "stepTextSize", ids: ["api"], step: -1 });
    expect(canvas.text()).toContain("style api { fontSize 11 }");
    expect(result.messages).toContainEqual({ type: "status", message: "Text size 11." });
  });

  it("does nothing at the end of the list or for what draws no text", () => {
    const canvas = open(
      FLOW.replace("  placement", "  style api { fontSize 96 }\n  placement"),
      "d",
    );
    const before = canvas.text();
    expect(canvas.act({ kind: "stepTextSize", ids: ["api"], step: 1 }).plan).toBeUndefined();
    expect(canvas.text()).toBe(before);
    const free = open(
      `language "0.2"\ndiagram f: free {\n  icon logo "tabler:server"\n  placement { place logo at (100, 100) }\n}\n`,
      "f",
    );
    const result = free.act({ kind: "stepTextSize", ids: ["logo"], step: 1 });
    expect(result.plan).toBeUndefined();
    expect(result.messages).toContainEqual({
      type: "status",
      message: "Nothing selected draws text.",
    });
  });

  it("steps a mixed selection in one edit", () => {
    const canvas = open(
      FLOW.replace("  placement", "  style api { fontSize 20 }\n  placement"),
      "d",
    );
    const result = canvas.act({ kind: "stepTextSize", ids: ["api", "db"], step: -1 });
    expect(result.plan).toBeDefined();
    expect(canvas.text()).toContain("style api { fontSize 18 }");
    expect(canvas.text()).toContain("style db { fontSize 12 }");
  });
});

describe("font language services", () => {
  const at = (source: string, library?: typeof fonts) => {
    const offset = source.indexOf("|");
    const text = source.replace("|", "");
    return { analysis: analyzeDocument({ text, ...(library ? { fonts: library } : {}) }), offset };
  };

  it("completes the families after font, the project's first, each with its group", () => {
    const library = createNodeFontLibrary();
    library.addFont(syntheticFont({ family: "Company Sans" }), "c.ttf");
    const { analysis, offset } = at(
      'diagram d: flow {\n  a["A"]\n  style a { font | }\n}\n',
      library,
    );
    const items = completions(analysis, offset);
    expect(items[0]).toMatchObject({ label: '"Company Sans"', detail: "project font" });
    expect(items[1]).toMatchObject({ label: '"Inter"', detail: "sans-serif font" });
    expect(items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['"Lora"', '"Roboto Mono"', '"Caveat"']),
    );
    const sequence = at('diagram s: sequence {\n  participant a "A"\n  style a { | }\n}\n');
    expect(completions(sequence.analysis, sequence.offset).map((i) => i.label)).toContain("font");
  });

  it("completes the seventeen bundled families without a library, and inside quotes", () => {
    const plain = at('diagram d: flow {\n  a["A"]\n  style a { font | }\n}\n');
    expect(completions(plain.analysis, plain.offset)).toHaveLength(17);
    const quoted = at('diagram d: flow {\n  a["A"]\n  style a { font "Ro| }\n}\n');
    expect(completions(quoted.analysis, quoted.offset).map((i) => i.label)).toContain("Roboto");
    const theme = at("theme t {\n  mono |\n}\n");
    expect(completions(theme.analysis, theme.offset).map((i) => i.label)).toContain(
      '"Source Code Pro"',
    );
  });

  it("says what a font stack is measured with", () => {
    const source =
      'diagram d: flow {\n  a["A"]\n  b["B"]\n  style a { font "Roboto" }\n  style b { font "Comic Sans MS" }\n}\n';
    const analysis = analyzeDocument({ text: source, fonts });
    const roboto = hover(analysis, source.indexOf('"Roboto"') + 2)!.markdown;
    expect(roboto).toContain("`Roboto`");
    expect(roboto).toContain("sans-serif font, bundled");
    const comic = hover(analysis, source.indexOf('"Comic') + 2)!.markdown;
    expect(comic).toContain("measured with estimates");
  });
});
