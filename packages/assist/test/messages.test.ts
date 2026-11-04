import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { compile } from "@meltemi/diagrams-model";
import {
  AssistError,
  adapterFor,
  anthropicAdapter,
  applyProposal,
  assistMessages,
  buildProposal,
  describeDisclosure,
  disclosure,
  explainChanges,
  openAiCompatibleAdapter,
  parseAnswer,
  propose,
  requestMessage,
  systemPrompt,
  type AssistRequest,
  type CompletionRequest,
  type Fetch,
  type ModelAdapter,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

afterEach(() => setLocale("en"));

const KEY = "sk-test-0123456789";

/** A fetch that gives every request the same response, or fails, without any network. */
const responding =
  (status: number, body: unknown): Fetch =>
  async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

/** The error of one completion, or null when it succeeds. */
const failure = (adapter: ModelAdapter) =>
  adapter.complete({ system: "S", messages: [] }).then(
    () => null,
    (error: unknown) => error as AssistError,
  );

/** An adapter that answers from a list and records what it is sent. */
function scripted(answers: string[]): ModelAdapter & { sent: CompletionRequest[] } {
  const sent: CompletionRequest[] = [];
  return {
    provider: "test",
    model: "scripted",
    endpoint: "http://127.0.0.1",
    remote: false,
    sent,
    complete: async (request) => {
      sent.push({ system: request.system, messages: request.messages.map((m) => ({ ...m })) });
      return answers.shift() ?? "{}";
    },
  };
}

const SHEET = `language "0.2"

diagram checkout: flow {
  client["Client"]
  api["API"]
  client -> api: "HTTPS" as request
}
`;

const check = (text: string) => compile(text).diagnostics;

/** A request whose reasons are made in the interface language, as hosts make them. */
const requestOf = (operation: AssistRequest["operation"]): AssistRequest => ({
  operation,
  path: "diagrams/checkout.meltemi",
  text: SHEET,
  instruction: "Add a database for orders",
  shared: [
    {
      path: "models/m.meltemi",
      text: 'language "0.2"\n\nmodel m {\n  person p "P"\n}\n',
      reason: assistMessages().reasons.importedByIt,
    },
  ],
});

describe("the assistance's catalog", () => {
  it("has every string in Spanish", () => {
    expect(untranslated(en, es)).toEqual([]);
  });
});

describe("assistance in a Spanish interface", () => {
  it("says what a configuration lacks", () => {
    setLocale("es");
    expect(adapterFor({}, {})).toBe(
      "No hay ningún proveedor de IA configurado: define MELTEMI_AI_PROVIDER como anthropic (con ANTHROPIC_API_KEY) u openai-compatible (con MELTEMI_AI_BASE_URL y MELTEMI_AI_MODEL). La validación, la disposición y la exportación nunca lo necesitan.",
    );
    expect(adapterFor({ provider: "anthropic" }, {})).toBe(
      "Anthropic necesita una clave en ANTHROPIC_API_KEY.",
    );
    expect(adapterFor({ provider: "openai-compatible" }, {})).toBe(
      "Un proveedor compatible con OpenAI necesita MELTEMI_AI_BASE_URL, como http://127.0.0.1:11434/v1.",
    );
    expect(adapterFor({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:1/v1" })).toBe(
      "Un proveedor compatible con OpenAI necesita MELTEMI_AI_MODEL, el nombre del modelo.",
    );
    expect(adapterFor({ provider: "other" }, {})).toBe(
      'Proveedor de IA desconocido "other"; usa anthropic u openai-compatible.',
    );
    setLocale("en");
    expect(adapterFor({ provider: "other" }, {})).toBe(
      'Unknown AI provider "other"; use anthropic or openai-compatible.',
    );
  });

  it("reports the errors of providers, still without their keys", async () => {
    setLocale("es");
    const anthropic = (fetcher: Fetch) => anthropicAdapter({ apiKey: KEY, fetch: fetcher });
    const refused = await failure(
      anthropic(responding(500, { error: { message: `Invalid key ${KEY}` } })),
    );
    expect(refused).toBeInstanceOf(AssistError);
    expect(refused).toMatchObject({
      message: "El proveedor respondió con 500: Invalid key [redacted]",
      status: 500,
    });
    const unreachable = await failure(
      anthropic(async () => {
        throw new Error(`connection refused for ${KEY}`);
      }),
    );
    expect(unreachable?.message).toBe(
      "No se puede conectar con https://api.anthropic.com: connection refused for [redacted]",
    );
    expect((await failure(anthropic(responding(200, "<html>"))))?.message).toBe(
      "La respuesta del proveedor no es JSON.",
    );
    expect(
      (await failure(anthropic(responding(200, { content: [], stop_reason: "max_tokens" }))))
        ?.message,
    ).toBe("La respuesta se cortó al llegar a su límite de longitud; pide menos a la vez.");
    const local = (body: unknown) =>
      openAiCompatibleAdapter({
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama",
        fetch: responding(200, body),
      });
    expect((await failure(local({ choices: [{ message: { content: "" } }] })))?.message).toBe(
      "La respuesta del proveedor no tiene texto.",
    );
  });

  it("lists what a request sends, with decimal commas", () => {
    const remote: ModelAdapter = {
      provider: "anthropic",
      model: "claude-opus-5-5",
      endpoint: "https://api.anthropic.com",
      remote: true,
      complete: async () => "{}",
    };
    const sizes = (request: AssistRequest): AssistRequest => ({
      ...request,
      text: "x".repeat(1536),
      shared: request.shared.map((s) => ({ ...s, text: "y".repeat(1024) })),
    });
    const english = describeDisclosure(disclosure(sizes(requestOf("modify")), remote));
    setLocale("es");
    expect(describeDisclosure(disclosure(sizes(requestOf("modify")), remote))).toEqual([
      "Esta solicitud va a anthropic (claude-opus-5-5) en https://api.anthropic.com, con:",
      "  diagrams/checkout.meltemi (1,5 KB, el archivo)",
      "  models/m.meltemi (1 KB, importado por el archivo)",
      "  tu solicitud (25 caracteres)",
      "  la guía del lenguaje",
    ]);
    expect(describeDisclosure(disclosure(requestOf("modify"), scripted([])))[0]).toBe(
      "Esta solicitud va a test (scripted) en http://127.0.0.1, en este equipo, con:",
    );
    expect(assistMessages().disclosure.instruction(1)).toBe("tu solicitud (1 carácter)");
    expect(english).toEqual([
      "This request goes to anthropic (claude-opus-5-5) at https://api.anthropic.com, with:",
      "  diagrams/checkout.meltemi (1.5 KB, the file)",
      "  models/m.meltemi (1.0 KB, imported by it)",
      "  your request (25 characters)",
      "  the language guide",
    ]);
  });

  it("words the problems of answers and proposals", async () => {
    setLocale("es");
    expect(() => parseAnswer("sin JSON")).toThrow("La respuesta no contiene ningún objeto JSON.");
    await expect(
      propose(requestOf("modify"), { adapter: scripted(["nada", "nada"]), check }),
    ).rejects.toThrow(
      "El asistente no respondió como se le pidió: La respuesta no contiene ningún objeto JSON.",
    );
    const source = {
      operation: "relations",
      path: "diagrams/checkout.meltemi",
      baseText: SHEET,
      provider: "test",
      model: "m",
      answer: { relations: [{ block: "diagram checkout", from: "api", to: "client" }] },
    } as const;
    // The reason is written into the file: the language of written files, not the interface's.
    expect(buildProposal(source).items.map((i) => [i.reason, i.text])).toEqual([
      ["Inferred", 'api -> client { assumption "Inferred" }'],
    ]);
    const relations = buildProposal({ ...source, locale: "es" });
    expect(relations.items.map((i) => [i.reason, i.text])).toEqual([
      ["Inferida", 'api -> client { assumption "Inferida" }'],
    ]);
    expect(applyProposal(relations, SHEET, [], check)).toMatchObject({
      ok: false,
      problems: ["No se aceptó ningún punto."],
    });
    const renamed = SHEET.replace("diagram checkout", "diagram purchase");
    expect(applyProposal(relations, renamed, [1], check)).toMatchObject({
      ok: false,
      problems: ["Todos los puntos aceptados cambiaron desde la propuesta."],
      conflicts: [1],
    });
  });

  it("sends the model the same English prompts and repair messages", async () => {
    const operations = ["generate", "modify", "relations"] as const;
    const conversation = async () => {
      const adapter = scripted(["no JSON here", JSON.stringify({ summary: "s", changes: [] })]);
      await propose(requestOf("modify"), { adapter, check });
      const explainer = scripted([JSON.stringify({ summary: "s", explanation: "e" })]);
      await explainChanges("~ element api: label", requestOf("modify").shared, explainer);
      return [...adapter.sent, ...explainer.sent];
    };
    const english = {
      system: systemPrompt(["language", "c4", "stories"]),
      messages: operations.map((o) => requestMessage(requestOf(o))),
      conversation: await conversation(),
    };
    setLocale("es");
    expect(systemPrompt(["language", "c4", "stories"])).toBe(english.system);
    expect(operations.map((o) => requestMessage(requestOf(o)))).toEqual(english.messages);
    const spanish = await conversation();
    expect(spanish).toEqual(english.conversation);
    expect(spanish[1]!.messages.at(-1)!.content).toBe(
      "Answer again with only the JSON object asked for.",
    );
  });

  it("sends the model the errors in English and shows them to the person in Spanish", async () => {
    const bad = JSON.stringify({
      summary: "x",
      changes: [
        {
          action: "add",
          block: "diagram more",
          text: "diagram more: flow {\n  a -> b\n  place ghost at (1, 2)\n}",
        },
      ],
    });
    setLocale("es");
    const adapter = scripted([bad, bad]);
    const proposal = await propose(requestOf("modify"), { adapter, check });
    const followUp = adapter.sent[1]!.messages.at(-1)!.content;
    expect(followUp).toMatch(/^Applying every change gives these errors:\n- /);
    expect(followUp).toContain("prop.unknown Unknown statement `place` in a flow diagram.");
    expect(proposal.problems.join("\n")).toContain("prop.unknown");
    expect(proposal.problems.join("\n")).not.toContain("Unknown statement");
    setLocale("en");
    const english = await propose(requestOf("modify"), { adapter: scripted([bad, bad]), check });
    expect(followUp).toContain(english.problems[0]!);
  });
});
