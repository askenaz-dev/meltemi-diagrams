import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CanvasSession,
  codeActions,
  completions,
  definition,
  documentSymbols,
  effectsPlayerDocument,
  formatDocument,
  hover,
  produceExport,
  semanticTokens,
  storyPlayerDocument,
  type ExportRequest,
  type HostMessage,
} from "@meltemi/diagrams-editor";
import { applyTextEdits, type TextEdit } from "@meltemi/diagrams-language";
import { planMotion } from "@meltemi/diagrams-motion";
import { frameSvg } from "@meltemi/diagrams-player";
import { importText } from "@meltemi/diagrams-import";
import { toProjectPath, templateManifest } from "@meltemi/diagrams-project";
import { TOOL_VERSION } from "../src/cli.js";
import { ACCEPTANCE_ROOT, REPO_ROOT, projectSessions } from "../src/corpus.js";

const sessions = projectSessions();
const path = (relative: string) => toProjectPath(join(ACCEPTANCE_ROOT, relative));
const scratch = mkdtempSync(join(tmpdir(), "acceptance-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("connectors", () => {
  it("keep parallel relations on separate routes, each with its own effect", () => {
    const analysis = sessions.analyze(path("flow/parallel.meltemi"));
    const view = analysis.diagrams[0]!;
    const scene = view.layout!.scene!;
    const tracks = scene.items.flatMap((i) =>
      i.kind === "group" && i.role === "relation" ? [JSON.stringify(i.track)] : [],
    );
    expect(new Set(tracks).size).toBe(tracks.length);
    const plan = planMotion(view.diagram, scene);
    expect(plan.effects.map((e) => [e.target, e.effect])).toEqual([
      ["insert", "flow"],
      ["changes", "dash"],
    ]);
    const insert = plan.effects.find((e) => e.target === "insert")!;
    const update = scene.items.find((i) => i.kind === "group" && i.id === "update");
    expect(JSON.stringify(insert.track)).not.toBe(
      JSON.stringify(update && "track" in update ? update.track : null),
    );
  });
});

describe("motion", () => {
  const request = (target: ExportRequest["target"], at: number): ExportRequest => ({
    target,
    format: "svg",
    theme: null,
    fonts: "system",
    motion: "static",
    at,
    scenario: undefined,
    scale: 2,
    size: null,
    background: null,
    link: null,
    embed: false,
    autoplay: false,
    loop: false,
    fps: null,
    durationMs: null,
    out: null,
  });

  it("draws the same frames in the player and in exports at the story's control times", () => {
    const file = toProjectPath(join(REPO_ROOT, "corpus", "valid", "stories", "purchase.meltemi"));
    const analysis = sessions.analyze(file);
    const doc = storyPlayerDocument(analysis, "purchase")!;
    const workspace = sessions.forFile(file);
    const compiled = workspace.file(file)!;
    const context = {
      file: compiled,
      workspace,
      projects: sessions,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set<string>(),
    };
    const story = compiled.compilation.document.stories[0]!;
    const times = new Set<number>([0, doc.timeline.durationMs]);
    for (const scene of doc.timeline.scenes) {
      times.add(scene.startMs);
      times.add(scene.startMs + scene.durationMs);
      for (const action of scene.actions) times.add(action.startMs + action.durationMs / 2);
    }
    expect(times.size).toBeGreaterThan(6);
    for (const t of times) {
      const exported = produceExport(context, request({ kind: "story", story }, t));
      expect("text" in exported, `at ${t}`).toBe(true);
      expect(frameSvg(doc, t), `at ${t} ms`).toBe((exported as { text: string }).text);
    }
  });

  it("draws the same frames of effects in the player and in exports", () => {
    const file = path("flow/parallel.meltemi");
    const analysis = sessions.analyze(file);
    const doc = effectsPlayerDocument(analysis, "parallel")!;
    const workspace = sessions.forFile(file);
    const compiled = workspace.file(file)!;
    const context = {
      file: compiled,
      workspace,
      projects: sessions,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set<string>(),
    };
    const diagram = compiled.compilation.document.diagrams[0]!;
    for (const t of [0, 300, 600, 1200]) {
      const exported = produceExport(
        context,
        request({ kind: "diagram", diagram, owner: compiled }, t),
      );
      expect(frameSvg(doc, t), `at ${t} ms`).toBe((exported as { text: string }).text);
    }
  });
});

