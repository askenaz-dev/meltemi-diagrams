// Optional AI assistance in the editor (decision 0029): the provider comes from the settings, the
// key from VS Code's secret storage or the environment, never from files; what a request sends
// is shown first; answers become proposals the person accepts in part, as one undo step.
import {
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
} from "@meltemi/diagrams-editor/node";
import { describeChange } from "@meltemi/diagrams-model";
import { dirnamePath, joinPath, toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import * as vscode from "vscode";
import type { Analyses } from "./documents.js";
import { isMeltemi } from "./documents.js";
import { messages } from "./messages/index.js";

/** Where the key is kept: VS Code's secret storage, outside every file. */
export const ASSIST_SECRET = "meltemi.assist.apiKey";
const SCHEME = "meltemi-proposal";

/** Arguments for scripted use and tests: the request, the items to accept, consent given. */
interface AssistArgs {
  readonly instruction?: string;
  readonly profile?: "flow" | "c4" | "sequence" | "free";
  readonly accept?: "all" | readonly number[];
  readonly confirm?: boolean;
  readonly base?: string;
}

async function adapterOf(secrets: vscode.SecretStorage): Promise<ModelAdapter | undefined> {
  const config = vscode.workspace.getConfiguration("meltemi.assist");
  const setting = (name: string) => config.get<string>(name, "").trim() || undefined;
  const apiKey = (await secrets.get(ASSIST_SECRET)) || undefined;
  const provider = setting("provider");
  const model = setting("model");
  const baseUrl = setting("baseUrl");
  const adapter = adapterFor(
    {
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(apiKey ? { apiKey } : {}),
    },
    process.env,
  );
  if (typeof adapter !== "string") return adapter;
  const { openSettings, setKey } = messages().assist;
  const choice = await vscode.window.showErrorMessage(adapter, openSettings, setKey);
  if (choice === openSettings) {
    void vscode.commands.executeCommand("workbench.action.openSettings", "meltemi.assist");
  } else if (choice === setKey) void vscode.commands.executeCommand("meltemi.setAssistKey");
  return undefined;
}

/** Shows what a request sends; true when the person agrees. */
async function consent(disclosure: Disclosure, given: boolean | undefined): Promise<boolean> {
  if (given) return true;
  const [title, ...files] = describeDisclosure(disclosure);
  const send = messages().assist.send;
  const answer = await vscode.window.showWarningMessage(
    title!,
    { modal: true, detail: files.join("\n") },
    send,
  );
  return answer === send;
}

/** The proposed texts the diff editor shows, by URI. */
class ProposedTexts implements vscode.TextDocumentContentProvider {
  private readonly texts = new Map<string, string>();
  private count = 0;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.texts.get(uri.toString()) ?? "";
  }

  add(path: string, text: string): vscode.Uri {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${++this.count}/${name}` });
    this.texts.set(uri.toString(), text);
    return uri;
  }
}

/** The items to apply: given, or chosen after the proposal is shown beside the file. */
async function chooseItems(
  proposal: Proposal & { problems: readonly string[] },
  workspace: Workspace,
  texts: ProposedTexts,
  args: AssistArgs,
): Promise<number[] | undefined> {
  const t = messages().assist;
  const all = proposal.items.map((i) => i.id);
  if (proposal.items.length === 0) {
    void vscode.window.showInformationMessage(t.nothingToChange(proposal.summary));
    return undefined;
  }
  if (args.accept === "all") return all;
  if (args.accept) return [...args.accept];
  const whole = applyAssist(workspace, proposal, all);
  if (whole.ok) {
    const current = workspace.text(proposal.path) ?? "";
    await vscode.commands.executeCommand(
      "vscode.diff",
      texts.add(proposal.path, current),
      texts.add(proposal.path, whole.text),
      t.proposal(proposal.summary || proposal.path.slice(proposal.path.lastIndexOf("/") + 1)),
      { preview: true },
    );
  }
  const picks = await vscode.window.showQuickPick(
    proposal.items.map((item) => ({
      label: `${item.id}. ${item.action}${item.block ? ` ${item.block}` : ""}`,
      description: item.reason,
      detail:
        item.changes.map((change) => describeChange(change)).join(" · ") ||
        (item.action === "relation" ? item.text : ""),
      picked: true,
      id: item.id,
    })),
    {
      canPickMany: true,
      title: t.choose(proposal.summary, proposal.problems.length > 0),
      placeHolder: t.choosePlaceholder,
      ignoreFocusOut: true,
    },
  );
  return picks && picks.length > 0 ? picks.map((p) => p.id) : undefined;
}

/** Applies items: to the open document as one undo step, or to a new file. */
async function applyItems(
  workspace: Workspace,
  proposal: Proposal,
  ids: readonly number[],
  document: vscode.TextDocument | undefined,
): Promise<number[] | undefined> {
  const t = messages().assist;
  const result = applyAssist(workspace, proposal, ids);
  if (result.conflicts.length > 0) {
    void vscode.window.showWarningMessage(t.leftOut(result.conflicts));
  }
  if (!result.ok) {
    void vscode.window.showErrorMessage(t.notApplied(result.problems));
    return undefined;
  }
  if (document) {
    const edit = new vscode.WorkspaceEdit();
    const end = document.lineAt(document.lineCount - 1).range.end;
    edit.replace(document.uri, new vscode.Range(0, 0, end.line, end.character), result.text);
    await vscode.workspace.applyEdit(edit);
  } else {
    const uri = vscode.Uri.file(proposal.path);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(result.text));
    workspace.invalidate(proposal.path);
    await vscode.window.showTextDocument(uri);
  }
  return [...result.applied];
}

function activeMeltemi(uri: vscode.Uri | undefined): vscode.TextDocument | undefined {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  const document = vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === target?.toString(),
  );
  return document && isMeltemi(document) && document.uri.scheme === "file" ? document : undefined;
}

/** Modify or relations on an open file. */
async function onFile(
  analyses: Analyses,
  secrets: vscode.SecretStorage,
  texts: ProposedTexts,
  operation: "modify" | "relations",
  uri: vscode.Uri | undefined,
  args: AssistArgs,
): Promise<number[] | undefined> {
  const t = messages().assist;
  const document =
    activeMeltemi(uri) ?? (uri ? await vscode.workspace.openTextDocument(uri) : undefined);
  if (!document || !isMeltemi(document) || document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage(t.openSavedFirst);
    return undefined;
  }
  const adapter = await adapterOf(secrets);
  if (!adapter) return undefined;
  const instruction =
    args.instruction ??
    (operation === "modify"
      ? await vscode.window.showInputBox({
          title: t.modify,
          prompt: t.modifyPrompt,
          ignoreFocusOut: true,
        })
      : "");
  if (instruction === undefined || (operation === "modify" && instruction.trim() === "")) {
    return undefined;
  }
  const workspace = analyses.workspaceOf(document);
  const path = toProjectPath(document.uri.fsPath);
  const prepared = prepareAssist({ workspace, operation, path, instruction });
  if (!(await consent(prepared.disclosure(adapter), args.confirm))) return undefined;
  let proposal;
  try {
    proposal = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t.asking(adapter.model),
        cancellable: true,
      },
      (_progress, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        return runAssist(prepared, adapter, path, abort.signal);
      },
    );
  } catch (error) {
    void vscode.window.showErrorMessage(t.failed((error as Error).message));
    return undefined;
  }
  const ids = await chooseItems(proposal, workspace, texts, args);
  return ids ? applyItems(workspace, proposal, ids, document) : undefined;
}

/** A new sheet from a request. */
async function generate(
  analyses: Analyses,
  secrets: vscode.SecretStorage,
  texts: ProposedTexts,
  uri: vscode.Uri | undefined,
  args: AssistArgs,
): Promise<number[] | undefined> {
  const t = messages().assist;
  const folder =
    vscode.window.activeTextEditor?.document.uri.scheme === "file"
      ? vscode.Uri.joinPath(vscode.window.activeTextEditor.document.uri, "..")
      : vscode.workspace.workspaceFolders?.[0]?.uri;
  const target =
    uri ??
    (await vscode.window.showSaveDialog({
      title: t.generate,
      filters: { Meltemi: ["meltemi"] },
      ...(folder ? { defaultUri: vscode.Uri.joinPath(folder, "diagram.meltemi") } : {}),
    }));
  if (!target) return undefined;
  const adapter = await adapterOf(secrets);
  if (!adapter) return undefined;
  const instruction =
    args.instruction ??
    (await vscode.window.showInputBox({
      title: t.generate,
      prompt: t.generatePrompt,
      ignoreFocusOut: true,
    }));
  if (!instruction?.trim()) return undefined;
  const profile =
    args.profile ??
    (
      await vscode.window.showQuickPick(
        [
          { label: "flow", description: t.profiles.flow },
          { label: "c4", description: t.profiles.c4 },
          { label: "sequence", description: t.profiles.sequence },
          { label: "free", description: t.profiles.free },
        ],
        { title: t.startFrom },
      )
    )?.label;
  if (!profile) return undefined;
  const path = toProjectPath(target.fsPath);
  const workspace = analyses.projects.forFile(path);
  const prepared = prepareAssist({
    workspace,
    operation: "generate",
    path,
    instruction,
    profile: profile as NonNullable<AssistArgs["profile"]>,
  });
  if (!(await consent(prepared.disclosure(adapter), args.confirm))) return undefined;
  let proposal;
  try {
    proposal = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.asking(adapter.model) },
      () => runAssist(prepared, adapter, path),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(t.failed((error as Error).message));
    return undefined;
  }
  const ids = await chooseItems(proposal, workspace, texts, args);
  return ids ? applyItems(workspace, proposal, ids, undefined) : undefined;
}

/** Explains what changed in a file's project since a Git revision, in a Markdown document. */
async function explain(
  analyses: Analyses,
  secrets: vscode.SecretStorage,
  toolVersion: string,
  uri: vscode.Uri | undefined,
  args: AssistArgs,
): Promise<string | undefined> {
  const t = messages().assist;
  const target =
    uri ??
    vscode.window.activeTextEditor?.document.uri ??
    vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!target || target.scheme !== "file") {
    void vscode.window.showWarningMessage(t.openProjectFirst);
    return undefined;
  }
  const path = toProjectPath(target.fsPath);
  const isFolder = (await vscode.workspace.fs.stat(target)).type === vscode.FileType.Directory;
  const projects = analyses.projects;
  const afterWorkspace = isFolder ? projects.forFolder(path) : projects.forFile(path);
  const root = afterWorkspace.root;
  const host = gitRevisionHost(isFolder ? path : dirnamePath(path), args.base ?? "HEAD");
  if (typeof host === "string") {
    void vscode.window.showErrorMessage(host.replace("--before <path>", t.commandLine));
    return undefined;
  }
  const old = new ProjectSessions({ toolVersion, host });
  const beforeWorkspace = old.forFolder(root);
  const review = reviewProjects(
    { workspace: beforeWorkspace, projects: old, scope: null },
    { workspace: afterWorkspace, projects, scope: null },
    { images: false },
  );
  if (review.files.length === 0) {
    void vscode.window.showInformationMessage(t.nothingChanged);
    return undefined;
  }
  const adapter = await adapterOf(secrets);
  if (!adapter) return undefined;
  const prepared = prepareExplain(review, (relative) =>
    afterWorkspace.text(joinPath(root, relative)),
  );
  if (!(await consent(prepared.disclosure(adapter), args.confirm))) return undefined;
  try {
    const answer = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.asking(adapter.model) },
      () => runExplain(prepared, adapter),
    );
    const text = `# ${t.changesSince(args.base ?? "HEAD")}\n\n${answer.explanation.trim() || answer.summary}\n`;
    const document = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: text,
    });
    await vscode.window.showTextDocument(document, { preview: true });
    return text;
  } catch (error) {
    void vscode.window.showErrorMessage(t.failed((error as Error).message));
    return undefined;
  }
}

