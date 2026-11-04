import type { Locale } from "@meltemi/diagrams-i18n";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  PROPOSAL_FORMAT,
  adapterFor,
  describeDisclosure,
  type Disclosure,
  type ModelAdapter,
  type Proposal,
} from "@meltemi/diagrams-assist";
import {
  ProjectSessions,
  applyAssist,
  gitRevisionHost,
  prepareAssist,
  prepareExplain,
  reviewProjects,
  runAssist,
  runExplain,
  type ReviewSide,
} from "@meltemi/diagrams-editor/node";
import { describeChange } from "@meltemi/diagrams-model";
import { joinPath, toProjectPath } from "@meltemi/diagrams-project";
import { argumentsError, isYes, messages } from "./messages/index.js";

/** What the assist command needs from the CLI. */
export interface AssistContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  readonly display: (path: string) => string;
  readonly toolVersion: string;
  /** The language of what the command writes: `--lang`, when given. */
  readonly locale?: Locale;
  /** Where provider settings and keys come from; the process environment by default. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Asks the person a question in a terminal; absent when nobody can answer. */
  readonly ask?: (question: string) => Promise<string>;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;
const OPERATIONS = ["generate", "modify", "relations", "explain", "apply"] as const;
const PROFILES = ["flow", "c4", "sequence", "free"] as const;

interface Options {
  prompt?: string;
  profile?: string;
  block?: string;
  save?: string;
  apply?: string;
  items?: string;
  base?: string;
  before?: string;
  provider?: string;
  model?: string;
  "base-url"?: string;
  yes: boolean;
  json: boolean;
  help: boolean;
}

/** `all`, or a list of item numbers. */
function readItems(text: string | undefined, proposal: Proposal): number[] | string {
  if (text === undefined || text === "all") return proposal.items.map((i) => i.id);
  const ids = text.split(",").map((s) => Number(s.trim()));
  if (ids.some((id) => !proposal.items.some((i) => i.id === id))) {
    return messages().assist.items(
      proposal.items.map((i) => i.id),
      text,
    );
  }
  return ids;
}

function proposalLines(
  proposal: Proposal & { problems?: readonly string[] },
  display: string,
): string[] {
  const t = messages().assist;
  const lines = [
    t.proposal(display, proposal.baseRevision, proposal.provider, proposal.model, proposal.summary),
  ];
  if (proposal.items.length === 0) lines.push(t.nothingToChange);
  for (const item of proposal.items) {
    lines.push(
      `  ${item.id}. ${t.actions[item.action]}${item.block ? ` ${item.block}` : ""}${item.reason ? `: ${item.reason}` : ""}`,
    );
    if (item.action === "relation") lines.push(`       ${item.text}`);
    for (const change of item.changes) lines.push(`       ${describeChange(change)}`);
  }
  if (proposal.imports.length > 0) lines.push(t.imports(proposal.imports));
  for (const problem of proposal.problems ?? []) lines.push(t.together(problem));
  return lines;
}

