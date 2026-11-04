import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { afterAll, describe, expect, it } from "vitest";
import {
  CanvasSession,
  changedAssetFile,
  type HostMessage,
  type IconFileInput,
  type SessionResult,
} from "../src/index.js";
import { ProjectSessions } from "../src/node.js";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const PIN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l7 20H5z"/></svg>';
const BAD = '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24H0z"/></svg>';

const DIAGRAM = `language "0.2"

diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  api -> db
  placement {
    place api at (100, 100)
    place db at (400, 100)
  }
}
`;

/**
 * A project on disk with these files (and `project.json` unless `manifest` is false), a canvas
 * session on `diagrams/a.meltemi`, and helpers that send a message and plan what it asks.
 */
function project(files: Record<string, string>, manifest = true) {
  const root = mkdtempSync(join(tmpdir(), "mdg-icons-"));
  roots.push(root);
  const all = { "diagrams/a.meltemi": DIAGRAM, ...files };
  if (manifest)
    writeFileSync(join(root, "project.json"), '{ "name": "icons", "language": "0.2" }\n');
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const base = root.split(sep).join("/");
  const at = (path: string) => `${base}/${path}`;
  const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
  const document = at("diagrams/a.meltemi");
  const session = new CanvasSession({ path: document, project: () => manifest });
  session.update(sessions.analyze(document, undefined, 1));
  const send = (message: unknown): SessionResult => session.receive(message);
  const answer = <T extends HostMessage["type"]>(result: SessionResult, type: T) =>
    result.messages.find((m): m is HostMessage & { type: T } => m.type === type)!;
  return { at, sessions, session, send, answer, document };
}

const file = (name: string, svg = PIN, icon?: string): IconFileInput => ({
  file: name,
  svg,
  ...(icon !== undefined ? { name: icon } : {}),
});

describe("the JSON files of the assets", () => {
  it("adds a licence to a file that keeps its indentation and other entries", () => {
    const text = '{\n    "icons": {\n        "aws": { "license": "LicenseRef-AWS" }\n    }\n}\n';
    const after = changedAssetFile(text, { kind: "licence", prefix: "project", licence: "MIT" });
    expect(JSON.parse(after)).toEqual({
      icons: { aws: { license: "LicenseRef-AWS" }, project: { license: "MIT" } },
    });
    expect(after).toContain('\n    "icons": {\n        "aws"');
    // A pack that has a licence keeps it.
    expect(changedAssetFile(after, { kind: "licence", prefix: "aws", licence: "MIT" })).toBe(after);
  });

  it("makes the project's library and lists each icon once in its category", () => {
    const change = {
      kind: "libraryItems",
      category: "brand",
      title: "brand",
      items: [{ icon: "brand:pin", label: "Pin" }],
    } as const;
    const made = changedAssetFile(undefined, change);
    expect(JSON.parse(made)).toEqual({
      id: "project",
      title: "Project",
      categories: [{ id: "brand", title: "brand", items: [{ icon: "brand:pin", label: "Pin" }] }],
    });
    const again = changedAssetFile(made, {
      ...change,
      items: [
        { icon: "brand:pin", label: "Pin" },
        { icon: "brand:logo", label: "Logo" },
      ],
    });
    expect(JSON.parse(again).categories[0].items.map((i: { icon: string }) => i.icon)).toEqual([
      "brand:pin",
      "brand:logo",
    ]);
  });

  it("refuses a file that is not the object it should be", () => {
    expect(() =>
      changedAssetFile("{ nope", { kind: "licence", prefix: "p", licence: "MIT" }),
    ).toThrow();
    expect(() =>
      changedAssetFile('{ "icons": [] }', { kind: "licence", prefix: "p", licence: "MIT" }),
    ).toThrow(/icons/);
  });
});

