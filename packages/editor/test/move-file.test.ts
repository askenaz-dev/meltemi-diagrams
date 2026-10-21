import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { importSpec, moveFileEdits } from "../src/index.js";
import { ProjectSessions } from "../src/node.js";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const HEADER = 'language "0.2"\n\n';

/** A project on disk with these files; answers its root as a compiler path and its sessions. */
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "mdg-move-"));
  roots.push(root);
  writeFileSync(join(root, "project.json"), '{ "name": "moves", "language": "0.2" }\n');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const base = root.split(sep).join("/");
  const at = (path: string) => `${base}/${path}`;
  return { at, sessions: new ProjectSessions({ toolVersion: "1.0.0" }), files };
}

/** The text of a file after the edits for it, keyed by the path it has after the moves. */
function moved(
  p: ReturnType<typeof project>,
  moves: readonly [string, string][],
): { texts: Map<string, string>; skipped: string[] } {
  const result = moveFileEdits(
    p.sessions,
    moves.map(([from, to]) => ({ from: p.at(from), to: p.at(to) })),
  );
  const back = new Map(moves.map(([from, to]) => [to, from]));
  const texts = new Map<string, string>();
  for (const [path, edits] of result.edits) {
    const relative = path.slice(p.at("").length);
    texts.set(relative, applyTextEdits(p.files[back.get(relative) ?? relative]!, edits));
  }
  return { texts, skipped: result.skipped.map((path) => path.slice(p.at("").length)) };
}

const views = `${HEADER}// The views of the system\nimport "../models/system.meltemi" as sys\n\ndiagram overview: flow {\n  a["A"]\n}\n`;

describe("moving files keeps imports working", () => {
  it("writes the shortest relative path a file imports another by", () => {
    expect(importSpec("/p/diagrams/views.meltemi", "/p/models/system.meltemi")).toBe(
      "../models/system.meltemi",
    );
    expect(importSpec("/p/a.meltemi", "/p/b.meltemi")).toBe("./b.meltemi");
    expect(importSpec("/p/a/b/c.meltemi", "/p/a/d.meltemi")).toBe("../d.meltemi");
  });

  it("rewrites an importer of a file that moves, and only its path", () => {
    const p = project({
      "models/system.meltemi": `${HEADER}diagram base: flow {\n}\n`,
      "diagrams/views.meltemi": views,
    });
    const { texts, skipped } = moved(p, [["models/system.meltemi", "models/core/system.meltemi"]]);
    expect(skipped).toEqual([]);
    expect([...texts.keys()]).toEqual(["diagrams/views.meltemi"]);
    expect(texts.get("diagrams/views.meltemi")).toBe(
      views.replace('"../models/system.meltemi"', '"../models/core/system.meltemi"'),
    );
  });

  it("rewrites the imports of the file that moves, relative to where it goes", () => {
    const p = project({
      "models/system.meltemi": `${HEADER}diagram base: flow {\n}\n`,
      "diagrams/views.meltemi": views,
    });
    const { texts } = moved(p, [["diagrams/views.meltemi", "diagrams/c4/views.meltemi"]]);
    expect(texts.get("diagrams/c4/views.meltemi")).toContain(
      'import "../../models/system.meltemi" as sys',
    );
  });

  it("leaves an import of another file alone", () => {
    const p = project({
      "models/system.meltemi": `${HEADER}diagram base: flow {\n}\n`,
      "models/other.meltemi": `${HEADER}diagram other: flow {\n}\n`,
      "diagrams/uses-other.meltemi": `${HEADER}import "../models/other.meltemi" as o\n`,
    });
    const { texts } = moved(p, [["models/system.meltemi", "models/core/system.meltemi"]]);
    expect(texts.size).toBe(0);
  });

  it("keeps files that move together pointing at each other", () => {
    const p = project({
      "models/a.meltemi": `${HEADER}import "./b.meltemi" as b\n`,
      "models/b.meltemi": `${HEADER}diagram b: flow {\n}\n`,
      "diagrams/views.meltemi": `${HEADER}import "../models/a.meltemi" as a\n`,
    });
    const { texts } = moved(p, [
      ["models/a.meltemi", "domain/a.meltemi"],
      ["models/b.meltemi", "domain/b.meltemi"],
    ]);
    // a and b moved together: a's import of b still reads ./b.meltemi, so it has no edit.
    expect(texts.has("domain/a.meltemi")).toBe(false);
    expect(texts.get("diagrams/views.meltemi")).toContain('import "../domain/a.meltemi" as a');
  });

  it("names a file that does not parse and leaves it as it is", () => {
    const p = project({
      "models/system.meltemi": `${HEADER}diagram base: flow {\n}\n`,
      "diagrams/broken.meltemi": `${HEADER}import "../models/system.meltemi" as\n`,
    });
    const { texts, skipped } = moved(p, [["models/system.meltemi", "models/core/system.meltemi"]]);
    expect(texts.size).toBe(0);
    expect(skipped).toEqual(["diagrams/broken.meltemi"]);
  });

  it("changes nothing when nothing moves", () => {
    const p = project({ "diagrams/views.meltemi": views });
    expect(moveFileEdits(p.sessions, []).edits.size).toBe(0);
  });
});
