import type { SessionResult } from "@meltemi/diagrams-editor";
import { describe, expect, it } from "vitest";
import { CANVAS_SETTINGS, canvasSettings, settingsMessage } from "../src/canvas-settings.js";
import type { StudioChange } from "../src/studio.js";
import { newStudio } from "./support/cloud.js";

const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** A Studio holding two sources and a note, that has been given an edit of its own and then put in view mode. */
function viewing(options: { editedFirst?: boolean } = {}) {
  const studio = newStudio();
  studio.load(
    [
      [A, SOURCE_A],
      [B, SOURCE_B],
      ["notes.md", "# notes\n"],
    ],
    A,
  );
  if (options.editedFirst) studio.setText(A, `${SOURCE_A}// mine\n`);
  const heard = {
    changes: [] as StudioChange[],
    changed: [] as string[],
    texts: [] as string[],
    modes: [] as boolean[],
    requests: [] as SessionResult[],
    reveals: 0,
  };
  studio.listen({
    change: (change) => heard.changes.push(change),
    changed: (path) => heard.changed.push(path),
    text: (path) => heard.texts.push(path),
    readOnly: (on) => heard.modes.push(on),
    request: (result) => heard.requests.push(result),
    reveal: () => heard.reveals++,
  });
  studio.setReadOnly(true);
  return { studio, heard };
}

/** What the studio holds, to compare before and after. */
const snapshot = (studio: ReturnType<typeof newStudio>) =>
  JSON.stringify(studio.host.paths().map((path) => [path, studio.host.get(path)]));

