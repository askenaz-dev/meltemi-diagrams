// What an assistance request sends and how its answer becomes a proposal. Requests carry the
// language guide, the file and the files it imports, nothing else; the person sees that list
// before anything is sent (decision 0029). Prompts and repair messages are English whatever the
// interface language: they are written for the model, not for people.
import { getLocale, setLocale, type Locale } from "@meltemi/diagrams-i18n";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { compile, type Document } from "@meltemi/diagrams-model";
import type { AssistMessage, ModelAdapter } from "./adapters.js";
import { GUIDE_PAGES } from "./guide.js";
import { messages as words } from "./messages/index.js";
import {
  applyProposal,
  buildProposal,
  parseAnswer,
  type AssistOperation,
  type Proposal,
} from "./proposal.js";

/** A file sent with a request, and why. */
export interface SharedFile {
  /** Relative to the project. */
  readonly path: string;
  readonly text: string;
  /** Shown to the person in the interface language; never sent. */
  readonly reason: string;
}

export interface AssistRequest {
  readonly operation: AssistOperation;
  /** The file to change or create, relative to the project. */
  readonly path: string;
  /** Its current text; empty for a new file. */
  readonly text: string;
  /** What the person asks; for `relations`, an optional focus. */
  readonly instruction: string;
  /** `relations`: the block to look at, such as `diagram checkout`; every block when absent. */
  readonly block?: string;
  /** `generate`: the profile to start with. */
  readonly profile?: "flow" | "c4" | "sequence" | "free";
  /** Other files sent for context: the files the file imports, or may import. */
  readonly shared: readonly SharedFile[];
}

export interface AssistRun {
  readonly adapter: ModelAdapter;
  /** The diagnostics of a text of the file in its project, to validate proposals. */
  readonly check: (text: string) => readonly Diagnostic[];
  /** The document of a text of the file in its project, to describe what items change. */
  readonly documentOf?: (text: string) => Document;
  /** Answers sent back with their errors, at most; 1 by default. */
  readonly maxRepairs?: number;
  readonly signal?: AbortSignal;
  /** The language of the words a proposal writes into the file; English when absent. */
  readonly locale?: Locale;
}

/** What a request sends, for the person to see before it goes. */
export interface Disclosure {
  readonly provider: string;
  readonly model: string;
  readonly endpoint: string;
  readonly remote: boolean;
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly reason: string;
  }[];
  /** Characters of the person's own words sent. */
  readonly instruction: number;
}

const RULES = `You assist people who write Meltemi Diagrams sources (.meltemi files): diagrams as code that
people review in Git. Answer with exactly one JSON object and nothing before or after it.

Rules for the sources you write:
- Follow the language guide below exactly; the language version is 0.2. Use only the statements
  and properties it shows.
- Keep every id that exists unless the request asks to rename it: ids are the identity of
  elements, relations, entities and scenes.
- Keep the comments and the order of statements of what you do not change.
- Never refer to files, imports, images or icons that are not in the shared files, except
  built-in tabler:<name> icons you are sure of.
- Mark every relation you infer, rather than were asked for, with assumption "<why>" in its
  block; people confirm an assumption by removing that line.
- Give relations an id (as <id>) when stories, routes or styles may need to name them.
- Never write secrets, credentials or personal data.`;

function pagesFor(request: AssistRequest): string[] {
  const pages = new Set(["language"]);
  const types = new Set<string>();
  if (request.profile) types.add(request.profile);
  for (const text of [request.text, ...request.shared.map((s) => s.text)]) {
    const document = compile(text).document;
    for (const d of document.diagrams) types.add(d.type);
    if (document.models.length > 0) types.add("c4");
    if (document.stories.length > 0) pages.add("stories");
  }
  for (const type of ["sequence", "c4", "free"]) if (types.has(type)) pages.add(type);
  if (/\b(story|stories|walkthrough|recorrido|animat)/i.test(request.instruction))
    pages.add("stories");
  return [...pages];
}

/** The system prompt: the rules and the guide pages the request needs. */
export function systemPrompt(pages: readonly string[]): string {
  const guide = pages
    .filter((p) => GUIDE_PAGES[p] !== undefined)
    .map((p) => `<guide page="${p}">\n${GUIDE_PAGES[p]}\n</guide>`)
    .join("\n\n");
  return `${RULES}\n\n${guide}`;
}

const fileBlock = (path: string, text: string) => `<file path="${path}">\n${text}\n</file>`;

/** The first message of a request. */
export function requestMessage(request: AssistRequest): string {
  const shared = request.shared.map((s) => fileBlock(s.path, s.text)).join("\n\n");
  const context = shared ? `\n\nOther files of the project, for context:\n\n${shared}` : "";
  switch (request.operation) {
    case "generate":
      return `Write a new file ${request.path} for this request:

<request>
${request.instruction}
</request>
${request.profile ? `\nStart from a ${request.profile} diagram.\n` : ""}${context}

Answer with: {"summary": "<one sentence>", "file": "<the complete text of the new file, starting with language \\"0.2\\">"}`;
    case "modify":
      return `Change ${request.path} as this request asks:

<request>
${request.instruction}
</request>

${fileBlock(request.path, request.text)}${context}

Answer with the blocks you change, add or remove, each complete from its keyword to its closing
brace, and nothing the request does not need:
{"summary": "<one sentence>", "imports": ["<import statements the new blocks need, if any>"], "changes": [{"action": "replace" | "add" | "remove", "block": "<kind and id, such as diagram checkout>", "text": "<the complete new block; empty to remove>", "reason": "<why, in one sentence>"}]}`;
    case "relations":
      return `Find relations that are probably missing in ${request.path}${request.block ? `, in ${request.block}` : ""}:
connections that the names and descriptions of the elements and the other relations suggest but
the file does not have. Do not repeat relations that exist. For C4 views, add them to the model
block they come from. Leave sequence diagrams out.${request.instruction ? `\n\n<request>\n${request.instruction}\n</request>` : ""}

${fileBlock(request.path, request.text)}${context}

Answer with at most 10, the most likely first; an empty list is a fine answer:
{"summary": "<one sentence>", "relations": [{"block": "<kind and id of the block to add it to>", "from": "<id>", "to": "<id>", "label": "<short label>", "reason": "<why it is probably there>"}]}`;
  }
}

