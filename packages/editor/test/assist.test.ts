import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ModelAdapter } from "@meltemi/diagrams-assist";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { toProjectPath } from "@meltemi/diagrams-project";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { analyzeDocument, codeActions } from "../src/index.js";
import { ProjectSessions, applyAssist, prepareAssist, runAssist } from "../src/node.js";

const scratch = mkdtempSync(join(tmpdir(), "meltemi-assist-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), scratch, { recursive: true });
const projects = new ProjectSessions({ toolVersion: "1.0.0" });
const path = (relative: string) => toProjectPath(join(scratch, relative));

function answering(answer: object): ModelAdapter {
  return {
    provider: "test",
    model: "m",
    endpoint: "http://127.0.0.1",
    remote: false,
    complete: async () => JSON.stringify(answer),
  };
}

describe("assistance in a project", () => {
  it("shares the file and what it imports, by project-relative path", () => {
    const workspace = projects.forFile(path("stories/tour.meltemi"));
    const prepared = prepareAssist({
      workspace,
      operation: "modify",
      path: path("stories/tour.meltemi"),
      instruction: "Slower",
    });
    expect(prepared.request.path).toBe("stories/tour.meltemi");
    expect(prepared.request.shared.map((s) => [s.path, s.reason])).toEqual([
      ["diagrams/context.meltemi", "imported by it"],
      ["models/commerce.meltemi", "imported by an import"],
      ["diagrams/containers.meltemi", "imported by it"],
    ]);
    const generate = prepareAssist({
      workspace,
      operation: "generate",
      path: path("diagrams/new.meltemi"),
      instruction: "A view",
    });
    expect(generate.request.shared.map((s) => s.path)).toEqual(["models/commerce.meltemi"]);
  });

  it("describes items in the project and applies them with the unsaved text kept aside", async () => {
    const file = path("diagrams/containers.meltemi");
    const workspace = projects.forFile(file);
    const text = workspace.text(file)!;
    const prepared = prepareAssist({
      workspace,
      operation: "modify",
      path: file,
      instruction: "x",
    });
    const proposal = await runAssist(
      prepared,
      answering({
        summary: "New label",
        changes: [
          {
            action: "replace",
            block: "diagram containers",
            text: text
              .slice(text.indexOf("diagram containers"))
              .trim()
              .replace('"API de pedidos"', '"API"'),
          },
        ],
      }),
      file,
    );
    expect(proposal.path).toBe(file);
    expect(proposal.problems).toEqual([]);
    expect(proposal.items[0]!.changes.map((c) => c.details.join())).toEqual([
      'label "API de pedidos" → "API"',
    ]);
    expect(workspace.overlay(file)).toBeUndefined();
    const result = applyAssist(workspace, proposal, [1]);
    expect(result.ok && result.text).toContain('label shop.api "API"');
    expect(readFileSync(join(scratch, "diagrams", "containers.meltemi"), "utf8")).toBe(text);
  });
});

describe("confirming assumptions", () => {
  it("removes the assumption of the relation at the cursor", () => {
    const text = 'diagram d: flow {\n  a -> b { assumption "Usual" }\n  b -> c\n}\n';
    const analysis = analyzeDocument({ text });
    const offset = text.indexOf("a -> b");
    const action = codeActions(analysis, { start: offset, end: offset }).find((a) =>
      a.title.startsWith("Confirm the relation"),
    )!;
    expect(action.kind).toBe("quickfix");
    const confirmed = applyTextEdits(text, action.edits);
    expect(confirmed).not.toContain("assumption");
    expect(
      analyzeDocument({ text: confirmed }).compilation.document.diagrams[0]!.relations[0]!
        .assumption,
    ).toBeNull();
    const elsewhere = text.indexOf("b -> c");
    expect(
      codeActions(analysis, { start: elsewhere, end: elsewhere }).some((a) =>
        a.title.startsWith("Confirm"),
      ),
    ).toBe(false);
  });
});