describe("checking the Add icon dialog", () => {
  it("offers a name made of the file's, free in the pack, and previews each icon", () => {
    const p = project({
      "assets/icons/project/logo.svg": PIN,
      "assets/licenses.json": '{ "icons": { "project": { "license": "MIT" } } }\n',
    });
    const checked = p.answer(
      p.send({
        type: "checkIcons",
        token: 4,
        prefix: "project",
        files: [file("My Logo (1).svg"), file("logo.svg"), file("logo.svg")],
      }),
      "iconsChecked",
    );
    expect(checked.token).toBe(4);
    expect(checked.prefix).toEqual({ prefix: "project", existing: true, licensed: true });
    expect(checked.files.map((f) => [f.name, f.problem])).toEqual([
      ["My-Logo-1", undefined],
      ["logo-2", undefined],
      ["logo-3", undefined],
    ]);
    expect(checked.files[0]!.svg).toMatch(/^<svg[^>]*width="48"/);
  });

  it("refuses a name typed that the pack has, one twice, one a reference cannot write, and an unsafe file", () => {
    const p = project({ "assets/icons/project/logo.svg": PIN });
    const checked = p.answer(
      p.send({
        type: "checkIcons",
        token: 1,
        prefix: "project",
        files: [
          file("a.svg", PIN, "Logo"),
          file("b.svg", PIN, "pin"),
          file("c.svg", PIN, "pin"),
          file("d.svg", PIN, "my logo"),
          file("bad.svg", BAD),
          file("notes.txt", "hello"),
        ],
      }),
      "iconsChecked",
    );
    // The pack has no licence yet: the dialog asks for one.
    expect(checked.prefix).toEqual({ prefix: "project", existing: true, licensed: false });
    const problems = checked.files.map((f) => f.problem ?? "");
    expect(problems[0]).toContain("`project:Logo` exists already");
    expect(problems[1]).toBe("");
    expect(problems[2]).toContain("Two icons are named `pin`");
    expect(problems[3]).toContain("cannot be written in a reference");
    expect(problems[4]).toMatch(/Refused: .*script/);
    expect(checked.files[4]!.svg).toBeNull();
    expect(problems[5]).toBe("This file is not an SVG icon.");
  });

  it("refuses the prefixes the icons cannot go into", () => {
    const p = project({ "assets/icons/brand.json": '{"prefix":"brand","icons":{}}' });
    const prefix = (value: string) =>
      p.answer(
        p.send({ type: "checkIcons", token: 1, prefix: value, files: [file("pin.svg")] }),
        "iconsChecked",
      ).prefix;
    expect(prefix("tabler").problem).toContain("`tabler` is a built-in pack");
    expect(prefix("aws").problem).toContain("built-in pack");
    expect(prefix("Brand Kit").problem).toContain("is not a pack prefix");
    expect(prefix("").problem).toBe("Give the pack a prefix.");
    expect(prefix("brand").problem).toContain("Iconify file `assets/icons/brand.json`");
    expect(prefix("mine")).toEqual({ prefix: "mine", existing: false, licensed: false });
  });
});