/** What a request will send. */
export function disclosure(request: AssistRequest, adapter: ModelAdapter): Disclosure {
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  return {
    provider: adapter.provider,
    model: adapter.model,
    endpoint: adapter.endpoint,
    remote: adapter.remote,
    files: [
      ...(request.text !== ""
        ? [{ path: request.path, bytes: bytes(request.text), reason: words().reasons.file }]
        : []),
      ...request.shared.map((s) => ({ path: s.path, bytes: bytes(s.text), reason: s.reason })),
    ],
    instruction: request.instruction.length,
  };
}

/** Runs synchronous work with English as the interface language, for text sent to a model. */
function inEnglish<T>(work: () => T): T {
  const previous = getLocale();
  setLocale("en");
  try {
    return work();
  } finally {
    setLocale(previous);
  }
}

/**
 * Asks the model and turns its answer into a proposal. When the items together add errors, the
 * errors go back to the model for a corrected answer, up to `maxRepairs` times; a proposal that
 * still adds errors lists them in `problems`.
 */
export async function propose(
  request: AssistRequest,
  run: AssistRun,
): Promise<Proposal & { readonly problems: readonly string[] }> {
  const system = systemPrompt(pagesFor(request));
  const messages: AssistMessage[] = [{ role: "user", content: requestMessage(request) }];
  const repairs = run.maxRepairs ?? 1;
  let last: (Proposal & { problems: readonly string[] }) | undefined;
  for (let attempt = 0; attempt <= repairs; attempt++) {
    const answerText = await run.adapter.complete({
      system,
      messages,
      ...(run.signal ? { signal: run.signal } : {}),
    });
    let answer: Record<string, unknown>;
    try {
      answer = parseAnswer(answerText);
    } catch (error) {
      if (attempt === repairs)
        throw new Error(words().proposal.notAsAsked((error as Error).message), {
          cause: error,
        });
      messages.push(
        { role: "assistant", content: answerText },
        { role: "user", content: "Answer again with only the JSON object asked for." },
      );
      continue;
    }
    const proposal = buildProposal({
      operation: request.operation,
      path: request.path,
      baseText: request.text,
      answer,
      provider: run.adapter.provider,
      model: run.adapter.model,
      ...(run.documentOf ? { documentOf: run.documentOf } : {}),
      ...(run.locale ? { locale: run.locale } : {}),
    });
    const all = applyProposal(
      proposal,
      request.text,
      proposal.items.map((i) => i.id),
      run.check,
    );
    last = { ...proposal, problems: all.ok || proposal.items.length === 0 ? [] : all.problems };
    if (last.problems.length === 0 || attempt === repairs) break;
    // The person reads the problems in the interface language; the model reads them in English.
    const forModel = inEnglish(() =>
      applyProposal(
        proposal,
        request.text,
        proposal.items.map((i) => i.id),
        run.check,
      ),
    );
    const errors = forModel.ok ? last.problems : forModel.problems;
    messages.push(
      { role: "assistant", content: answerText },
      {
        role: "user",
        content: `Applying every change gives these errors:\n${errors.map((p) => `- ${p}`).join("\n")}\n\nAnswer again with the whole JSON object, corrected.`,
      },
    );
  }
  return last!;
}

/**
 * Explains changes between two versions (as `describeChange` lines, by file) with the files
 * after them, in Markdown.
 */
export async function explainChanges(
  changes: string,
  shared: readonly SharedFile[],
  adapter: ModelAdapter,
  signal?: AbortSignal,
): Promise<{ summary: string; explanation: string }> {
  const files = shared.map((s) => fileBlock(s.path, s.text)).join("\n\n");
  const answer = parseAnswer(
    await adapter.complete({
      system: systemPrompt(["language"]),
      messages: [
        {
          role: "user",
          content: `Explain these changes between two versions of an architecture project to someone who
reviews them: what changed, why it may matter, and what to check. Use the ids and names as written,
and be brief.

<changes>
${changes}
</changes>
${files ? `\nThe changed files as they are now:\n\n${files}\n` : ""}
Answer with: {"summary": "<one sentence>", "explanation": "<Markdown, at most 300 words>"}`,
        },
      ],
      ...(signal ? { signal } : {}),
    }),
  );
  return {
    summary: typeof answer.summary === "string" ? answer.summary : "",
    explanation: typeof answer.explanation === "string" ? answer.explanation : "",
  };
}

/** The disclosure as lines for a terminal or a dialog, in the interface language. */
export function describeDisclosure(d: Disclosure): string[] {
  const t = words().disclosure;
  return [
    t.goesTo(d.provider, d.model, d.endpoint, d.remote),
    ...d.files.map((f) => `  ${f.path} (${t.size(f.bytes)}, ${f.reason})`),
    ...(d.instruction > 0 ? [`  ${t.instruction(d.instruction)}`] : []),
    `  ${t.guide}`,
  ];
}