/** `meltemi-diagrams assist`. */
export async function assistCommand(
  args: readonly string[],
  context: AssistContext,
): Promise<number> {
  const fail = (message: string, code = EXIT_USAGE) => {
    context.stderr(`${context.name} assist: ${message}\n`);
    return code;
  };
  const [operation, ...rest] = args;
  if (operation === undefined || operation === "-h" || operation === "--help") {
    context.stdout(messages().help.assist);
    return operation === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (!(OPERATIONS as readonly string[]).includes(operation)) {
    return fail(messages().assist.unknownOperation(operation, OPERATIONS));
  }
  let options: Options;
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...rest],
      options: {
        prompt: { type: "string" },
        profile: { type: "string" },
        block: { type: "string" },
        save: { type: "string" },
        apply: { type: "string" },
        items: { type: "string" },
        base: { type: "string" },
        before: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        "base-url": { type: "string" },
        yes: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as Options;
    paths = parsed.positionals;
  } catch (error) {
    return fail(argumentsError(error));
  }
  const t = messages().assist;
  if (options.help) {
    context.stdout(messages().help.assist);
    return EXIT_OK;
  }
  const projects = new ProjectSessions({ toolVersion: context.toolVersion, ...localeOf(context) });

  if (operation === "apply") {
    if (paths.length !== 1) return fail(t.proposalFile);
    let proposal: Proposal;
    try {
      proposal = JSON.parse(readFileSync(resolve(context.cwd, paths[0]!), "utf8")) as Proposal;
    } catch (error) {
      return fail(messages().common.cannotRead(paths[0]!, (error as Error).message));
    }
    if (proposal.format !== PROPOSAL_FORMAT) return fail(t.notAProposal(paths[0]!));
    return applyAndWrite(context, projects, proposal, options.items);
  }

  // What to send, and where.
  const adapter = adapterFor(
    {
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options["base-url"] !== undefined ? { baseUrl: options["base-url"] } : {}),
    },
    context.env,
  );
  if (typeof adapter === "string") return fail(adapter);

  if (operation === "explain") return explain(context, projects, adapter, paths, options);

  if (paths.length !== 1) return fail(t.oneFile(operation));
  const path = toProjectPath(resolve(context.cwd, paths[0]!));
  if (!path.endsWith(".meltemi")) return fail(t.notMeltemi(paths[0]!));
  const exists = existsSync(path);
  if (operation === "generate") {
    if (exists && readFileSync(path, "utf8").trim() !== "") {
      return fail(t.exists(context.display(path)));
    }
    if (
      options.profile !== undefined &&
      !(PROFILES as readonly string[]).includes(options.profile)
    ) {
      return fail(t.profile(options.profile, PROFILES));
    }
  } else if (!exists) return fail(`${messages().common.cannotRead(paths[0]!)}.`);
  const instruction = options.prompt?.trim() ?? "";
  if (operation !== "relations" && instruction === "") return fail(t.needsPrompt(operation));

  const workspace = projects.forFile(path);
  const prepared = prepareAssist({
    workspace,
    operation: operation as "generate" | "modify" | "relations",
    path,
    instruction,
    ...(options.profile ? { profile: options.profile as (typeof PROFILES)[number] } : {}),
    ...(options.block ? { block: options.block } : {}),
    // Words a proposal writes into the file: `--lang`, else the project's `locale`, else English.
    locale: projects.contentLocale(workspace),
  });
  if (!(await consent(context, prepared.disclosure(adapter), options.yes))) {
    return fail(messages().assist.notSent);
  }
  let proposal;
  try {
    proposal = await runAssist(prepared, adapter, path);
  } catch (error) {
    return fail((error as Error).message, EXIT_FINDINGS);
  }
  if (options.json) context.stdout(`${JSON.stringify(proposal, null, 2)}\n`);
  else context.stdout(`${proposalLines(proposal, context.display(path)).join("\n")}\n`);
  if (options.save !== undefined) {
    const target = resolve(context.cwd, options.save);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(proposal, null, 2)}\n`);
    if (!options.json) {
      context.stdout(`${t.saved(context.display(target), context.name)}\n`);
    }
  }
  if (options.apply !== undefined) return applyAndWrite(context, projects, proposal, options.apply);
  return EXIT_OK;
}

/** Shows what will be sent and asks, unless `--yes`; false when nothing may be sent. */
async function consent(
  context: AssistContext,
  disclosure: Disclosure,
  yes: boolean,
): Promise<boolean> {
  context.stderr(`${describeDisclosure(disclosure).join("\n")}\n`);
  if (yes) return true;
  if (!context.ask) return false;
  const answer = await context.ask(messages().assist.send);
  return isYes(answer);
}

function applyAndWrite(
  context: AssistContext,
  projects: ProjectSessions,
  proposal: Proposal,
  items: string | undefined,
): number {
  const ids = readItems(items, proposal);
  if (typeof ids === "string") {
    context.stderr(`${context.name} assist: ${ids}\n`);
    return EXIT_USAGE;
  }
  const t = messages().assist;
  const workspace = projects.forFile(proposal.path);
  const result = applyAssist(workspace, proposal, ids);
  if (result.conflicts.length > 0) {
    context.stderr(`${context.name} assist: ${t.conflicts(result.conflicts)}\n`);
  }
  if (!result.ok) {
    for (const problem of result.problems) context.stderr(`${context.name} assist: ${problem}\n`);
    context.stderr(`${context.name} assist: ${t.nothingWritten}\n`);
    return EXIT_FINDINGS;
  }
  mkdirSync(dirname(proposal.path), { recursive: true });
  writeFileSync(proposal.path, result.text);
  context.stdout(`${t.applied(result.applied, context.display(proposal.path))}\n`);
  return result.conflicts.length > 0 ? EXIT_FINDINGS : EXIT_OK;
}

async function explain(
  context: AssistContext,
  projects: ProjectSessions,
  adapter: ModelAdapter,
  paths: string[],
  options: Options,
): Promise<number> {
  const fail = (message: string, code = EXIT_USAGE) => {
    context.stderr(`${context.name} assist: ${message}\n`);
    return code;
  };
  if (paths.length > 1) return fail(messages().common.oneProjectFolderOrFile);
  const target = toProjectPath(resolve(context.cwd, paths[0] ?? "."));
  let isFolder: boolean;
  try {
    isFolder = statSync(target).isDirectory();
  } catch {
    return fail(messages().common.pathNotFound(paths[0] ?? "."));
  }
  const afterWorkspace = isFolder ? projects.forFolder(target) : projects.forFile(target);
  const scope = isFolder && target === afterWorkspace.root ? null : target;
  const after: ReviewSide = { workspace: afterWorkspace, projects, scope };
  let before: ReviewSide;
  if (options.before !== undefined) {
    const path = toProjectPath(resolve(context.cwd, options.before));
    const old = new ProjectSessions({ toolVersion: context.toolVersion, ...localeOf(context) });
    const workspace = isFolder ? old.forFolder(path) : old.forFile(path);
    before = { workspace, projects: old, scope: isFolder && path === workspace.root ? null : path };
  } else {
    const host = gitRevisionHost(isFolder ? target : dirname(target), options.base ?? "HEAD");
    if (typeof host === "string") return fail(host);
    const old = new ProjectSessions({
      toolVersion: context.toolVersion,
      host,
      ...localeOf(context),
    });
    const workspace = isFolder ? old.forFolder(target) : old.forFile(target);
    before = { workspace, projects: old, scope };
  }
  const review = reviewProjects(before, after, { images: false });
  if (review.files.length === 0) {
    context.stdout(`${messages().assist.noChanges}\n`);
    return EXIT_OK;
  }
  const folder = scope === null ? afterWorkspace.root : isFolder ? scope : dirname(scope);
  const prepared = prepareExplain(review, (path) =>
    afterWorkspace.text(isFolder ? joinPath(folder, path) : target),
  );
  if (!(await consent(context, prepared.disclosure(adapter), options.yes))) {
    return fail(messages().assist.notSent);
  }
  try {
    const answer = await runExplain(prepared, adapter);
    context.stdout(`${answer.explanation.trim() || answer.summary}\n`);
  } catch (error) {
    return fail((error as Error).message, EXIT_FINDINGS);
  }
  return EXIT_OK;
}

/** The session option for the language of written files, when the command was given one. */
function localeOf(context: { readonly locale?: Locale }): { locale?: Locale } {
  return context.locale ? { locale: context.locale } : {};
}