describe("adding icons", () => {
  it("plans the icon's file, the licence, the library and the icon on the target, in order", () => {
    const p = project({});
    const result = p.send({
      type: "addIcons",
      token: 7,
      prefix: "project",
      licence: "MIT",
      files: [file("pin.svg", PIN, "pin")],
      targets: ["api"],
    });
    const added = p.answer(result, "iconsAdded");
    expect(added).toMatchObject({ token: 7, refused: [] });
    expect(added.added.map((a) => [a.file, a.reference, a.label])).toEqual([
      ["pin.svg", "project:pin", "Pin"],
    ]);
    expect(added.added[0]!.svg).toMatch(/^<svg[^>]*width="24"/);
    expect(p.answer(result, "status").message).toBe("Added `project:pin` to the project.");
    if (result.project?.kind !== "files") throw new Error("no steps");
    const { assets, steps } = result.project;
    expect(assets!.create).toEqual([{ path: "assets/icons/project/pin.svg", text: PIN }]);
    expect(assets!.json.map((j) => [j.path, j.change.kind])).toEqual([
      ["assets/licenses.json", "licence"],
      ["assets/libraries/project.json", "libraryItems"],
    ]);
    expect(steps.map((s) => ("operation" in s ? [s.file, s.operation.kind] : s))).toEqual([
      [null, "setStyleProperty"],
    ]);
    // Planned over the project: two new files and the library, and the style in the document.
    const planned = p.sessions.planAssetSteps(p.document, assets!, steps);
    if (!planned.ok) throw new Error(planned.reason);
    expect(planned.create!.map((c) => c.path).sort()).toEqual(
      [
        p.at("assets/icons/project/pin.svg"),
        p.at("assets/libraries/project.json"),
        p.at("assets/licenses.json"),
      ].sort(),
    );
    const licences = planned.create!.find((c) => c.path.endsWith("licenses.json"))!;
    expect(JSON.parse(licences.text)).toEqual({ icons: { project: { license: "MIT" } } });
    const library = JSON.parse(planned.create!.find((c) => c.path.endsWith("project.json"))!.text);
    expect(library.categories).toEqual([
      { id: "project", title: "project", items: [{ icon: "project:pin", label: "Pin" }] },
    ]);
    const text = applyTextEdits(DIAGRAM, planned.edits.get(p.document)!);
    expect(text).toContain('style api { icon "project:pin" }');
    // Planning left the project's files as they were.
    expect(
      p.sessions.forFile(p.document).text(p.at("assets/icons/project/pin.svg")),
    ).toBeUndefined();
  });

  it("adds to an existing licensed pack without a licence, and leaves an unsafe file out", () => {
    const p = project({
      "assets/icons/brand/logo.svg": PIN,
      "assets/licenses.json": '{\n  "icons": {\n    "brand": { "license": "CC0-1.0" }\n  }\n}\n',
    });
    const result = p.send({
      type: "addIcons",
      token: 2,
      prefix: "brand",
      files: [file("a.svg"), file("bad.svg", BAD), file("b.svg")],
      targets: [],
    });
    const added = p.answer(result, "iconsAdded");
    expect(added.added.map((a) => a.reference)).toEqual(["brand:a", "brand:b"]);
    expect(added.refused.map((r) => r.file)).toEqual(["bad.svg"]);
    if (result.project?.kind !== "files") throw new Error("no steps");
    expect(result.project.assets!.json.map((j) => j.change.kind)).toEqual(["libraryItems"]);
    expect(result.project.steps).toEqual([]);
    const planned = p.sessions.planAssetSteps(p.document, result.project.assets!, []);
    if (!planned.ok) throw new Error(planned.reason);
    expect(planned.edits.size).toBe(0);
    expect(planned.create!.map((c) => c.path.slice(c.path.indexOf("assets/")))).toEqual([
      "assets/icons/brand/a.svg",
      "assets/icons/brand/b.svg",
      "assets/libraries/project.json",
    ]);
  });

  it("plans nothing when every file is refused, or the new pack has no licence", () => {
    const p = project({ "assets/icons/project/pin.svg": PIN });
    const taken = p.send({
      type: "addIcons",
      token: 1,
      prefix: "project",
      licence: "MIT",
      files: [file("pin.svg", PIN, "pin")],
      targets: ["api"],
    });
    expect(taken.project).toBeUndefined();
    expect(p.answer(taken, "iconsAdded").refused[0]!.reason).toContain("`project:pin` exists");
    const unlicensed = p.send({
      type: "addIcons",
      token: 2,
      prefix: "fresh",
      files: [file("x.svg")],
      targets: [],
    });
    expect(unlicensed.project).toBeUndefined();
    expect(p.answer(unlicensed, "iconsAdded").refused[0]!.reason).toBe(
      "Choose the licence of the new pack.",
    );
    const malformed = p.send({
      type: "addIcons",
      token: 3,
      prefix: "fresh",
      licence: "not a licence!",
      files: [file("x.svg")],
      targets: [],
    });
    expect(p.answer(malformed, "iconsAdded").refused[0]!.reason).toContain(
      "is not an SPDX identifier",
    );
  });

  it("refuses a file the disk has meanwhile, and a licence file that cannot be read", () => {
    const p = project({ "assets/licenses.json": "{ broken" });
    const result = p.send({
      type: "addIcons",
      token: 1,
      prefix: "project",
      licence: "MIT",
      files: [file("pin.svg")],
      targets: [],
    });
    if (result.project?.kind !== "files") throw new Error("no steps");
    const planned = p.sessions.planAssetSteps(p.document, result.project.assets!, []);
    expect(planned).toMatchObject({ ok: false, code: "edit.unsafe-target" });
    if (planned.ok) return;
    expect(planned.reason).toContain("`assets/licenses.json` cannot be changed");
    // The icon's path taken after the check: nothing is written.
    writeFileSync(join(p.at("assets"), "licenses.json"), "{}\n");
    mkdirSync(p.at("assets/icons/project"), { recursive: true });
    writeFileSync(p.at("assets/icons/project/pin.svg"), PIN);
    const again = p.sessions.planAssetSteps(p.document, result.project.assets!, []);
    expect(again).toMatchObject({ ok: false, code: "edit.id-conflict" });
  });

  it("refuses outside a project", () => {
    const p = project({}, false);
    const result = p.send({
      type: "addIcons",
      token: 5,
      prefix: "project",
      licence: "MIT",
      files: [file("pin.svg")],
      targets: [],
    });
    expect(result.project).toBeUndefined();
    expect(p.answer(result, "iconsAdded").refused).toEqual([
      {
        file: "pin.svg",
        reason: "Icons are added to a project: open the file in its project's folder.",
      },
    ]);
    expect(p.answer(result, "rejected").code).toBe("edit.unsafe-target");
  });

  it("validates the messages of the dialog", () => {
    const p = project({});
    const huge = "x".repeat(300_001);
    for (const message of [
      { type: "checkIcons", token: 1, prefix: "project", files: [] },
      { type: "checkIcons", token: 1, prefix: "project", files: [{ file: "a.svg", svg: huge }] },
      { type: "addIcons", token: 1, prefix: "project", files: [file("a.svg")] },
    ]) {
      expect(p.send(message).messages).toEqual([]);
    }
  });
});