describe("import", () => {
  const sources: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) visit(p);
      else if (/\.(mmd|puml|md)$/.test(entry) && !p.includes(`${join("import", "merge")}`))
        sources.push(p);
    }
  };
  visit(join(REPO_ROOT, "corpus", "import"));

  it("drops no essential construct without a finding", () => {
    expect(sources.length).toBeGreaterThan(10);
    for (const source of sources) {
      const result = importText(readFileSync(source, "utf8"), { fileName: source });
      for (const coverage of result.coverage) {
        for (const construct of coverage.constructs) {
          if (construct.status !== "dropped" || construct.count === 0) continue;
          const reported = result.findings.some(
            (f) => f.construct === construct.construct && f.status === "dropped",
          );
          expect(reported, `${source}: ${construct.construct}`).toBe(true);
        }
      }
      for (const finding of result.findings.filter((f) => f.essential && f.status === "dropped")) {
        expect(finding.severity, `${source}: ${finding.construct}`).not.toBe("info");
      }
    }
  });
});

describe("references", () => {
  it("renames a model entity in its views and in the stories of other files", () => {
    const project = join(scratch, "purchase");
    cpSync(join(REPO_ROOT, "packages", "cli", "templates", "purchase"), project, {
      recursive: true,
    });
    writeFileSync(
      join(project, "project.json"),
      templateManifest("purchase", "purchase", {
        toolVersion: TOOL_VERSION,
        languageVersion: "0.2",
      }),
    );
    const local = projectSessions();
    const model = toProjectPath(join(project, "models", "commerce.meltemi"));
    const text = readFileSync(model, "utf8");
    const offset = text.search(/person customer/) + "person ".length;
    const renamed = local.entityRename(model, offset, "buyer");
    expect(renamed?.ok).toBe(true);
    if (!renamed?.ok) return;
    const files = [...renamed.edits.keys()]
      .map((f) =>
        f
          .slice(project.length + 1)
          .split("\\")
          .join("/"),
      )
      .sort();
    expect(files).toContain("stories/purchase.meltemi");
    expect(files).toContain("models/commerce.meltemi");
    for (const [file, edits] of renamed.edits) {
      writeFileSync(file, applyTextEdits(readFileSync(file, "utf8"), edits as readonly TextEdit[]));
    }
    const fresh = projectSessions();
    const program = fresh.forFolder(toProjectPath(project)).compileProject();
    const errors = [...program.files.values()].flatMap((f) =>
      f.diagnostics.filter((d) => d.severity === "error"),
    );
    expect(errors).toEqual([]);
    expect(readFileSync(join(project, "stories", "purchase.meltemi"), "utf8")).not.toMatch(
      /\bcustomer\b/,
    );
  });
});

describe("syntax errors", () => {
  const cases = [
    {
      file: "errors/flow-unclosed.meltemi",
      base: "flow/cycles.meltemi",
      code: "syntax.expected-token",
    },
    {
      file: "errors/sequence-arrow.meltemi",
      base: "sequence/cycles.meltemi",
      code: "syntax.unexpected-character",
    },
    { file: "errors/c4-scope.meltemi", base: "c4/nested.meltemi", code: "ref.unknown-entity" },
    { file: "errors/free-size.meltemi", base: "free/nested.meltemi", code: "prop.invalid-value" },
  ];

  it.each(cases.map((c) => [c.file, c] as const))(
    "%s points at the fault, keeps every service working and the canvas stale",
    (_name, c) => {
      const text = readFileSync(join(ACCEPTANCE_ROOT, c.file), "utf8");
      const analysis = sessions.analyze(path(c.file));
      const errors = analysis.diagnostics.filter((d) => d.severity === "error");
      expect(errors.map((d) => d.code)).toEqual([c.code]);
      // Every service answers on the broken text.
      for (let offset = 0; offset < text.length; offset += 97) {
        completions(analysis, offset);
        hover(analysis, offset);
        definition(analysis, offset);
        codeActions(analysis, { start: offset, end: offset });
      }
      semanticTokens(analysis);
      documentSymbols(analysis);
      formatDocument(analysis);
      // The canvas keeps the last drawing it had, marked out of date.
      const session = new CanvasSession();
      const good = sessions.analyze(path(c.base));
      expect(session.update(good).some((m) => m.type === "render")).toBe(true);
      const broken: HostMessage[] = session.update(analysis);
      const stale = broken.some((m) => m.type === "stale");
      const drawnOther = broken.some((m) => m.type === "render");
      expect(stale || drawnOther, broken.map((m) => m.type).join(",")).toBe(true);
    },
  );
});
