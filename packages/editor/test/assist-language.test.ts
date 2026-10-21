import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  describeDisclosure,
  type CompletionRequest,
  type ModelAdapter,
} from "@meltemi/diagrams-assist";
import { setLocale } from "@meltemi/diagrams-i18n";
import { compile, diffDocuments } from "@meltemi/diagrams-model";
import { toProjectPath } from "@meltemi/diagrams-project";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  ProjectSessions,
  prepareAssist,
  prepareExplain,
  runAssist,
  runExplain,
  type Review,
} from "../src/node.js";

const scratch = mkdtempSync(join(tmpdir(), "meltemi-assist-language-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => setLocale("en"));
cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), scratch, { recursive: true });
const projects = new ProjectSessions({ toolVersion: "1.0.0" });
const path = (relative: string) => toProjectPath(join(scratch, relative));
const bytes = (text: string) => new TextEncoder().encode(text).length;

/** An adapter that records what it is sent and answers with one JSON object. */
function recording(answer: object): ModelAdapter & { sent: CompletionRequest[] } {
  const sent: CompletionRequest[] = [];
  return {
    provider: "test",
    model: "m",
    endpoint: "http://127.0.0.1",
    remote: false,
    sent,
    complete: async (request) => {
      sent.push({ system: request.system, messages: request.messages.map((m) => ({ ...m })) });
      return JSON.stringify(answer);
    },
  };
}

describe("assistance in a Spanish interface", () => {
  it("says why files are shared in Spanish and sends the model the same request", async () => {
    const file = path("stories/tour.meltemi");
    const workspace = projects.forFile(file);
    const ask = async () => {
      const prepared = prepareAssist({
        workspace,
        operation: "modify",
        path: file,
        instruction: "x",
      });
      const adapter = recording({ summary: "Nothing to change", changes: [] });
      await runAssist(prepared, adapter, file);
      const lines = describeDisclosure(prepared.disclosure(adapter));
      return { shared: prepared.request.shared, sent: adapter.sent, lines };
    };
    const english = await ask();
    setLocale("es");
    const spanish = await ask();
    expect(spanish.shared.map((s) => [s.path, s.reason])).toEqual([
      ["diagrams/context.meltemi", "importado por el archivo"],
      ["models/commerce.meltemi", "importado por un archivo importado"],
      ["diagrams/containers.meltemi", "importado por el archivo"],
    ]);
    expect(spanish.lines[0]).toBe(
      "Esta solicitud va a test (m) en http://127.0.0.1, en este equipo, con:",
    );
    expect(spanish.lines[1]).toMatch(/^ {2}stories\/tour\.meltemi \(\d+(,\d)? K?B, el archivo\)$/);
    expect(spanish.lines.slice(-2)).toEqual([
      "  tu solicitud (1 carácter)",
      "  la guía del lenguaje",
    ]);
    expect(english.sent).toHaveLength(1);
    expect(spanish.sent).toEqual(english.sent);
    const generate = prepareAssist({
      workspace,
      operation: "generate",
      path: path("diagrams/new.meltemi"),
      instruction: "Una vista",
    });
    expect(generate.request.shared.map((s) => [s.path, s.reason])).toEqual([
      ["models/commerce.meltemi", "un modelo del proyecto"],
    ]);
  });

  it("explains changes to the model in English and lists them in Spanish", async () => {
    const before =
      'language "0.2"\n\ndiagram checkout: flow {\n  api["API"]\n  db[("Orders")]\n  api -> db: "SQL" as save\n}\n';
    const after = before.replace('"API"', '"API Gateway"').replace('"SQL"', '"JDBC"');
    const review: Review = {
      files: [
        {
          path: "diagrams/checkout.meltemi",
          from: null,
          status: "changed",
          changes: diffDocuments(compile(before).document, compile(after).document),
          scopes: { checkout: "diagram" },
          diagrams: [],
        },
      ],
    };
    const explain = async () => {
      const prepared = prepareExplain(review, () => after);
      const adapter = recording({ summary: "s", explanation: "e" });
      await runExplain(prepared, adapter);
      const lines = describeDisclosure(prepared.disclosure(adapter));
      return { changes: prepared.changes, sent: adapter.sent, lines };
    };
    const english = await explain();
    setLocale("es");
    const spanish = await explain();
    expect(spanish.changes).toBe(english.changes);
    expect(spanish.changes).toBe(
      [
        "changed diagrams/checkout.meltemi",
        '  ~ element api "API Gateway": label "API" → "API Gateway" (in checkout)',
        '  ~ relation save (API Gateway → Orders: JDBC): label "SQL" → "JDBC" (in checkout)',
      ].join("\n"),
    );
    expect(spanish.sent).toEqual(english.sent);
    expect(spanish.sent[0]!.messages[0]!.content).toContain(`<changes>\n${english.changes}\n`);
    expect(spanish.lines).toEqual([
      "Esta solicitud va a test (m) en http://127.0.0.1, en este equipo, con:",
      `  la lista de cambios (${bytes(english.changes)} B, lo que encontró la revisión)`,
      `  diagrams/checkout.meltemi (${bytes(after)} B, modificado)`,
      "  la guía del lenguaje",
    ]);
    expect(english.lines).toEqual([
      "This request goes to test (m) at http://127.0.0.1, on this machine, with:",
      `  the list of changes (${bytes(english.changes)} B, what the review found)`,
      `  diagrams/checkout.meltemi (${bytes(after)} B, changed)`,
      "  the language guide",
    ]);
  });
});
