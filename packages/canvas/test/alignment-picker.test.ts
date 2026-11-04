import { setLocale } from "@meltemi/diagrams-i18n";
import type { InspectorField } from "@meltemi/diagrams-editor/canvas";
import { afterEach, describe, expect, it } from "vitest";
import { alignCells, alignChanges, alignCleared } from "../src/inspector.js";

afterEach(() => setLocale("en"));

/** The two alignment fields of a free box as the editor sends them, written or not. */
const across = (value: string | null, extra: Partial<InspectorField> = {}): InspectorField => ({
  name: "style.textAlign",
  label: "Text alignment",
  type: "enum",
  value,
  placeholder: "center",
  options: ["left", "center", "right"],
  glyphs: "textAlign",
  section: "strip",
  fromTheme: true,
  ...extra,
});
const down = (value: string | null, extra: Partial<InspectorField> = {}): InspectorField => ({
  name: "style.verticalAlign",
  label: "Vertical alignment",
  type: "enum",
  value,
  placeholder: "middle",
  options: ["top", "middle", "bottom"],
  glyphs: "verticalAlign",
  section: "strip",
  fromTheme: true,
  ...extra,
});

describe("the text alignment picker", () => {
  it("draws nine cells, the default pair greyed while nothing is written", () => {
    const cells = alignCells(across(null), down(null));
    expect(cells.map((c) => `${c.across}-${c.down}`)).toEqual([
      "left-top",
      "center-top",
      "right-top",
      "left-middle",
      "center-middle",
      "right-middle",
      "left-bottom",
      "center-bottom",
      "right-bottom",
    ]);
    expect(cells.filter((c) => c.inherited).map((c) => c.name)).toEqual(["centre, middle"]);
    expect(cells.some((c) => c.pressed)).toBe(false);
  });

  it("writes both alignments from the top-left cell", () => {
    expect(alignChanges(across(null), down(null), { across: "left", down: "top" })).toEqual([
      { field: "style.textAlign", value: "left" },
      { field: "style.verticalAlign", value: "top" },
    ]);
    const cells = alignCells(across("left"), down("top"));
    expect(cells.filter((c) => c.pressed).map((c) => c.name)).toEqual(["left, top"]);
  });

  it("changes one property, writing the default as nothing", () => {
    expect(alignChanges(across("left"), down("top"), { across: "left", down: "middle" })).toEqual([
      { field: "style.verticalAlign", value: null },
    ]);
    // What is drawn after it: middle-left pressed, as the written `left` with the middle.
    const cells = alignCells(across("left"), down(null));
    expect(cells.filter((c) => c.pressed).map((c) => c.name)).toEqual(["left, middle"]);
    expect(alignChanges(across("left"), down(null), { across: "left", down: "middle" })).toEqual(
      [],
    );
  });

  it("is a row of three for a free text, left greyed, and writes the right one", () => {
    const text = across(null, { placeholder: "left" });
    const cells = alignCells(text, undefined);
    expect(cells.map((c) => [c.across, c.down, c.name])).toEqual([
      ["left", undefined, "left"],
      ["center", undefined, "centre"],
      ["right", undefined, "right"],
    ]);
    expect(cells.filter((c) => c.inherited).map((c) => c.across)).toEqual(["left"]);
    expect(alignChanges(text, undefined, { across: "right", down: undefined })).toEqual([
      { field: "style.textAlign", value: "right" },
    ]);
  });

  it("names the cells in the interface language", () => {
    setLocale("es");
    const cells = alignCells(across(null), down(null));
    expect(cells.find((c) => c.across === "center" && c.down === "bottom")!.name).toBe(
      "centro, abajo",
    );
    // From the centre, Down then Enter: only the vertical alignment changes.
    expect(alignChanges(across(null), down(null), { across: "center", down: "bottom" })).toEqual([
      { field: "style.verticalAlign", value: "bottom" },
    ]);
  });

  it("shows a mixed selection with no cell pressed, and writes every alignment of a cell", () => {
    const mixed = alignCells(across(null, { mixed: true }), down("top"));
    expect(mixed.some((c) => c.pressed || c.inherited)).toBe(false);
    expect(
      alignChanges(across(null, { mixed: true }), down("top"), { across: "left", down: "top" }),
    ).toEqual([{ field: "style.textAlign", value: "left" }]);
  });

  it("takes both written alignments away with its chip, and nothing when none is written", () => {
    expect(alignCleared(across("left"), down("top"))).toEqual([
      { field: "style.textAlign", value: null },
      { field: "style.verticalAlign", value: null },
    ]);
    expect(alignCleared(across(null), down("bottom"))).toEqual([
      { field: "style.verticalAlign", value: null },
    ]);
    expect(alignCleared(across(null), down(null))).toEqual([]);
  });
});
