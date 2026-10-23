import { planEdit, type EditOperation } from "@meltemi/diagrams-edit";
import {
  arrangeOperation,
  convertOperation,
  exportFileName,
  formatDocument,
  renderDiagram,
} from "@meltemi/diagrams-editor";
import {
  capture,
  captureVideo,
  findBrowser,
  findFfmpeg,
  type VideoJob,
} from "@meltemi/diagrams-capture";
import {
  produceExport,
  profileOutputs,
  profileRequest,
  type CatalogBuild,
  type ExportRequest,
} from "@meltemi/diagrams-editor/node";
import type { FlowDiagram } from "@meltemi/diagrams-model";
import * as vscode from "vscode";
import { applyPlan, VIEW_TYPE, type CanvasHost } from "./canvas.js";
import { toWorkspaceEdit } from "./convert.js";
import { isMeltemi } from "./documents.js";
import { messages } from "./messages/index.js";
import { writtenMessage } from "./written.js";

/** The `.meltemi` document of the active text editor or canvas. */
export function activeDocument(
  host: CanvasHost,
  uri?: vscode.Uri,
): vscode.TextDocument | undefined {
  const target = uri ?? host.panels.active() ?? vscode.window.activeTextEditor?.document.uri;
  if (!target) return undefined;
  const document = vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === target.toString(),
  );
  return document && isMeltemi(document) ? document : undefined;
}

/**
 * Asks which scenario of a sequence diagram to export: every event, or one scenario. Undefined
 * when the question is dismissed.
 */
async function pickScenario(
  diagram: string,
  scenarios: readonly { readonly id: string; readonly label: string }[],
): Promise<{ scenario: string | undefined } | undefined> {
  const t = messages().exports;
  const items = [
    { label: t.allEvents, description: t.allEventsDetail, id: undefined },
    ...scenarios.map((s) => ({
      label: s.id,
      description: s.label,
      id: s.id as string | undefined,
    })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: t.exportDiagram(diagram),
    placeHolder: t.scenarioPlaceholder,
  });
  return picked ? { scenario: picked.id } : undefined;
}

/**
 * Writes the HTML player of a story, or of a diagram and its effects, beside the file:
 * `<stem>.<story>.html`, or named like the SVG export. Without a story, asks which one when the
 * file has more than one story or diagram. Returns the file written.
 */
export async function exportPlayer(
  host: CanvasHost,
  document: vscode.TextDocument,
  story?: string,
): Promise<vscode.Uri | undefined> {
  const t = messages();
  if (document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage(t.common.saveBeforeExporting);
    return undefined;
  }
  const analysis = host.analyses.now(document);
  const stories = analysis.compilation.document.stories;
  const choices = [
    ...stories.map((s) => ({
      label: s.id,
      description: s.title ?? undefined,
      detail: t.exports.story,
      target: "story" as const,
    })),
    ...analysis.diagrams.map((d) => ({
      label: d.id,
      description: d.title ?? undefined,
      detail: t.exports.diagramAndEffects,
      target: "diagram" as const,
    })),
  ];
  let choice =
    story !== undefined
      ? choices.find((c) => c.target === "story" && c.label === story)
      : undefined;
  if (!choice) {
    if (choices.length === 0) {
      void vscode.window.showWarningMessage(t.exports.nothingToPlay);
      return undefined;
    }
    choice =
      choices.length === 1
        ? choices[0]
        : await vscode.window.showQuickPick(choices, {
            title: t.exports.player,
            placeHolder: t.exports.playerPlaceholder,
          });
    if (!choice) return undefined;
  }
  const stem = document.uri.path.replace(/^.*\//, "").replace(/\.meltemi$/, "");
  const name =
    choice.target === "story"
      ? `${stem}.${choice.label}.html`
      : exportFileName(
          stem,
          choice.label,
          analysis.compilation.document.diagrams.length,
          undefined,
          "html",
        );
  const target = vscode.Uri.joinPath(document.uri, "..", name);
  // The same page as the command line writes: the project's content language, and for a diagram
  // every view a drill-down reaches from it.
  const context = host.analyses.exportContext(document, await host.playerScript());
  const label = choice.label;
  const chosenStory = context?.file.compilation.document.stories.find((s) => s.id === label);
  const diagram = context?.file.compilation.document.diagrams.find((d) => d.id === label);
  const output =
    context && (choice.target === "story" ? story : diagram)
      ? produceExport(context, {
          target:
            choice.target === "story"
              ? { kind: "story", story: chosenStory! }
              : { kind: "diagram", diagram: diagram!, owner: context.file },
          format: "html",
          theme: null,
          fonts: "embedded",
          motion: "static",
          at: null,
          scenario: undefined,
          scale: 1,
          size: null,
          background: null,
          link: null,
          embed: false,
          autoplay: false,
          loop: false,
          fps: null,
          durationMs: null,
          out: target.fsPath,
        })
      : undefined;
  if (!output || !("text" in output)) {
    const show = t.common.showProblems;
    const shown = await vscode.window.showWarningMessage(t.exports.cannotDraw(label), show);
    if (shown === show) await vscode.commands.executeCommand("workbench.actions.view.problems");
    return undefined;
  }
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(output.text));
  void vscode.window.showInformationMessage(t.common.wrote([name]));
  return target;
}