describe("the Studio's view mode", () => {
  it("enters and leaves view mode, telling the listeners once each", () => {
    const { studio, heard } = viewing();
    expect(studio.readOnly).toBe(true);
    studio.setReadOnly(true);
    studio.setReadOnly(false);
    studio.setReadOnly(false);
    expect(studio.readOnly).toBe(false);
    expect(heard.modes).toEqual([true, false]);
  });

  it("refuses typing", () => {
    const { studio, heard } = viewing();
    const before = snapshot(studio);
    studio.setText(A, `${SOURCE_A}// typed\n`, { typing: true });
    studio.setText(A, "", {});
    expect(snapshot(studio)).toBe(before);
    expect(heard.changes).toEqual([]);
    expect(heard.changed).toEqual([]);
  });

  it("refuses applyEdits, which every completion, fix, rename, format and canvas plan goes through", () => {
    const { studio, heard } = viewing();
    const before = snapshot(studio);
    studio.applyEdits(new Map([[A, [{ start: 0, end: 0, newText: "// x\n" }]]]));
    studio.applyEdits(
      new Map([
        [A, [{ start: 0, end: 0, newText: "// y\n" }]],
        [B, [{ start: 0, end: 0, newText: "// z\n" }]],
      ]),
      { start: 1, end: 1 },
    );
    expect(snapshot(studio)).toBe(before);
    expect(heard.changes).toEqual([]);
    expect(heard.texts).toEqual([]);
  });

  it("refuses to add files, to delete them and to rename them", () => {
    const { studio, heard } = viewing();
    const before = snapshot(studio);
    studio.addFiles([["diagrams/new.meltemi", SOURCE_A]], "diagrams/new.meltemi");
    studio.addFiles([["logo.png", PNG]]);
    studio.deleteFile(B);
    studio.deleteFile("notes.md");
    expect(studio.renameFile(B, "diagrams/c.meltemi")).toBe(false);
    expect(snapshot(studio)).toBe(before);
    expect(studio.open).toBe(A);
    expect(heard.changes).toEqual([]);
  });

  it("refuses to replace the project and to write a text as the person's own", () => {
    const { studio, heard } = viewing();
    const before = snapshot(studio);
    studio.load([["diagrams/other.meltemi", SOURCE_B]]);
    studio.replaceText(A, "// replaced\n");
    studio.replaceText(A, "// replaced\n", { remote: false, now: true });
    expect(snapshot(studio)).toBe(before);
    expect(heard.changes).toEqual([]);
  });

  it("refuses undo and redo, and has nothing to undo", () => {
    const { studio } = viewing({ editedFirst: true });
    // The edit made before view mode is not the viewer's to undo.
    expect(studio.canUndo()).toBe(false);
    expect(studio.canRedo()).toBe(false);
    expect(studio.undo()).toBe(false);
    expect(studio.redo()).toBe(false);
    expect(studio.text(A)).toBe(`${SOURCE_A}// mine\n`);
  });

  it("drops what the canvas asks to change, and still passes on what only looks", () => {
    const { studio, heard } = viewing();
    const before = snapshot(studio);
    const revision = studio.revision();
    studio.handle({
      messages: [],
      plan: { baseRevision: revision, edits: [{ start: 0, end: 0, newText: "// plan\n" }] },
      project: { kind: "createTheme", theme: "mine", extends: undefined },
      pick: { kind: "icon", at: { x: 0, y: 0 } },
      readClipboard: { at: { x: 0, y: 0 } },
    } as unknown as SessionResult);
    expect(snapshot(studio)).toBe(before);
    expect(studio.revision()).toBe(revision);
    // A choice of an icon or a paste would ask for something to write: none is passed on.
    expect(heard.requests).toEqual([]);
    studio.handle({ messages: [], command: "export" } as unknown as SessionResult);
    studio.handle({ messages: [], clipboard: "copied" } as unknown as SessionResult);
    studio.handle({
      messages: [],
      reveal: { start: 0, end: 1, focus: false },
    } as unknown as SessionResult);
    expect(heard.requests.map((r) => r.command ?? r.clipboard)).toEqual(["export", "copied"]);
    expect(heard.reveals).toBe(1);
  });

  it("still brings in what a bound document does, so that a viewer follows the room", () => {
    const { studio, heard } = viewing();
    studio.replaceText(A, "// from the room\n", { remote: true, now: true });
    expect(studio.text(A)).toBe("// from the room\n");
    studio.addFiles([["diagrams/c.meltemi", SOURCE_B]], undefined, { remote: true });
    studio.addFiles([["logo.png", PNG]], undefined, { remote: true });
    expect(studio.renameFile(B, "diagrams/b2.meltemi", { remote: true })).toBe(true);
    studio.deleteFile("notes.md", { remote: true });
    expect(studio.host.paths()).toEqual(
      expect.arrayContaining(["diagrams/c.meltemi", "diagrams/b2.meltemi", "logo.png"]),
    );
    expect(studio.host.has("notes.md")).toBe(false);
    // None of it is the person's edit.
    expect(heard.changes.length).toBeGreaterThan(0);
    expect(heard.changes.every((change) => change.remote)).toBe(true);
    studio.load([["diagrams/loaded.meltemi", SOURCE_A]], undefined, { remote: true });
    expect(studio.host.paths()).toEqual(["diagrams/loaded.meltemi"]);
  });

  it("still opens, analyses and shows files", () => {
    const { studio } = viewing();
    studio.select(B);
    expect(studio.open).toBe(B);
    expect(studio.document()?.diagrams.length).toBeGreaterThan(0);
    expect(studio.problems().size).toBe(0);
  });

  it("takes the person's edits again when it leaves view mode", () => {
    const { studio } = viewing();
    studio.setReadOnly(false);
    studio.setText(A, `${SOURCE_A}// back\n`);
    expect(studio.text(A)).toBe(`${SOURCE_A}// back\n`);
    expect(studio.canUndo()).toBe(true);
    expect(studio.undo()).toBe(true);
    expect(studio.text(A)).toBe(SOURCE_A);
    studio.addFiles([["more.md", "more\n"]]);
    expect(studio.host.has("more.md")).toBe(true);
  });
});

describe("the canvas's settings", () => {
  it("say readOnly while the page is in view mode, and not otherwise", () => {
    expect(canvasSettings(true)).toEqual({ ...CANVAS_SETTINGS, readOnly: true });
    expect(canvasSettings(false)).toEqual(CANVAS_SETTINGS);
    expect("readOnly" in canvasSettings(false)).toBe(false);
  });

  it("repeat readOnly in every message the page sends, as each settings message replaces the last", () => {
    const modes = [false, true, true, false, true];
    const messages = modes.map((on) => settingsMessage(on));
    expect(
      messages.map((m) => (m.type === "settings" ? m.settings.readOnly === true : undefined)),
    ).toEqual(modes);
    // Switching back to editing is a message of its own: the canvas leaves view mode without a reload.
    expect(settingsMessage(false)).toEqual({ type: "settings", settings: CANVAS_SETTINGS });
  });
});
