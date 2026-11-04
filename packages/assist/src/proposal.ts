// Proposals: what an assistant suggests, as reviewable items against a known revision of a file.
// Items are whole blocks (added, replaced or removed), new files, or relations marked as
// assumptions; people accept any of them, and nothing is applied that adds errors (decision 0029).
import type { Locale } from "@meltemi/diagrams-i18n";
import type { Diagnostic } from "@meltemi/diagrams-language";
import {
  compile,
  diffDocuments,
  type Compilation,
  type Document,
  type ModelChange,
} from "@meltemi/diagrams-model";
import { messages } from "./messages/index.js";

export const PROPOSAL_FORMAT = "meltemi-proposal";
export const PROPOSAL_VERSION = 1;

export type AssistOperation = "generate" | "modify" | "relations";

export interface ProposalItem {
  /** From 1, in the order the items are listed. */
  readonly id: number;
  readonly action: "create" | "add" | "replace" | "remove" | "relation";
  /** The block the item adds, replaces, removes or adds a relation to: `diagram checkout`. */
  readonly block: string | null;
  /** The new text: a file, a block, or a relation statement. */
  readonly text: string;
  readonly reason: string;
  /** What the item changes, by itself. */
  readonly changes: readonly ModelChange[];
}

export interface Proposal {
  readonly format: typeof PROPOSAL_FORMAT;
  readonly version: typeof PROPOSAL_VERSION;
  readonly operation: AssistOperation;
  /** The file the proposal changes or creates. */
  readonly path: string;
  /** The revision the proposal was made against: a hash of `baseText`. */
  readonly baseRevision: string;
  /** The text of the file then; empty for a new file. */
  readonly baseText: string;
  readonly summary: string;
  /** Import statements the accepted items need. */
  readonly imports: readonly string[];
  readonly items: readonly ProposalItem[];
  readonly provider: string;
  readonly model: string;
}

/** A short, stable hash of a text, as a revision. */
export function revisionOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