/** The commands of assistance. */
export function registerAssist(
  analyses: Analyses,
  secrets: vscode.SecretStorage,
  toolVersion: string,
): vscode.Disposable[] {
  const texts = new ProposedTexts();
  return [
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, texts),
    vscode.commands.registerCommand(
      "meltemi.assistModify",
      (uri?: vscode.Uri, args: AssistArgs = {}) =>
        onFile(
          analyses,
          secrets,
          texts,
          "modify",
          uri instanceof vscode.Uri ? uri : undefined,
          args,
        ),
    ),
    vscode.commands.registerCommand(
      "meltemi.assistRelations",
      (uri?: vscode.Uri, args: AssistArgs = {}) =>
        onFile(
          analyses,
          secrets,
          texts,
          "relations",
          uri instanceof vscode.Uri ? uri : undefined,
          args,
        ),
    ),
    vscode.commands.registerCommand(
      "meltemi.assistGenerate",
      (uri?: vscode.Uri, args: AssistArgs = {}) =>
        generate(analyses, secrets, texts, uri instanceof vscode.Uri ? uri : undefined, args),
    ),
    vscode.commands.registerCommand(
      "meltemi.assistExplain",
      (uri?: vscode.Uri, args: AssistArgs = {}) =>
        explain(analyses, secrets, toolVersion, uri instanceof vscode.Uri ? uri : undefined, args),
    ),
    vscode.commands.registerCommand("meltemi.setAssistKey", async (key?: string) => {
      const t = messages().assist;
      const value =
        key ??
        (await vscode.window.showInputBox({
          title: t.key,
          prompt: t.keyPrompt,
          password: true,
          ignoreFocusOut: true,
        }));
      if (!value?.trim()) return;
      await secrets.store(ASSIST_SECRET, value.trim());
      void vscode.window.showInformationMessage(t.keyStored);
    }),
    vscode.commands.registerCommand("meltemi.clearAssistKey", async () => {
      await secrets.delete(ASSIST_SECRET);
      void vscode.window.showInformationMessage(messages().assist.keyRemoved);
    }),
  ];
}
