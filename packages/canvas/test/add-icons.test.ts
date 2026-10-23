import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import {
  ICON_FILE_KB,
  OTHER_LICENCE,
  dialogState,
  pickedRefusal,
  sentFiles,
  type IconsCheck,
  type PickedIcon,
} from "../src/add-icons.js";

afterEach(() => setLocale("en"));

const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
const own = { choice: "LicenseRef-Project", other: "" };

const picked = (...names: string[]): PickedIcon[] =>
  names.map((file) => {
    const refused = pickedRefusal(file, "", 100);
    return refused === undefined ? { file, svg: SVG } : { file, svg: "", refused };
  });

/** The session's answer for files named as given, each fine unless a problem is named for it. */
const check = (
  prefix: Partial<IconsCheck["prefix"]>,
  files: readonly { name: string; problem?: string; refused?: boolean }[],
): IconsCheck => ({
  prefix: { prefix: "project", existing: false, licensed: false, ...prefix },
  files: files.map((f, i) => ({
    file: `f${i}.svg`,
    name: f.name,
    svg: f.refused ? null : "<svg/>",
    ...(f.problem !== undefined ? { problem: f.problem } : {}),
  })),
});

describe("the files picked for the Add icon dialog", () => {
  it("leaves out a picture that is not an SVG, and an SVG too large for an icon", () => {
    expect(pickedRefusal("photo.png", "image/png", 2000)).toContain("added as images");
    expect(pickedRefusal("logo.SVG", "", 2000)).toBeUndefined();
    expect(pickedRefusal("logo", "image/svg+xml", 2000)).toBeUndefined();
    expect(pickedRefusal("huge.svg", "image/svg+xml", ICON_FILE_KB * 1024 + 1)).toContain(
      `${ICON_FILE_KB} KB`,
    );
  });

  it("sends the files it does not leave out, with the names typed for them", () => {
    const files = picked("a.svg", "photo.png", "b.svg");
    const sent = sentFiles(files, new Map([[2, "bee"]]));
    expect(sent.indexes).toEqual([0, 2]);
    expect(sent.files).toEqual([
      { file: "a.svg", svg: SVG },
      { file: "b.svg", svg: SVG, name: "bee" },
    ]);
  });
});

describe("the state of the Add icon dialog", () => {
  it("waits for the session before it can add", () => {
    const state = dialogState(picked("a.svg"), new Map(), undefined, own);
    expect(state.canAdd).toBe(false);
    expect(state.rows[0]).toMatchObject({ file: "a.svg", leftOut: false, svg: null });
  });

  it("shows the names the session offers, and adds a new pack with its licence", () => {
    const state = dialogState(
      picked("My Logo.svg", "logo.svg"),
      new Map(),
      check({}, [{ name: "My-Logo" }, { name: "logo-2" }]),
      own,
    );
    expect(state.rows.map((r) => r.name)).toEqual(["My-Logo", "logo-2"]);
    expect(state.licenceAsked).toBe(true);
    expect(state.licence).toBe("LicenseRef-Project");
    expect(state).toMatchObject({ count: 2, canAdd: true });
  });

  it("asks no licence of a pack that has one", () => {
    const state = dialogState(
      picked("a.svg"),
      new Map(),
      check({ existing: true, licensed: true }, [{ name: "a" }]),
      { choice: OTHER_LICENCE, other: "" },
    );
    expect(state.licenceAsked).toBe(false);
    expect(state.licence).toBeUndefined();
    expect(state.canAdd).toBe(true);
  });

  it("takes a licence typed under Other…, and refuses one that is no identifier", () => {
    const files = picked("a.svg");
    const checked = check({}, [{ name: "a" }]);
    const typed = dialogState(files, new Map(), checked, {
      choice: OTHER_LICENCE,
      other: " OFL-1.1 ",
    });
    expect(typed).toMatchObject({ licence: "OFL-1.1", canAdd: true });
    const bad = dialogState(files, new Map(), checked, {
      choice: OTHER_LICENCE,
      other: "my licence",
    });
    expect(bad.canAdd).toBe(false);
    expect(bad.licenceProblem).toContain("SPDX identifier");
  });

  it("keeps the dialog from adding while the prefix is refused", () => {
    const state = dialogState(
      picked("a.svg"),
      new Map(),
      check({ prefix: "tabler", problem: "`tabler` is a built-in pack" }, [{ name: "a" }]),
      own,
    );
    expect(state.prefixProblem).toContain("built-in pack");
    expect(state.licenceAsked).toBe(false);
    expect(state.canAdd).toBe(false);
  });

  it("keeps it from adding while a name is taken, until another is typed", () => {
    const files = picked("logo.svg");
    const taken = dialogState(
      files,
      new Map([[0, "logo"]]),
      check({ existing: true, licensed: true }, [
        { name: "logo", problem: "`project:logo` exists" },
      ]),
      own,
    );
    expect(taken.rows[0]).toMatchObject({ problem: "`project:logo` exists", leftOut: false });
    expect(taken.canAdd).toBe(false);
    const fixed = dialogState(
      files,
      new Map([[0, "logo-new"]]),
      check({ existing: true, licensed: true }, [{ name: "logo-new" }]),
      own,
    );
    expect(fixed.canAdd).toBe(true);
  });

  it("leaves out a raster and an unsafe file without keeping the others from being added", () => {
    const state = dialogState(
      picked("ok.svg", "photo.png", "bad.svg"),
      new Map(),
      check({}, [{ name: "ok" }, { name: "bad", problem: "Refused: `<script>`", refused: true }]),
      own,
    );
    expect(state.rows.map((r) => r.leftOut)).toEqual([false, true, true]);
    expect(state.rows[1]!.problem).toContain("added as images");
    expect(state).toMatchObject({ count: 1, canAdd: true });
  });

  it("adds nothing when every file is left out", () => {
    const state = dialogState(picked("photo.png"), new Map(), check({}, []), own);
    expect(state).toMatchObject({ count: 0, canAdd: false });
  });

  it("speaks the interface language", () => {
    setLocale("es");
    expect(pickedRefusal("foto.png", "image/png", 10)).toContain("como imágenes");
  });
});
