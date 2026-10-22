import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  analyzeDocument,
  CanvasSession,
  type HostMessage,
  type InspectorModel,
  type SessionResult,
  type ThemePanelModel,
} from "../src/index.js";
import { setJsonField } from "../src/json-edit.js";
import { ProjectSessions } from "../src/node.js";

const SHEET = [
  'language "0.2"',
  "",
  "theme brand {",
  '  extends "technical.light"',
  '  accent "#6A4FD0"',
  "  dashDuration 600ms",
  "}",
  "",
  "diagram checkout: flow {",
  '  theme "brand"',
  "  node api",
  "  node db",
  "  api -> db as save",
  "}",
  "",
].join("\n");

function open(text: string, options: ConstructorParameters<typeof CanvasSession>[0] = {}) {
  const session = new CanvasSession(options);
  let current = text;
  let rev = 1;
  let messages: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
  const send = (message: unknown): SessionResult => {
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
  send({ type: "pickDiagram", diagram: "checkout" });
  return {
    send,
    text: () => current,
    messages: () => messages,
    panel: (): ThemePanelModel | null | undefined =>
      messages.find((m): m is HostMessage & { type: "themePanel" } => m.type === "themePanel")
        ?.panel,
    inspector: (): InspectorModel =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const field = (panel: ThemePanelModel, name: string) =>
  panel.groups.flatMap((g) => g.fields).find((f) => f.name === name)!;

describe("setJsonField", () => {
  it("replaces the value of an existing field and keeps the rest", () => {
    const text = '{\n  "name": "p",\n  "theme": "technical.light"\n}\n';
    const edits = setJsonField(text, "theme", "themes/brand.meltemi#brand");
    expect(applyTextEdits(text, edits)).toBe(
      '{\n  "name": "p",\n  "theme": "themes/brand.meltemi#brand"\n}\n',
    );
    expect(
      setJsonField(applyTextEdits(text, edits), "theme", "themes/brand.meltemi#brand"),
    ).toEqual([]);
  });

  it("adds a field after the last one in the file's indentation and line endings", () => {
    const text = '{\r\n    "name": "p",\r\n    "sources": ["a", "b"]\r\n}\r\n';
    expect(applyTextEdits(text, setJsonField(text, "theme", "x"))).toBe(
      '{\r\n    "name": "p",\r\n    "sources": ["a", "b"],\r\n    "theme": "x"\r\n}\r\n',
    );
  });

  it("writes one-line and empty objects", () => {
    const line = '{ "name": "p" }';
    expect(applyTextEdits(line, setJsonField(line, "theme", "x"))).toBe(
      '{ "name": "p", "theme": "x" }',
    );
    expect(applyTextEdits("{}", setJsonField("{}", "theme", "x"))).toBe('{\n  "theme": "x"\n}');
  });

  it("skips nested objects and strings with braces", () => {
    const text = '{\n  "format": { "indent": 2 },\n  "name": "a } b"\n}';
    expect(JSON.parse(applyTextEdits(text, setJsonField(text, "theme", "x")))).toEqual({
      format: { indent: 2 },
      name: "a } b",
      theme: "x",
    });
  });

  it("refuses text that is not a JSON object", () => {
    expect(() => setJsonField("[1]", "theme", "x")).toThrow();
    expect(() => setJsonField("{ broken", "theme", "x")).toThrow();
  });
});

describe("theme panel", () => {
  it("opens on the diagram's theme with its tokens by group, written or inherited", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "editTheme", open: true });
    const panel = canvas.panel()!;
    expect(panel).toMatchObject({ id: "brand", file: null });
    expect(panel.groups.map((g) => g.title)).toEqual([
      "Base",
      "Colours",
      "Fonts",
      "Type",
      "Spacing",
      "Shapes and lines",
      "Icons",
      "Frame",
      "Motion",
      "Canvas",
    ]);
    // The canvas colours are inherited from the accent until the theme writes them.
    expect(field(panel, "selection")).toMatchObject({ type: "color", value: null });
    expect(field(panel, "extends")).toMatchObject({ value: "technical.light" });
    expect(field(panel, "accent")).toMatchObject({ type: "color", value: "#6A4FD0" });
    const ink = field(panel, "ink");
    expect(ink.value).toBeNull();
    expect(ink.placeholder).toMatch(/^#/);
    expect(field(panel, "dashDuration")).toMatchObject({ value: 600 });
    expect(field(panel, "flowDuration")).toMatchObject({ value: null, placeholder: "1200" });
    const font = field(panel, "font");
    expect(font.type).toBe("enum");
    expect(font.options).toContain("Inter");
    expect(field(panel, "labelWeight").options).toContain("600");
  });

  it("says there is nothing to edit for a built-in theme", () => {
    const canvas = open(SHEET.replace('  theme "brand"\n', ""));
    canvas.send({ type: "editTheme", open: true });
    expect(canvas.panel()).toBeNull();
    const result = canvas.send({ type: "themeToken", token: "accent", value: "#112233" });
    expect(result.messages[0]).toMatchObject({ type: "rejected", code: "edit.unsafe-target" });
  });

  it("writes, changes and removes tokens of a theme of the file", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "editTheme", open: true });
    canvas.send({ type: "themeToken", token: "ink", value: "#101010" });
    expect(canvas.text()).toContain('  ink "#101010"\n');
    canvas.send({ type: "themeToken", token: "accent", value: "#00AA88" });
    expect(canvas.text()).toContain('  accent "#00AA88"\n');
    canvas.send({ type: "themeToken", token: "dashDuration", value: null });
    expect(canvas.text()).not.toContain("dashDuration");
    canvas.send({ type: "themeToken", token: "font", value: "Inter" });
    expect(canvas.text()).toContain('  font "Inter"\n');
    canvas.send({ type: "themeToken", token: "labelWeight", value: "600" });
    expect(canvas.text()).toContain("  labelWeight 600\n");
    // The panel follows every new analysis.
    expect(field(canvas.panel()!, "ink")).toMatchObject({ value: "#101010" });
    expect(field(canvas.panel()!, "font")).toMatchObject({ value: "Inter" });
  });

  it("ignores the custom entry of a font written by hand", () => {
    const canvas = open(SHEET.replace("  dashDuration 600ms\n", '  font "Comic Mono, cursive"\n'));
    canvas.send({ type: "editTheme", open: true });
    expect(field(canvas.panel()!, "font")).toMatchObject({ value: "custom" });
    const before = canvas.text();
    expect(
      canvas.send({ type: "themeToken", token: "font", value: "custom" }).plan,
    ).toBeUndefined();
    expect(canvas.text()).toBe(before);
  });

  it("closes", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "editTheme", open: true });
    canvas.send({ type: "editTheme", open: false });
    expect(canvas.panel()).toBeNull();
  });
});

