import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  analyzeDocument,
  CanvasSession,
  completions,
  convertOperation,
  hover,
  type CanvasAction,
  type HostMessage,
  type InspectorModel,
} from "../src/index.js";
import { planEdit } from "@meltemi/diagrams-edit";
import { codeNoteText } from "../src/code-notes.js";

function open(text: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let messages: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      messages = session.update(analyzeDocument({ text: current, revision: rev }));
    } else if (result.messages.length > 0) {
      messages = [...result.messages];
    }
    return result;
  };
  send({ type: "ready" });
  const last = <T extends HostMessage["type"]>(type: T) =>
    [...messages].reverse().find((m): m is HostMessage & { type: T } => m.type === type);
  return {
    session,
    send,
    text: () => current,
    apply: (action: CanvasAction) => {
      const result = send({ type: "action", revision: rev, action });
      if (!result.plan) throw new Error(JSON.stringify(result.messages));
      return result;
    },
    inspector: (): InspectorModel => last("inspector")!.model,
    render: () => last("render")!,
  };
}

const field = (model: InspectorModel, name: string) => model.fields.find((f) => f.name === name);
const names = (model: InspectorModel) => model.fields.map((f) => f.name);

const FREE = `language "0.2"

diagram board: free {
  layout manual

  box api "API"
  note snippet "if (a) {\\n\\treturn;\\n}"
  note legend "Plain words"

  placement {
    place api at (100, 100)
    place snippet at (300, 100)
    place legend at (300, 300)
  }

  style snippet { textFormat code }
}
`;

describe("the Format field of notes", () => {
  afterEach(() => setLocale("en"));

  it("is the field just above Font, with the format the note is drawn with", () => {
    const canvas = open(FREE);
    canvas.send({ type: "select", ids: ["snippet"] });
    const model = canvas.inspector();
    const fields = names(model);
    expect(fields.indexOf("style.textFormat")).toBe(fields.indexOf("style.font") - 1);
    expect(field(model, "style.textFormat")).toMatchObject({
      label: "Format",
      type: "enum",
      options: ["plain", "code"],
      glyphs: "textFormat",
      value: "code",
    });
    expect(field(model, "style.textFormat")!.fromTheme).toBeUndefined();
    canvas.send({ type: "select", ids: ["legend"] });
    expect(field(canvas.inspector(), "style.textFormat")).toMatchObject({ value: "plain" });
  });

  it("is mixed for notes that differ, and absent beside anything that is not a note", () => {
    const canvas = open(FREE);
    canvas.send({ type: "select", ids: ["snippet", "legend"] });
    expect(field(canvas.inspector(), "style.textFormat")).toMatchObject({
      value: null,
      mixed: true,
    });
    canvas.send({ type: "select", ids: ["snippet", "api"] });
    expect(field(canvas.inspector(), "style.textFormat")).toBeUndefined();
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "style.textFormat")).toBeUndefined();
  });

  it("writes code, and takes it away again for plain text, the label untouched", () => {
    const canvas = open(FREE);
    canvas.apply({ kind: "setField", ids: ["legend"], field: "style.textFormat", value: "code" });
    expect(canvas.text()).toContain("style legend { textFormat code }");
    canvas.apply({ kind: "setField", ids: ["snippet"], field: "style.textFormat", value: "plain" });
    expect(canvas.text()).not.toContain("style snippet");
    expect(canvas.text()).toContain('note snippet "if (a) {\\n\\treturn;\\n}"');
  });

  it("writes plain only over a rule that makes the note code", () => {
    const canvas = open(
      FREE.replace("  style snippet { textFormat code }", "  rule note { textFormat code }"),
    );
    canvas.apply({ kind: "setField", ids: ["legend"], field: "style.textFormat", value: "plain" });
    expect(canvas.text()).toContain("style legend { textFormat plain }");
  });

  it("shows the code panel's colours as what applies to a code note", () => {
    const canvas = open(FREE);
    canvas.send({ type: "select", ids: ["snippet"] });
    const model = canvas.inspector();
    expect(field(model, "style.fill")!.placeholder).toBe("code");
    expect(field(model, "style.stroke")!.placeholder).toBe("line");
    expect(field(model, "style.color")!.placeholder).toBe("codeText");
  });

  it("shows the theme's monospace family as a code note's font", () => {
    const canvas = open(FREE);
    canvas.send({ type: "select", ids: ["snippet"] });
    expect(field(canvas.inspector(), "style.font")!.placeholder).toBe("Cascadia Mono");
    canvas.send({ type: "select", ids: ["legend"] });
    expect(field(canvas.inspector(), "style.font")!.placeholder).toBe("Inter");
  });

  it("is on a note of a sequence diagram, and not on a fragment", () => {
    const canvas = open(
      'diagram s: sequence {\n  api -> db: "Query"\n  note n over api "a"\n  alt f "ok" {\n    api -> db: "Pay"\n  }\n}\n',
    );
    canvas.send({ type: "select", ids: ["n"] });
    expect(field(canvas.inspector(), "style.textFormat")).toMatchObject({ value: "plain" });
    canvas.apply({ kind: "setField", ids: ["n"], field: "style.textFormat", value: "code" });
    expect(canvas.text()).toContain("style n { textFormat code }");
    canvas.send({ type: "select", ids: ["f"] });
    expect(field(canvas.inspector(), "style.textFormat")).toBeUndefined();
  });

  it("is named in Spanish", () => {
    setLocale("es");
    const canvas = open(FREE);
    canvas.send({ type: "select", ids: ["snippet"] });
    expect(field(canvas.inspector(), "style.textFormat")!.label).toBe("Formato");
  });
});

