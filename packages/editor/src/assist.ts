import {
  applyProposal,
  assistMessages,
  disclosure,
  explainChanges,
  propose,
  type ApplyResult,
  type AssistOperation,
  type AssistRequest,
  type Disclosure,
  type ModelAdapter,
  type Proposal,
  type SharedFile,
} from "@meltemi/diagrams-assist";
import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { compile, describeChange, type Document } from "@meltemi/diagrams-model";
import { relativePath, type FileCompilation, type Workspace } from "@meltemi/diagrams-project";
import type { Review } from "./review.js";

/** Most project files a request shares for context, and most bytes. */
const MAX_SHARED_FILES = 12;
const MAX_SHARED_BYTES = 200_000;

export interface AssistInput {
  readonly workspace: Workspace;
  readonly operation: AssistOperation;
  /** The file to change or create, as a project path. */
  readonly path: string;
  readonly instruction: string;
  readonly profile?: AssistRequest["profile"];
  readonly block?: string;
  /**
   * The language of the words a proposal writes into the file, as the files a command writes:
   * the command line's `--lang`; the project's `locale`, else English, when absent.
   */
  readonly locale?: Locale;
}

/** A request ready to send, and what it will send. */
export interface PreparedAssist {
  readonly request: AssistRequest;
  readonly disclosure: (adapter: ModelAdapter) => Disclosure;
  /** Diagnostics of a text of the file in its project. */
  readonly check: (text: string) => readonly Diagnostic[];
  /** The document of a text of the file in its project. */
  readonly documentOf: (text: string) => Document;
  /** The language of the words a proposal writes into the file. */
  readonly locale: Locale;
}

/** Compiles a text of a file within its project: as an overlay, then the editor's overlay again. */
function inProject<T>(
  workspace: Workspace,
  path: string,
  read: (file: FileCompilation | undefined, text: string) => T,
): (text: string) => T {
  return (text) => {
    const previous = workspace.overlay(path);
    workspace.setOverlay(path, text);
    try {
      return read(workspace.file(path), text);
    } finally {
      workspace.setOverlay(path, previous ?? null);
    }
  };
}

/** The diagnostics of a text of a file within its project. */
export function checkInProject(workspace: Workspace, path: string): (text: string) => Diagnostic[] {
  return inProject(workspace, path, (file, text) => [
    ...(file?.diagnostics ?? compile(text).diagnostics),
  ]);
}

/** The document of a text of a file within its project. */
export function documentInProject(workspace: Workspace, path: string): (text: string) => Document {
  return inProject(workspace, path, (file, text) => (file?.compilation ?? compile(text)).document);
}

/**
 * What a request shares besides the file (decision 0029): the files it imports, transitively;
 * for a new file, the project's models and themes, which it may import. Paths are relative to the
 * project, so no local path is sent; the reasons are for the person, in the interface language.
 */
function sharedFor(input: AssistInput): SharedFile[] {
  const { workspace, path } = input;
  const root = workspace.root;
  const reasons = assistMessages().reasons;
  const shared: SharedFile[] = [];
  let bytes = 0;
  const add = (file: string, reason: string) => {
    if (file === path || shared.some((s) => s.path === relativePath(root, file))) return;
    const text = workspace.text(file);
    if (text === undefined || shared.length >= MAX_SHARED_FILES) return;
    if (bytes + text.length > MAX_SHARED_BYTES) return;
    bytes += text.length;
    shared.push({ path: relativePath(root, file), text, reason });
  };
  if (input.operation === "generate" && workspace.text(path) === undefined) {
    const program = workspace.compileProject();
    for (const [file, compiled] of program.files) {
      const document = compiled.compilation.document;
      if (document.models.length > 0) add(file, reasons.model);
      else if (document.themes.length > 0) add(file, reasons.themes);
    }
    return shared;
  }
  const visit = (file: string, seen: Set<string>) => {
    const compiled = workspace.file(file);
    for (const imported of compiled?.imports ?? []) {
      if (imported.target === null || seen.has(imported.target)) continue;
      seen.add(imported.target);
      add(imported.target, file === path ? reasons.importedByIt : reasons.importedByImport);
      visit(imported.target, seen);
    }
  };
  visit(path, new Set([path]));
  return shared;
}