describe("the project's icons in the picker and the Libraries panel", () => {
  const library = JSON.stringify({
    id: "project",
    title: "Project",
    categories: [
      {
        id: "brand",
        title: "brand",
        items: [
          { icon: "brand:logo", label: "Company logo" },
          { icon: "brand:pin", label: "Pin" },
        ],
      },
    ],
  });
  const branded = {
    "assets/icons/brand/logo.svg": PIN,
    "assets/icons/brand/pin.svg": PIN,
    "assets/licenses.json": '{ "icons": { "brand": { "license": "MIT" } } }\n',
    "assets/libraries/project.json": library,
  };

  it("shows the project's packs before the Technology library for an empty search", () => {
    const p = project(branded);
    const groups = p.answer(p.send({ type: "searchIcons", query: "", token: 4 }), "icons").groups;
    expect(groups[0]).toMatchObject({ id: "brand", kind: "pack" });
    expect(groups[0]!.items.map((i) => [i.reference, i.label])).toEqual([
      ["brand:logo", "Company logo"],
      ["brand:pin", "Pin"],
    ]);
    expect(groups[0]!.items[0]!.svg).toMatch(/^<svg/);
    expect(groups.findIndex((g) => g.id === "tech")).toBeGreaterThan(0);
  });

  it("lists the Project library in the Libraries panel", () => {
    const p = project(branded);
    const libraries = p.answer(p.send({ type: "libraries" }), "libraries").libraries;
    expect(libraries.find((l) => l.id === "project")).toEqual({
      id: "project",
      title: "Project",
      categories: [{ id: "brand", title: "brand", count: 2 }],
    });
  });

  it("offers no icon of a file a reference cannot name", () => {
    const p = project({
      "assets/icons/brand/My Logo.svg": PIN,
      "assets/licenses.json": '{ "icons": { "brand": { "license": "MIT" } } }\n',
    });
    const groups = p.answer(p.send({ type: "searchIcons", query: "logo", token: 5 }), "icons");
    const references = groups.groups.flatMap((g) => g.items.map((i) => i.reference));
    expect(references.filter((r) => r.startsWith("brand:"))).toEqual([]);
    const ws = p.sessions.forFile(p.document);
    expect(ws.assets().diagnostics.get(p.at("assets/icons/brand/My Logo.svg"))![0]!.code).toBe(
      "asset.unusable-name",
    );
  });
});
