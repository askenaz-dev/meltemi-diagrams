import type { InspectorField } from "@meltemi/diagrams-editor/canvas";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { ICONS, ariaKeyshortcuts } from "../src/dom.js";
import { checkboxState, inspectorRows, isTagField } from "../src/inspector.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

afterEach(() => setLocale("en"));

/** A field of the inspector as the editor sends it. */
const field = (name: string, extra: Partial<InspectorField> = {}): InspectorField => ({
  name,
  label: name,
  type: "text",
  value: null,
  ...extra,
});

describe("the Activates the receiver checkbox", () => {
  // The editor's field of a message: `boolean`, `on` when an `activate` of the receiver follows.
  const activates = (extra: Partial<InspectorField>) =>
    field("activates", { label: "Activates the receiver", type: "boolean", ...extra });

  it("is checked when the receiver is activated after the message, clear when not", () => {
    expect(checkboxState(activates({ value: "on" }))).toEqual({
      checked: true,
      mixed: false,
      disabled: false,
      note: undefined,
    });
    expect(checkboxState(activates({ value: "off" })).checked).toBe(false);
    // Messages that differ on it: neither.
    expect(checkboxState(activates({ value: null, mixed: true }))).toMatchObject({
      checked: false,
      mixed: true,
    });
  });

  it("is checked and read-only with the reason under it on a call whose block activates", () => {
    const state = checkboxState(
      activates({ value: "on", readonly: true, note: "The block of `pay` activates `api`." }),
    );
    expect(state).toEqual({
      checked: true,
      mixed: false,
      disabled: true,
      note: "The block of `pay` activates `api`.",
    });
  });
});

describe("the Tags list of the inspector", () => {
  const tags = [
    field("tag.0", { label: "Tag 1", value: "PKCE" }),
    field("tag.1", { label: "Tag 2", value: "v2" }),
    field("tag.new", { label: "New tag", placeholder: "Add a tag" }),
  ];

  it("draws the run of tag fields as one list after the message's other fields", () => {
    const rows = inspectorRows([
      field("label"),
      field("activates", { type: "boolean", value: "off" }),
      ...tags,
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["field", "field", "tags"]);
    const list = rows[2]!;
    expect(list.kind === "tags" && list.tags.map((t) => t.value)).toEqual(["PKCE", "v2"]);
    expect(list.kind === "tags" && list.add?.name).toBe("tag.new");
  });

  it("keeps the field that adds one when the owner has no tags yet", () => {
    const rows = inspectorRows([field("gap"), tags[2]!]);
    expect(rows).toEqual([
      { kind: "field", field: field("gap") },
      { kind: "tags", tags: [], add: tags[2] },
    ]);
  });

  it("tells the tag fields from the others", () => {
    expect(["tag.0", "tag.12", "tag.new"].every(isTagField)).toBe(true);
    expect(["tag", "tags", "tag.x", "style.tag", "effect.tag.0"].some(isTagField)).toBe(false);
  });

  it("is headed Tags, Marcas in Spanish, with a Remove that names its tag", () => {
    expect(en.inspector.tags).toBe("Tags");
    expect(es.inspector.tags).toBe("Marcas");
    expect(en.inspector.removeTagTitle("PKCE")).toBe("Remove the tag PKCE");
    expect(es.inspector.removeTagTitle("PKCE")).toBe("Quitar la marca PKCE");
  });
});

describe("the Tag and Activate buttons of a sequence diagram", () => {
  it("are named by what they do; their titles add the key (decision 0062)", () => {
    expect(en.toolbar.tag).toBe("Tag");
    expect(es.toolbar.tag).toBe("Marca");
    expect(en.toolbar.activate).toBe("Activate the receiver");
    expect(es.toolbar.activate).toBe("Activar el receptor");
    expect(ariaKeyshortcuts("Alt+A")).toBe("Alt+A");
  });

  it("draw a lifeline with its bar, and the message coming into it", () => {
    const parts = ICONS.activate.split("|");
    // Hand-drawn in the 16-unit box of the other icons.
    const numbers = ICONS.activate.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(16);
    expect(parts.some((d) => /^M9 4h3v8\.5H9z$/.test(d))).toBe(true);
  });
});

describe("ariaKeyshortcuts", () => {
  it("writes a shown key as aria-keyshortcuts wants it", () => {
    expect(ariaKeyshortcuts("Ctrl+Alt+B")).toBe("Control+Alt+B");
    expect(ariaKeyshortcuts("Cmd+Alt+B")).toBe("Meta+Alt+B");
    expect(ariaKeyshortcuts("Mayús+1")).toBe("Shift+1");
    expect(ariaKeyshortcuts("L")).toBe("L");
  });

  it("names the other modifiers and the plus key", () => {
    expect(ariaKeyshortcuts("Shift+Alt+F")).toBe("Shift+Alt+F");
    expect(ariaKeyshortcuts("Ctrl+Mayús+Z")).toBe("Control+Shift+Z");
    expect(ariaKeyshortcuts("+")).toBe("Plus");
    expect(ariaKeyshortcuts("-")).toBe("-");
  });

  it("gives nothing for no key", () => {
    expect(ariaKeyshortcuts("")).toBe("");
  });
});