describe("the text place of a code note", () => {
  it("says it is typed as code, in the mono font", () => {
    const canvas = open(FREE);
    const elements = canvas.render().elements;
    const snippet = elements.find((e) => e.id === "snippet")!;
    expect(snippet.text).toMatchObject({ format: "code", lines: true });
    expect(snippet.text!.font).toContain("Cascadia Mono");
    expect(elements.find((e) => e.id === "legend")!.text!.format).toBeUndefined();
  });
});

describe("Copy code", () => {
  afterEach(() => setLocale("en"));

  it("puts a code note's text on the clipboard as it is written", () => {
    const canvas = open(FREE);
    const copied = canvas.session.receive({ type: "copyText", id: "snippet" });
    expect(copied.clipboard).toBe("if (a) {\n\treturn;\n}");
    expect(copied.messages).toEqual([{ type: "status", message: "Copied the code." }]);
    expect(canvas.text()).toBe(FREE);
  });

  it("copies nothing from a plain note or another element", () => {
    const canvas = open(FREE);
    expect(canvas.session.receive({ type: "copyText", id: "legend" }).clipboard).toBeUndefined();
    expect(canvas.session.receive({ type: "copyText", id: "api" }).clipboard).toBeUndefined();
    expect(canvas.session.receive({ type: "copyText", id: "nothing" }).clipboard).toBeUndefined();
  });

  it("copies the text of a code note of a sequence diagram", () => {
    const text =
      'diagram s: sequence {\n  api -> db: "Query"\n  note r over api "retry:\\n  3 times"\n  rule note { textFormat code }\n}\n';
    const analysis = analyzeDocument({ text, revision: 1 });
    expect(codeNoteText(analysis, "s", "r")).toBe("retry:\n  3 times");
  });

  it("says so in Spanish", () => {
    setLocale("es");
    const canvas = open(FREE);
    expect(canvas.session.receive({ type: "copyText", id: "snippet" }).messages).toEqual([
      { type: "status", message: "Se copió el código." },
    ]);
  });
});

describe("the language services for the text format", () => {
  afterEach(() => setLocale("en"));

  const at = (text: string, marker: string) => {
    const offset = text.indexOf(marker);
    return { text: text.replace(marker, ""), offset };
  };

  it("complete textFormat in a note's style and its two values", () => {
    const { text, offset } = at(FREE.replace("textFormat code }", "textForm| }"), "|");
    expect(completions(analyzeDocument({ text }), offset).map((i) => i.label)).toContain(
      "textFormat",
    );
    const values = at(FREE.replace("textFormat code }", "textFormat | }"), "|");
    const labels = completions(analyzeDocument({ text: values.text }), values.offset).map(
      (i) => i.label,
    );
    expect(labels).toEqual(expect.arrayContaining(["plain", "code"]));
  });

  it("leave textFormat out of the style of a box", () => {
    const { text, offset } = at(
      FREE.replace("  style snippet {", "  style api { | }\n  style snippet {"),
      "|",
    );
    expect(completions(analyzeDocument({ text }), offset).map((i) => i.label)).not.toContain(
      "textFormat",
    );
  });

  it("describe the property in the interface language", () => {
    const offset = FREE.indexOf("textFormat code") + 3;
    expect(hover(analyzeDocument({ text: FREE }), offset)!.markdown).toContain("`code`");
    setLocale("es");
    expect(hover(analyzeDocument({ text: FREE }), offset)!.markdown).toContain("bloque de código");
  });
});

describe("a code note's format", () => {
  it("is kept by a copy and paste of the note", () => {
    const canvas = open(FREE);
    const copied = canvas.session.receive({ type: "copy", ids: ["snippet"] });
    expect(copied.clipboard).toContain("textFormat code");
    const pasted = canvas.session.paste(copied.clipboard!, { x: 500, y: 500 });
    expect(pasted.plan).toBeDefined();
    const after = applyTextEdits(canvas.text(), pasted.plan!.edits);
    expect(after).toContain("style snippet_2 { textFormat code }");
  });

  it("is kept when a flow sheet becomes a free composition", () => {
    const text =
      'diagram f: flow {\n  layout manual\n  api["API"]\n  note snippet "a\\n  b" on api\n  placement {\n    place api at (100, 100)\n    place snippet at (300, 100)\n  }\n  style snippet { textFormat code }\n}\n';
    const analysis = analyzeDocument({ text });
    const operation = convertOperation(analysis, "f");
    expect(operation).toBeDefined();
    const result = planEdit(analysis.compilation, operation!);
    if (!result.ok) throw new Error(result.rejection.reason);
    const after = applyTextEdits(text, result.plan.edits);
    expect(after).toContain('note snippet "a\\n  b" on api');
    expect(after).toContain("textFormat code");
  });
});