interface BlockSpan {
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

/** The top-level blocks of a text by `<kind> <id>`, with where they are. */
export function blocksOf(
  text: string,
  compilation: Compilation = compile(text),
): Map<string, BlockSpan> {
  const document = compilation.document;
  const spans = new Map<string, BlockSpan>();
  const add = (
    kind: string,
    id: string,
    range: { start: { offset: number }; end: { offset: number } },
  ) => {
    const key = `${kind} ${id}`;
    if (!spans.has(key)) spans.set(key, { key, start: range.start.offset, end: range.end.offset });
  };
  for (const d of document.diagrams) add("diagram", d.id, d.range);
  for (const m of document.models) add("model", m.id, m.range);
  for (const s of document.stories) add("story", s.id, s.range);
  for (const t of document.themes) add("theme", t.id, t.range);
  for (const e of document.exports) add("export", e.id, e.range);
  return spans;
}

/** `diagram checkout` from what a model wrote: case and spaces forgiven. */
function blockKey(text: string): string | null {
  const match = /^\s*(diagram|model|story|theme|export)\s+([A-Za-z_][\w.-]*)\s*$/i.exec(text);
  return match ? `${match[1]!.toLowerCase()} ${match[2]}` : null;
}

/**
 * The JSON object of an answer, inside code fences or prose if the model added them. Its errors
 * are for people, in the interface language.
 */
export function parseAnswer(text: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(messages().proposal.noJsonObject);
  const value = JSON.parse(candidate.slice(start, end + 1)) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(messages().proposal.notJsonObject);
  }
  return value as Record<string, unknown>;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const EMPTY: Document = {
  language: null,
  imports: [],
  diagrams: [],
  themes: [],
  models: [],
  stories: [],
  exports: [],
  unsupported: [],
};

/** Inserts import statements that are not in the text yet, after its header and imports. */
export function withImports(text: string, imports: readonly string[]): string {
  const missing = imports.map((i) => i.trim()).filter((i) => i !== "" && !text.includes(i));
  if (missing.length === 0) return text;
  const lines = text.split("\n");
  let at = 0;
  lines.forEach((line, i) => {
    if (/^\s*(language\s+"|import\s)/.test(line)) at = i + 1;
  });
  lines.splice(at, 0, ...(at === 0 ? [...missing, ""] : missing));
  return lines.join("\n");
}

/** The indentation inside a block: that of its first statement, or two spaces. */
function innerIndent(blockText: string): string {
  const match = /\{\s*\n([ \t]+)\S/.exec(blockText);
  return match ? match[1]! : "  ";
}

/** Applies items to a text whose blocks are where `spans` says; items in any order. */
function applyItems(
  text: string,
  items: readonly ProposalItem[],
  spans: ReadonlyMap<string, BlockSpan>,
): string {
  const edits: { start: number; end: number; text: string }[] = [];
  const appended: string[] = [];
  for (const item of items) {
    const span = item.block ? spans.get(item.block) : undefined;
    switch (item.action) {
      case "create":
        return item.text;
      case "add":
        appended.push(item.text.trim());
        break;
      case "replace":
        if (span) edits.push({ start: span.start, end: span.end, text: item.text.trim() });
        break;
      case "remove":
        if (span) {
          // The block and the blank line after it.
          const after = /^\n?\n?/.exec(text.slice(span.end))![0].length;
          edits.push({ start: span.start, end: span.end + Math.min(after, 1), text: "" });
        }
        break;
      case "relation":
        if (span) {
          const block = text.slice(span.start, span.end);
          const statement = `${innerIndent(block)}${item.text.trim()}`;
          // On its own line before the first placement, style or animate block, or the closing
          // brace; a block written on one line gets a line of its own.
          const tail = /\n[ \t]*(placement|style|animate|scenario|class|rule)\b/.exec(block);
          const close = block.lastIndexOf("}");
          const line = tail ? tail.index + 1 : block.lastIndexOf("\n", close) + 1;
          if (line <= 0 || (!tail && block.slice(line, close).trim() !== "")) {
            const at = span.start + close;
            edits.push({ start: at, end: at, text: `\n${statement}\n` });
          } else {
            const at = span.start + line;
            edits.push({ start: at, end: at, text: `${statement}\n` });
          }
        }
        break;
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let result = text;
  for (const edit of edits)
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  if (appended.length > 0) {
    result = `${result.replace(/\s*$/, "")}\n\n${appended.join("\n\n")}\n`;
  }
  return result;
}

/** Error diagnostics of `after` that `before` does not have, by code and message. */
export function newErrors(
  before: readonly Diagnostic[],
  after: readonly Diagnostic[],
): Diagnostic[] {
  const counts = new Map<string, number>();
  for (const d of before) {
    if (d.severity !== "error") continue;
    const key = `${d.code}|${d.message}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const added: Diagnostic[] = [];
  for (const d of after) {
    if (d.severity !== "error") continue;
    const key = `${d.code}|${d.message}`;
    const left = counts.get(key) ?? 0;
    if (left > 0) counts.set(key, left - 1);
    else added.push(d);
  }
  return added;
}

export interface ProposalSource {
  readonly operation: AssistOperation;
  readonly path: string;
  readonly baseText: string;
  readonly answer: Record<string, unknown>;
  readonly provider: string;
  readonly model: string;
  /**
   * The document of a text of the file in its project, so that views of imported models and
   * imported diagrams compare as drawn; the file on its own when absent.
   */
  readonly documentOf?: (text: string) => Document;
  /**
   * The language of the words a proposal writes into the file, as the files a command writes:
   * the reason of a relation the model gave none. English when absent, never the interface's.
   */
  readonly locale?: Locale;
}

/**
 * The proposal of an answer: its items, each with the semantic changes it makes by itself.
 * Items that name blocks the file does not have, or say nothing, are left out.
 */
export function buildProposal(source: ProposalSource): Proposal {
  const { answer, baseText } = source;
  const base = compile(baseText);
  const spans = blocksOf(baseText, base);
  const drafts: Omit<ProposalItem, "id" | "changes">[] = [];
  if (source.operation === "generate") {
    const file = str(answer.file);
    if (file.trim() !== "") {
      drafts.push({
        action: "create",
        block: null,
        text: file.endsWith("\n") ? file : `${file}\n`,
        reason: str(answer.summary),
      });
    }
  } else if (source.operation === "modify") {
    for (const raw of Array.isArray(answer.changes) ? answer.changes : []) {
      const change = raw as Record<string, unknown>;
      const action = str(change.action);
      const block = blockKey(str(change.block));
      const text = str(change.text);
      if (block === null) continue;
      if (action === "replace" && spans.has(block) && text.trim() !== "") {
        drafts.push({ action, block, text, reason: str(change.reason) });
      } else if (action === "add" && !spans.has(block) && text.trim() !== "") {
        drafts.push({ action, block, text, reason: str(change.reason) });
      } else if (action === "remove" && spans.has(block)) {
        drafts.push({ action, block, text: "", reason: str(change.reason) });
      }
    }
  } else {
    for (const raw of Array.isArray(answer.relations) ? answer.relations : []) {
      const relation = raw as Record<string, unknown>;
      const block = blockKey(str(relation.block));
      const from = str(relation.from).trim();
      const to = str(relation.to).trim();
      const reason =
        str(relation.reason).trim() || messages(source.locale ?? "en").proposal.inferred;
      if (block === null || !spans.has(block) || !/^[\w.-]+$/.test(from) || !/^[\w.-]+$/.test(to)) {
        continue;
      }
      const label = str(relation.label).trim();
      const quote = (s: string) => JSON.stringify(s);
      drafts.push({
        action: "relation",
        block,
        text: `${from} -> ${to}${label ? `: ${quote(label)}` : ""} { assumption ${quote(reason)} }`,
        reason,
      });
    }
  }
  const imports = (Array.isArray(answer.imports) ? answer.imports : [])
    .map((i) => str(i).trim())
    .filter((i) => /^import\s/.test(i));
  const documentOf = source.documentOf ?? ((text: string) => compile(text).document);
  const baseDocument = baseText === "" ? EMPTY : documentOf(baseText);
  const items = drafts.map((draft, i): ProposalItem => {
    const alone = applyItems(
      withImports(baseText, imports),
      [{ ...draft, id: 0, changes: [] }],
      blocksOf(withImports(baseText, imports)),
    );
    return { ...draft, id: i + 1, changes: diffDocuments(baseDocument, documentOf(alone)) };
  });
  return {
    format: PROPOSAL_FORMAT,
    version: PROPOSAL_VERSION,
    operation: source.operation,
    path: source.path,
    baseRevision: revisionOf(baseText),
    baseText,
    summary: str(answer.summary),
    imports,
    items,
    provider: source.provider,
    model: source.model,
  };
}

export type ApplyResult =
  | {
      readonly ok: true;
      readonly text: string;
      /** Items applied, and items left out because their block changed since the proposal. */
      readonly applied: readonly number[];
      readonly conflicts: readonly number[];
    }
  | {
      readonly ok: false;
      /** Why: new errors of the result, or no item to apply. */
      readonly problems: readonly string[];
      readonly conflicts: readonly number[];
    };

/**
 * Applies the accepted items of a proposal to the file's current text. When the text changed
 * since the proposal, items whose block changed (or appeared) are left out as conflicts and the
 * rest apply. The result is refused when `check` finds errors the current text does not have.
 */
export function applyProposal(
  proposal: Proposal,
  currentText: string,
  accepted: readonly number[],
  check: (text: string) => readonly Diagnostic[],
): ApplyResult {
  const chosen = proposal.items.filter((item) => accepted.includes(item.id));
  const conflicts: number[] = [];
  const baseSpans = blocksOf(proposal.baseText);
  const currentSpans = blocksOf(currentText);
  const usable = chosen.filter((item) => {
    if (currentText === proposal.baseText) return true;
    let ok: boolean;
    // A new file applies only to the empty file it was proposed for.
    if (item.action === "create") ok = false;
    else if (item.action === "add") ok = !currentSpans.has(item.block!);
    else if (item.action === "relation") ok = currentSpans.has(item.block!);
    else {
      const was = baseSpans.get(item.block!);
      const now = currentSpans.get(item.block!);
      ok =
        was !== undefined &&
        now !== undefined &&
        proposal.baseText.slice(was.start, was.end) === currentText.slice(now.start, now.end);
    }
    if (!ok) conflicts.push(item.id);
    return ok;
  });
  if (usable.length === 0) {
    return {
      ok: false,
      problems: [chosen.length === 0 ? messages().proposal.noItem : messages().proposal.allChanged],
      conflicts,
    };
  }
  const prepared = usable.some((i) => i.action === "create")
    ? currentText
    : withImports(currentText, proposal.imports);
  const text = applyItems(prepared, usable, blocksOf(prepared));
  const added = newErrors(currentText === "" ? [] : check(currentText), check(text));
  if (added.length > 0) {
    return {
      ok: false,
      problems: added.map(
        (d) => `${d.range.start.line}:${d.range.start.column} ${d.code} ${d.message}`,
      ),
      conflicts,
    };
  }
  return { ok: true, text, applied: usable.map((i) => i.id), conflicts };
}