describe("new theme from the diagram's", () => {
  it("creates a theme in the file that extends the current one, used at once", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "newTheme", id: "night", scope: "file" });
    expect(canvas.text()).toContain('theme night {\n  extends "brand"\n}\n');
    expect(canvas.text()).toContain('  theme "night"\n');
    expect(canvas.text().indexOf("theme night")).toBeGreaterThan(
      canvas.text().indexOf("theme brand"),
    );
    expect(canvas.panel()).toMatchObject({ id: "night", file: null });
  });

  it("extends the built-in theme a diagram uses", () => {
    const canvas = open(SHEET.replace('  theme "brand"\n', '  theme "editorial.dark"\n'));
    canvas.send({ type: "newTheme", id: "mine", scope: "file" });
    expect(canvas.text()).toContain('theme mine {\n  extends "editorial.dark"\n}\n');
    expect(canvas.text()).toContain('  theme "mine"\n');
  });

  it("refuses an invalid or taken id", () => {
    const canvas = open(SHEET);
    const invalid = canvas.send({ type: "newTheme", id: "2 bad", scope: "file" });
    expect(invalid.messages[0]).toMatchObject({ type: "rejected" });
    const taken = canvas.send({ type: "newTheme", id: "brand", scope: "file" });
    expect(taken.plan).toBeUndefined();
    expect(taken.messages[0]).toMatchObject({ type: "rejected" });
  });

  it("asks for a project before creating a project theme", () => {
    const canvas = open(SHEET);
    const result = canvas.send({ type: "newTheme", id: "night", scope: "project" });
    expect(result.project).toBeUndefined();
    expect(result.messages[0]).toMatchObject({ type: "rejected" });
  });

  it("asks the host for the project's files and drops the diagram's own theme", () => {
    const canvas = open(SHEET, { project: () => true });
    const result = canvas.send({ type: "newTheme", id: "night", scope: "project" });
    expect(result.project).toEqual({ kind: "createTheme", theme: "night", extends: "brand" });
    expect(canvas.text()).not.toContain('  theme "brand"\n');
  });

  it("tells the strip whether themes can be edited and created for the project", () => {
    const canvas = open(SHEET, { project: () => true });
    expect(canvas.inspector().fields.find((f) => f.name === "theme")!.themes).toEqual({
      editable: true,
      project: true,
    });
    const builtIn = open(SHEET.replace('  theme "brand"\n', ""));
    expect(builtIn.inspector().fields.find((f) => f.name === "theme")!.themes).toEqual({
      editable: false,
      project: false,
    });
  });
});