/** FFmpeg for videos: the setting, or the one on the path. */
function ffmpegFor(): string | undefined {
  const setting = vscode.workspace.getConfiguration("meltemi.export").get<string>("ffmpeg", "");
  return setting.trim() !== "" ? setting.trim() : (findFfmpeg() ?? undefined);
}

/** The browser that captures PNG and PDF: the setting, or an installed Edge or Chrome. */
function browserFor(): string | undefined {
  const setting = vscode.workspace.getConfiguration("meltemi.export").get<string>("browser", "");
  return setting.trim() !== "" ? setting.trim() : (findBrowser() ?? undefined);
}

/**
 * Writes the outputs of export requests beside the file: text at once, pictures through the
 * browser in one session. Returns the files written, or undefined after saying what went wrong.
 */
async function writeExports(
  outputs: { request: ExportRequest; output: ReturnType<typeof produceExport> }[],
): Promise<vscode.Uri[] | undefined> {
  const t = messages();
  const written: vscode.Uri[] = [];
  const pictures: { request: ExportRequest; job: Parameters<typeof capture>[0][number] }[] = [];
  const videos: VideoJob[] = [];
  const problems: string[] = [];
  // What the exports chose because nothing said: said with the files written.
  const notices: string[] = [];
  for (const { request, output } of outputs) {
    if ("problem" in output) {
      problems.push(output.problem);
      continue;
    }
    notices.push(...(output.notices ?? []));
    if ("text" in output) {
      const uri = vscode.Uri.file(request.out!);
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(output.text));
      written.push(uri);
    } else if ("video" in output) videos.push(output.video);
    else pictures.push({ request, job: output.job });
  }
  if (videos.length > 0) {
    const browser = browserFor();
    const ffmpeg = ffmpegFor();
    if (!browser || !ffmpeg) {
      void vscode.window.showErrorMessage(browser ? t.exports.noFfmpeg : t.exports.noBrowser);
      return undefined;
    }
    try {
      for (const video of videos) {
        const name = video.out.replace(/^.*[\\/]/, "");
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: t.exports.recording(name),
            cancellable: false,
          },
          (progress) => {
            let last = 0;
            return captureVideo(video, {
              browser,
              ffmpeg,
              onFrame: (done, total) => {
                const percent = Math.floor((done / total) * 100);
                progress.report({
                  increment: percent - last,
                  message: t.exports.frame(done, total),
                });
                last = percent;
              },
            });
          },
        );
        written.push(vscode.Uri.file(video.out));
      }
    } catch (error) {
      void vscode.window.showErrorMessage(t.exports.videoFailed((error as Error).message));
      return undefined;
    }
  }
  if (pictures.length > 0) {
    const browser = browserFor();
    if (!browser) {
      void vscode.window.showErrorMessage(t.exports.noBrowser);
      return undefined;
    }
    try {
      const { results } = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t.exports.exportingWithBrowser },
        () =>
          capture(
            pictures.map((p) => p.job),
            { browser },
          ),
      );
      for (const [i, { request }] of pictures.entries()) {
        const uri = vscode.Uri.file(request.out!);
        await vscode.workspace.fs.writeFile(uri, results[i]!);
        written.push(uri);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(t.exports.failed((error as Error).message));
      return undefined;
    }
  }
  if (problems.length > 0) void vscode.window.showWarningMessage(problems.join(" "));
  if (written.length > 0) {
    const names = written.map((u) => u.path.replace(/^.*\//, ""));
    void vscode.window.showInformationMessage(writtenMessage(t.common.wrote, names, notices));
  }
  return written;
}

/**
 * Writes the PNG or PDF of every renderable diagram of the current text beside the file, through
 * the installed browser; for sequence diagrams with scenarios, every event or the scenario the
 * user picks.
 */
export async function exportPicture(
  host: CanvasHost,
  document: vscode.TextDocument,
  format: "png" | "pdf",
): Promise<vscode.Uri[] | undefined> {
  const t = messages().common;
  if (document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage(t.saveBeforeExporting);
    return undefined;
  }
  const context = host.analyses.exportContext(document, await host.playerScript());
  if (!context) return undefined;
  const analysis = host.analyses.now(document);
  const stem = document.uri.path.replace(/^.*\//, "").replace(/\.meltemi$/, "");
  const folder = vscode.Uri.joinPath(document.uri, "..").fsPath;
  const outputs: { request: ExportRequest; output: ReturnType<typeof produceExport> }[] = [];
  const diagrams = context.file.compilation.document.diagrams.filter((d) => !d.hasErrors);
  for (const diagram of diagrams as FlowDiagram[]) {
    let scenario: string | undefined;
    if (diagram.scenarios.length > 0) {
      const choice = await pickScenario(diagram.id, diagram.scenarios);
      if (!choice) return undefined;
      scenario = choice.scenario;
    }
    const name = exportFileName(
      stem,
      diagram.id,
      analysis.compilation.document.diagrams.length,
      scenario,
      format,
    );
    const request: ExportRequest = {
      target: { kind: "diagram", diagram, owner: context.file },
      format,
      theme: null,
      fonts: "embedded",
      motion: "static",
      at: null,
      scenario,
      scale: 2,
      size: null,
      background: null,
      link: null,
      embed: false,
      autoplay: false,
      loop: false,
      fps: null,
      durationMs: null,
      out: vscode.Uri.joinPath(vscode.Uri.file(folder), name).fsPath,
    };
    outputs.push({ request, output: produceExport(context, request) });
  }
  if (outputs.length === 0) {
    void vscode.window.showWarningMessage(t.noDiagramToExport);
    return undefined;
  }
  return writeExports(outputs);
}

/**
 * Writes a video (MP4, WebM or GIF) of a story or of a diagram's effects beside the file, frame by
 * frame through the browser and FFmpeg. Without arguments, asks for the format and the target.
 */
export async function exportVideo(
  host: CanvasHost,
  document: vscode.TextDocument,
  format?: "mp4" | "webm" | "gif",
  chosenTarget?: string,
  durationMs?: number,
): Promise<vscode.Uri[] | undefined> {
  const t = messages();
  if (document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage(t.common.saveBeforeExporting);
    return undefined;
  }
  const context = host.analyses.exportContext(document, await host.playerScript());
  if (!context) return undefined;
  const chosenFormat =
    format ??
    (
      await vscode.window.showQuickPick(
        [
          { label: "MP4", description: "H.264, 1920 × 1080, 30 fps", format: "mp4" as const },
          { label: "WebM", description: "VP9, 1920 × 1080, 30 fps", format: "webm" as const },
          { label: "GIF", description: "960 × 540, 15 fps", format: "gif" as const },
        ],
        { title: t.exports.video, placeHolder: t.exports.formatPlaceholder },
      )
    )?.format;
  if (!chosenFormat) return undefined;
  const document_ = context.file.compilation.document;
  const targets = [
    ...document_.stories.map((s) => ({
      label: s.id,
      description: s.title ?? t.exports.storyDescription,
      target: "story" as const,
    })),
    ...document_.diagrams
      .filter((d) => !d.hasErrors)
      .map((d) => ({
        label: d.id,
        description: t.exports.diagramEffects(d.type),
        target: "diagram" as const,
      })),
  ];
  const picked =
    targets.find((target) => target.label === chosenTarget) ??
    (targets.length === 1
      ? targets[0]
      : await vscode.window.showQuickPick(targets, {
          title: t.exports.video,
          placeHolder: t.exports.videoPlaceholder,
        }));
  if (!picked) return undefined;
  const stem = document.uri.path.replace(/^.*\//, "").replace(/\.meltemi$/, "");
  const name = `${stem}.${picked.label}.${chosenFormat}`;
  const request: ExportRequest = {
    target:
      picked.target === "story"
        ? { kind: "story", story: document_.stories.find((s) => s.id === picked.label)! }
        : {
            kind: "diagram",
            diagram: document_.diagrams.find((d) => d.id === picked.label)!,
            owner: context.file,
          },
    format: chosenFormat,
    theme: null,
    fonts: "embedded",
    motion: "static",
    at: null,
    scenario: undefined,
    scale: 1,
    size: null,
    background: null,
    link: null,
    embed: false,
    autoplay: false,
    loop: false,
    fps: null,
    // Effects that repeat forever, or none, take the export's default; the message names it.
    durationMs: durationMs ?? null,
    out: vscode.Uri.joinPath(document.uri, "..", name).fsPath,
  };
  return writeExports([{ request, output: produceExport(context, request) }]);
}

/**
 * Builds the catalog of a project (decision 0027): the project of `target` (a file or folder),
 * of the active document, or of the first workspace folder. Writes it where the project's
 * `catalog.out` says and offers to open it in the browser.
 */
export async function buildCatalogCommand(
  host: CanvasHost,
  target?: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  const t = messages().catalog;
  const chosen = target ?? activeDocument(host)?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!chosen || chosen.scheme !== "file") {
    void vscode.window.showWarningMessage(t.openProjectFirst);
    return undefined;
  }
  const isFolder = (await vscode.workspace.fs.stat(chosen)).type === vscode.FileType.Directory;
  const script = await host.catalogScript();
  let build: CatalogBuild;
  try {
    build = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.building },
      async () =>
        host.analyses.catalog(chosen, isFolder, {
          generator: host.generator,
          script: () => script,
        }),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(t.failed((error as Error).message));
    return undefined;
  }
  const notes = [
    ...build.skipped.map((s) => t.skipped(s.path.replace(/^.*\//, ""), s.id, s.reason)),
    ...build.warnings,
  ];
  if (notes.length > 0) void vscode.window.showWarningMessage(notes.join(" "));
  if (build.data.entries.length === 0) {
    void vscode.window.showWarningMessage(t.empty);
    return undefined;
  }
  const uri = vscode.Uri.file(build.out);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(build.html));
  const diagrams = build.data.entries.filter((e) => e.kind === "diagram").length;
  const stories = build.data.entries.length - diagrams;
  const open = t.openInBrowser;
  void vscode.window
    .showInformationMessage(
      t.written(vscode.workspace.asRelativePath(uri), diagrams, stories),
      open,
    )
    .then((choice) => {
      if (choice === open) void vscode.env.openExternal(uri);
    });
  return uri;
}

/**
 * Runs an export profile of the file, or every profile: `profile` names one, otherwise the user
 * picks. Files go where the profiles say, beside the file by default.
 */
export async function runExportProfile(
  host: CanvasHost,
  document: vscode.TextDocument,
  profile?: string,
): Promise<vscode.Uri[] | undefined> {
  const t = messages();
  if (document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage(t.common.saveBeforeExporting);
    return undefined;
  }
  const context = host.analyses.exportContext(document, await host.playerScript());
  if (!context) return undefined;
  const profiles = context.file.compilation.document.exports;
  if (profiles.length === 0) {
    void vscode.window.showWarningMessage(t.exports.noProfile);
    return undefined;
  }
  let chosen = profile !== undefined ? profiles.filter((p) => p.id === profile) : [];
  if (chosen.length === 0) {
    const all = { label: t.exports.allProfiles, description: `${profiles.length}`, id: undefined };
    const items = [
      ...profiles.map((p) => ({
        label: p.id,
        description: t.exports.profileOf(p.format ?? "?", p.target.name),
        id: p.id as string | undefined,
      })),
      ...(profiles.length > 1 ? [all] : []),
    ];
    const picked =
      items.length === 1
        ? items[0]
        : await vscode.window.showQuickPick(items, {
            title: t.exports.profile,
            placeHolder: t.exports.profilePlaceholder,
          });
    if (!picked) return undefined;
    chosen = picked.id === undefined ? [...profiles] : profiles.filter((p) => p.id === picked.id);
  }
  const stem = document.uri.path.replace(/^.*\//, "").replace(/\.meltemi$/, "");
  const folder = vscode.Uri.joinPath(document.uri, "..").fsPath;
  const outputs: { request: ExportRequest; output: ReturnType<typeof produceExport> }[] = [];
  const refused: string[] = [];
  for (const p of chosen) {
    const request = profileRequest(context, p, stem, profileOutputs(folder, undefined, folder));
    if (typeof request === "string") refused.push(`${p.id}: ${request}`);
    else outputs.push({ request, output: produceExport(context, request) });
  }
  if (refused.length > 0) void vscode.window.showWarningMessage(refused.join(" "));
  for (const { request } of outputs) {
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(vscode.Uri.file(request.out!), ".."),
    );
  }
  return writeExports(outputs);
}

/**
 * Writes the SVG of every renderable diagram of the current text beside the file; for sequence
 * diagrams with scenarios, every event or the scenario the user picks.
 */
export async function exportSvg(host: CanvasHost, document: vscode.TextDocument): Promise<void> {
  const t = messages();
  const analysis = host.analyses.now(document);
  const count = analysis.compilation.document.diagrams.length;
  const stem = document.uri.path.replace(/^.*\//, "").replace(/\.meltemi$/, "");
  const folder = vscode.Uri.joinPath(document.uri, "..");
  if (document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage(t.common.saveBeforeExporting);
    return;
  }
  const written: string[] = [];
  const skipped: string[] = [];
  for (const view of analysis.diagrams) {
    let scenario: string | undefined;
    if (view.diagram.scenarios.length > 0 && view.layout?.scene) {
      const choice = await pickScenario(view.id, view.diagram.scenarios);
      if (!choice) return;
      scenario = choice.scenario;
    }
    const rendered = renderDiagram(analysis, view.id, scenario ? { scenario } : {});
    if (!rendered) {
      skipped.push(view.id);
      continue;
    }
    const name = exportFileName(stem, view.id, count, scenario);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder, name),
      new TextEncoder().encode(rendered.svg),
    );
    written.push(name);
  }
  if (skipped.length > 0) {
    const show = t.common.showProblems;
    const choice = await vscode.window.showWarningMessage(
      t.exports.notExported(skipped, written),
      show,
    );
    if (choice === show) await vscode.commands.executeCommand("workbench.actions.view.problems");
  } else if (written.length > 0) {
    void vscode.window.showInformationMessage(t.common.wrote(written));
  } else {
    void vscode.window.showWarningMessage(t.common.noDiagramToExport);
  }
}

async function arrange(
  host: CanvasHost,
  document: vscode.TextDocument,
  scope: "unplaced" | "all",
): Promise<string> {
  const analysis = host.analyses.now(document);
  const current = host.panels.get(document.uri)?.session.current;
  const ids = current ? [current] : analysis.diagrams.map((d) => d.id);
  const operations = ids
    .map((id) => arrangeOperation(analysis, id, scope))
    .filter((o): o is EditOperation => o !== undefined);
  if (operations.length === 0) {
    const message = messages().commands.fixBeforeArranging;
    void vscode.window.showWarningMessage(message);
    return message;
  }
  const result = planEdit(
    analysis.compilation,
    operations.length === 1 ? operations[0]! : { kind: "batch", operations },
    { revision: analysis.revision },
  );
  if (!result.ok) {
    void vscode.window.showWarningMessage(result.rejection.reason);
    return result.rejection.reason;
  }
  if (result.plan.edits.length === 0) {
    void vscode.window.showInformationMessage(messages().commands.positionsWritten);
    return "unchanged";
  }
  return (await applyPlan(document, result.plan)) ? "arranged" : "the text changed";
}

/**
 * Copies the flow diagram shown on the canvas, or the one under the text cursor, into a new free
 * diagram, and shows it on the canvas. Returns the id of the copy.
 */
/**
 * Shows the model of the C4 view on the canvas, or under the cursor: in this document or in the
 * imported file. Returns the model's file, or a reason.
 */
export async function openModel(host: CanvasHost, document: vscode.TextDocument): Promise<string> {
  const analysis = host.analyses.now(document);
  const panel = host.panels.get(document.uri);
  const editor = vscode.window.visibleTextEditors.find((e) => e.document === document);
  const offset = editor ? document.offsetAt(editor.selection.active) : -1;
  const views = analysis.diagrams.filter((d) => d.diagram.type === "c4");
  const view =
    views.find((d) => d.id === panel?.session.current) ??
    views.find((d) => d.diagram.node.start <= offset && offset <= d.diagram.node.end) ??
    views[0];
  const resolved = view?.diagram.c4?.resolved;
  if (!resolved) {
    const message = messages().commands.noModelView;
    void vscode.window.showWarningMessage(message);
    return message;
  }
  const uri = resolved.file === null ? document.uri : vscode.Uri.file(resolved.file);
  const target = await vscode.workspace.openTextDocument(uri);
  const range = resolved.definition.idRange;
  const selection = new vscode.Range(
    range.start.line - 1,
    range.start.column - 1,
    range.end.line - 1,
    range.end.column - 1,
  );
  await vscode.window.showTextDocument(target, { selection, viewColumn: vscode.ViewColumn.One });
  return uri.fsPath;
}

async function convertToFree(host: CanvasHost, document: vscode.TextDocument): Promise<string> {
  const analysis = host.analyses.now(document);
  const panel = host.panels.get(document.uri);
  const editor = vscode.window.visibleTextEditors.find((e) => e.document === document);
  const offset = editor ? document.offsetAt(editor.selection.active) : -1;
  const atCursor = analysis.diagrams.find(
    (d) => d.diagram.node.start <= offset && offset <= d.diagram.node.end,
  );
  const flows = analysis.diagrams.filter((d) => d.diagram.type === "flow");
  const id =
    panel?.session.current ?? (atCursor?.diagram.type === "flow" ? atCursor.id : flows[0]?.id);
  const operation = id ? convertOperation(analysis, id) : undefined;
  if (!operation) {
    const message = messages().commands.noFlowDiagram;
    void vscode.window.showWarningMessage(message);
    return message;
  }
  if (panel) {
    await panel.receive({
      type: "action",
      revision: analysis.revision,
      action: { kind: "convert" },
    });
    return operation.id;
  }
  const result = planEdit(analysis.compilation, operation, { revision: analysis.revision });
  if (!result.ok) {
    void vscode.window.showWarningMessage(result.rejection.reason);
    return result.rejection.reason;
  }
  return (await applyPlan(document, result.plan)) ? operation.id : "the text changed";
}

export function registerCommands(host: CanvasHost): vscode.Disposable[] {
  // Commands return what they did, so that scripts and tests can check it.
  const withDocument =
    (run: (document: vscode.TextDocument) => unknown) =>
    async (uri?: vscode.Uri): Promise<unknown> => {
      const document = activeDocument(host, uri instanceof vscode.Uri ? uri : undefined);
      if (!document) {
        void vscode.window.showWarningMessage(messages().common.openMeltemiFirst);
        return "no document";
      }
      return run(document);
    };
  return [
    vscode.commands.registerCommand(
      "meltemi.openCanvasToSide",
      withDocument(async (document) => {
        host.opening.userOpened(document.uri.toString());
        await vscode.commands.executeCommand("vscode.openWith", document.uri, VIEW_TYPE, {
          viewColumn: vscode.ViewColumn.Beside,
          preserveFocus: true,
        });
      }),
    ),
    vscode.commands.registerCommand(
      "meltemi.openCanvas",
      withDocument(async (document) => {
        host.opening.userOpened(document.uri.toString());
        await vscode.commands.executeCommand("vscode.openWith", document.uri, VIEW_TYPE);
      }),
    ),
    vscode.commands.registerCommand(
      "meltemi.showSource",
      withDocument(async (document) => {
        const editor = vscode.window.visibleTextEditors.find((e) => e.document === document);
        await vscode.window.showTextDocument(document, {
          viewColumn: editor?.viewColumn ?? vscode.ViewColumn.Beside,
        });
      }),
    ),
    vscode.commands.registerCommand(
      "meltemi.exportSvg",
      withDocument((document) => host.exportSvg(document)),
    ),
    vscode.commands.registerCommand(
      "meltemi.exportPng",
      withDocument((document) => exportPicture(host, document, "png")),
    ),
    vscode.commands.registerCommand("meltemi.buildCatalog", (uri?: vscode.Uri) =>
      buildCatalogCommand(host, uri instanceof vscode.Uri ? uri : undefined),
    ),
    vscode.commands.registerCommand(
      "meltemi.exportVideo",
      (uri?: vscode.Uri, format?: "mp4" | "webm" | "gif", target?: string, durationMs?: number) => {
        const document = activeDocument(host, uri instanceof vscode.Uri ? uri : undefined);
        if (!document) {
          void vscode.window.showWarningMessage(messages().common.openMeltemiFirst);
          return undefined;
        }
        return exportVideo(host, document, format, target, durationMs);
      },
    ),
    vscode.commands.registerCommand(
      "meltemi.exportPdf",
      withDocument((document) => exportPicture(host, document, "pdf")),
    ),
    vscode.commands.registerCommand(
      "meltemi.runExportProfile",
      (uri?: vscode.Uri, profile?: string) => {
        const document = activeDocument(host, uri instanceof vscode.Uri ? uri : undefined);
        if (!document) {
          void vscode.window.showWarningMessage(messages().common.openMeltemiFirst);
          return undefined;
        }
        return runExportProfile(host, document, typeof profile === "string" ? profile : undefined);
      },
    ),
    vscode.commands.registerCommand("meltemi.exportPlayer", (uri?: vscode.Uri, story?: string) => {
      const document = activeDocument(host, uri instanceof vscode.Uri ? uri : undefined);
      if (!document) {
        void vscode.window.showWarningMessage(messages().common.openMeltemiFirst);
        return undefined;
      }
      return host.exportPlayer(document, typeof story === "string" ? story : undefined);
    }),
    vscode.commands.registerCommand(
      "meltemi.arrangeUnplaced",
      withDocument((document) => arrange(host, document, "unplaced")),
    ),
    vscode.commands.registerCommand(
      "meltemi.recomputeLayout",
      withDocument((document) => arrange(host, document, "all")),
    ),
    vscode.commands.registerCommand(
      "meltemi.convertToFree",
      withDocument((document) => convertToFree(host, document)),
    ),
    vscode.commands.registerCommand(
      "meltemi.openModel",
      withDocument((document) => openModel(host, document)),
    ),
    vscode.commands.registerCommand(
      "meltemi.formatDocument",
      withDocument(async (document) => {
        const edits = formatDocument(host.analyses.now(document));
        if (edits.length > 0) await vscode.workspace.applyEdit(toWorkspaceEdit(document, edits));
      }),
    ),
  ];
}