/** Prepares a request on a file of a project: the text, the files shared, the check. */
export function prepareAssist(input: AssistInput): PreparedAssist {
  const { workspace, path } = input;
  const request: AssistRequest = {
    operation: input.operation,
    path: relativePath(workspace.root, path),
    text: workspace.text(path) ?? "",
    instruction: input.instruction,
    shared: sharedFor(input),
    ...(input.profile ? { profile: input.profile } : {}),
    ...(input.block ? { block: input.block } : {}),
  };
  return {
    request,
    disclosure: (adapter) => disclosure(request, adapter),
    check: checkInProject(workspace, path),
    documentOf: documentInProject(workspace, path),
    locale: input.locale ?? workspace.manifest().manifest?.locale ?? DEFAULT_LOCALE,
  };
}

/** Sends a prepared request and returns the proposal for the file at `path`. */
export async function runAssist(
  prepared: PreparedAssist,
  adapter: ModelAdapter,
  path: string,
  signal?: AbortSignal,
): Promise<Proposal & { readonly problems: readonly string[] }> {
  const proposal = await propose(prepared.request, {
    adapter,
    check: prepared.check,
    documentOf: prepared.documentOf,
    locale: prepared.locale,
    ...(signal ? { signal } : {}),
  });
  // The proposal is kept on this machine, so it names the file where it is.
  return { ...proposal, path };
}

/** Applies accepted items of a proposal to the file's current text in its project. */
export function applyAssist(
  workspace: Workspace,
  proposal: Proposal,
  accepted: readonly number[],
): ApplyResult {
  return applyProposal(
    proposal,
    workspace.text(proposal.path) ?? "",
    accepted,
    checkInProject(workspace, proposal.path),
  );
}

/** An explanation ready to send: the changes, the files shared, and what it will send. */
export interface PreparedExplain {
  readonly changes: string;
  readonly shared: readonly SharedFile[];
  readonly disclosure: (adapter: ModelAdapter) => Disclosure;
}

/**
 * Prepares the explanation of a review: its changes by file, with the changed files as they are
 * after, read with `textOf` from their review paths. The changes are written for the model, in
 * English; what the disclosure lists is in the interface language.
 */
export function prepareExplain(
  review: Review,
  textOf: (path: string) => string | undefined,
): PreparedExplain {
  const changes = review.files
    .map((file) =>
      [
        `${file.status} ${file.from ? `${file.from} → ` : ""}${file.path}`,
        ...file.changes.map(
          (c) => `  ${describeChange(c, "en")}${c.scope ? ` (in ${c.scope})` : ""}`,
        ),
      ].join("\n"),
    )
    .join("\n");
  const shared: SharedFile[] = [];
  let bytes = 0;
  for (const file of review.files) {
    if (file.status === "removed") continue;
    const text = textOf(file.path);
    if (text === undefined || shared.length >= MAX_SHARED_FILES) continue;
    if (bytes + text.length > MAX_SHARED_BYTES) continue;
    bytes += text.length;
    shared.push({ path: file.path, text, reason: assistMessages().reasons.changed });
  }
  const size = (text: string) => new TextEncoder().encode(text).length;
  return {
    changes,
    shared,
    disclosure: (adapter) => {
      const t = assistMessages();
      return {
        provider: adapter.provider,
        model: adapter.model,
        endpoint: adapter.endpoint,
        remote: adapter.remote,
        files: [
          { path: t.disclosure.changes, bytes: size(changes), reason: t.reasons.review },
          ...shared.map((f) => ({ path: f.path, bytes: size(f.text), reason: f.reason })),
        ],
        instruction: 0,
      };
    },
  };
}

/** Asks the model to explain a prepared review, in Markdown. */
export function runExplain(
  prepared: PreparedExplain,
  adapter: ModelAdapter,
  signal?: AbortSignal,
): Promise<{ summary: string; explanation: string }> {
  return explainChanges(prepared.changes, prepared.shared, adapter, signal);
}