describe("project themes", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-themes-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "diagrams"));
  const manifest = '{\n  "name": "p",\n  "language": "0.2",\n  "sources": ["diagrams"]\n}\n';
  writeFileSync(join(root, "project.json"), manifest);
  const sheet =
    'language "0.2"\n\ndiagram checkout: flow {\n  node api\n  node db\n  api -> db\n}\n';
  writeFileSync(join(root, "diagrams", "checkout.meltemi"), sheet);
  const slash = (path: string) => path.replace(/\\/g, "/");
  const checkout = slash(join(root, "diagrams", "checkout.meltemi"));
  const themeFile = slash(join(root, "themes", "night.meltemi"));
  const manifestPath = slash(join(root, "project.json"));

  it("creates themes/<id>.meltemi and makes it the project's default", () => {
    const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
    const created = sessions.createProjectTheme(checkout, "night", "technical.dark");
    if (!created.ok) throw new Error(created.reason);
    expect(created.create).toEqual([
      {
        path: themeFile,
        text: 'language "0.2"\n\ntheme night {\n  extends "technical.dark"\n}\n',
      },
    ]);
    const edited = applyTextEdits(manifest, created.edits.get(manifestPath)!);
    expect(JSON.parse(edited)).toMatchObject({ theme: "themes/night.meltemi#night" });
    expect(edited).toContain(
      '  "sources": ["diagrams"],\n  "theme": "themes/night.meltemi#night"\n',
    );
  });

  it("then edits the theme's own file from a diagram that uses it", () => {
    mkdirSync(join(root, "themes"));
    writeFileSync(
      join(root, "themes", "night.meltemi"),
      'language "0.2"\n\ntheme night {\n  extends "technical.dark"\n}\n',
    );
    writeFileSync(
      join(root, "project.json"),
      manifest.replace(
        '["diagrams"]\n',
        '["diagrams"],\n  "theme": "themes/night.meltemi#night"\n',
      ),
    );
    const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
    const analysis = sessions.analyze(checkout);
    expect(analysis.diagnostics).toEqual([]);
    const session = new CanvasSession({ path: checkout, project: () => true });
    session.update(analysis);
    session.receive({ type: "pickDiagram", diagram: "checkout" });
    const opened = session.receive({ type: "editTheme", open: true });
    const panel = (opened.messages[0] as HostMessage & { type: "themePanel" }).panel!;
    expect(panel).toMatchObject({ id: "night", file: themeFile });

    const result = session.receive({ type: "themeToken", token: "accent", value: "#FF8800" });
    expect(result.plan).toBeUndefined();
    expect(result.project).toEqual({
      kind: "files",
      steps: [
        {
          file: themeFile,
          operation: { kind: "setThemeToken", theme: "night", token: "accent", value: "#FF8800" },
        },
      ],
    });
    if (result.project?.kind !== "files") throw new Error("no theme file edit");
    const stepped = sessions.planSteps(checkout, result.project.steps);
    if (!stepped.ok) throw new Error(stepped.reason);
    expect([...stepped.edits.keys()]).toEqual([themeFile]);
    const planned = sessions.planInFile(themeFile, result.project.steps[0]!.operation);
    if (!planned.ok) throw new Error(planned.reason);
    expect(
      applyTextEdits(
        'language "0.2"\n\ntheme night {\n  extends "technical.dark"\n}\n',
        planned.edits,
      ),
    ).toBe('language "0.2"\n\ntheme night {\n  extends "technical.dark"\n  accent "#FF8800"\n}\n');
  });

  it("refuses a theme file that exists, or a file outside a project", () => {
    const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
    expect(sessions.createProjectTheme(checkout, "night", "technical.dark")).toMatchObject({
      ok: false,
    });
    const loose = mkdtempSync(join(tmpdir(), "mdg-loose-"));
    try {
      writeFileSync(join(loose, "a.meltemi"), sheet);
      const result = sessions.createProjectTheme(
        slash(join(loose, "a.meltemi")),
        "x",
        "technical.light",
      );
      expect(result).toMatchObject({ ok: false });
    } finally {
      rmSync(loose, { recursive: true, force: true });
    }
  });
});

describe("the panel of a new project theme", () => {
  it("opens once the host has written the theme's file and project.json", () => {
    const root = mkdtempSync(join(tmpdir(), "mdg-new-theme-"));
    try {
      const slash = (path: string) => path.split(sep).join("/");
      writeFileSync(join(root, "project.json"), '{ "name": "p", "language": "0.2" }\n');
      writeFileSync(
        join(root, "flow.meltemi"),
        'language "0.2"\n\ndiagram flow: flow {\n  node api\n}\n',
      );
      const file = slash(join(root, "flow.meltemi"));
      const session = new CanvasSession({ path: file, project: () => true });
      session.update(new ProjectSessions({ toolVersion: "1.0.0" }).analyze(file));
      session.receive({ type: "pickDiagram", diagram: "flow" });
      const asked = session.receive({ type: "newTheme", id: "night", scope: "project" });
      expect(asked.project).toEqual({
        kind: "createTheme",
        theme: "night",
        extends: "technical.light",
      });
      // The host writes both files, as VS Code and the playground do.
      const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
      const created = sessions.createProjectTheme(file, "night", "technical.light");
      if (!created.ok) throw new Error(created.reason);
      mkdirSync(join(root, "themes"));
      for (const made of created.create) writeFileSync(made.path, made.text);
      for (const [path, edits] of created.edits) {
        writeFileSync(path, applyTextEdits(readFileSync(path, "utf8"), edits));
      }
      const messages = session.update(new ProjectSessions({ toolVersion: "1.0.0" }).analyze(file));
      const panel = messages.find(
        (m): m is HostMessage & { type: "themePanel" } => m.type === "themePanel",
      );
      expect(panel?.panel).toMatchObject({
        id: "night",
        file: slash(join(root, "themes", "night.meltemi")),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
